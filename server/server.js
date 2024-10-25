const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const config = require('./config');

// Logger Konfiguration
const logger = winston.createLogger({
    level: config.logLevel,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ 
            filename: path.join(config.logPath, 'error.log'), 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: path.join(config.logPath, 'combined.log') 
        })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Express App initialisieren
const app = express();

// Rate Limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Minuten
    max: 100 // Limit pro IP
});

// Middleware
app.use(limiter);
app.use(cors());
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"]
        }
    }
}));
app.use(compression());
app.use(express.json());
app.use(express.static('public'));
app.use('/dist', express.static('public/dist'));
app.use(morgan('combined', {
    stream: fs.createWriteStream(path.join(config.logPath, 'access.log'), { flags: 'a' })
}));

// Datenbank Setup
const db = new sqlite3.Database(config.dbPath, (err) => {
    if (err) {
        logger.error('Fehler beim Verbinden zur Datenbank:', err);
        process.exit(1);
    }
    logger.info('Verbindung zur SQLite Datenbank hergestellt');
    
    // Schema initialisieren
    const schema = fs.readFileSync('./server/database/schema.sql', 'utf8');
    db.exec(schema, (err) => {
        if (err) {
            logger.error('Fehler beim Erstellen der Tabellen:', err);
        } else {
            logger.info('Datenbankschema initialisiert');
        }
    });

    // Optimierungen
    db.exec(`
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        PRAGMA temp_store=MEMORY;
        PRAGMA mmap_size=30000000000;
        PRAGMA cache_size=10000;
    `, (err) => {
        if (err) {
            logger.error('Fehler bei Datenbank-Optimierungen:', err);
        }
    });
});

// Upload Konfiguration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(config.uploadPath)) {
            fs.mkdirSync(config.uploadPath, { recursive: true });
        }
        cb(null, config.uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: config.maxUploadSize
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/json') {
            cb(null, true);
        } else {
            cb(new Error('Nur JSON Dateien sind erlaubt'));
        }
    }
});

// Hilfsfunktionen
const formatDate = (dateStr) => {
    try {
        const [date, time] = dateStr.split(' ');
        const [day, month, year] = date.split('-');
        return `${year}-${month}-${day} ${time}`;
    } catch (error) {
        logger.error('Fehler beim Formatieren des Datums:', error);
        return dateStr;
    }
};

const validateJsonData = (data) => {
    if (!Array.isArray(data)) {
        throw new Error('JSON muss ein Array von Untersuchungen sein');
    }

    const requiredFields = [
        'Modalität', 'Studiendatum', 'Studienbeschreibung', 'Anfragename',
        'Institution', 'Anfragende Abteilung', 'Anfragender Arzt', 'Überweiser',
        'Berfundverfasser', 'Patientengeschlecht', 'Patientenalter',
        'Diagnose', 'Untersuchungsstatus'
    ];

    data.forEach((item, index) => {
        requiredFields.forEach(field => {
            if (!(field in item)) {
                throw new Error(`Fehlender Pflichtfeld "${field}" im Datensatz ${index + 1}`);
            }
        });

        if (!item.Studiendatum.match(/^\d{2}-\d{2}-\d{4}/)) {
            throw new Error(`Ungültiges Datumsformat im Datensatz ${index + 1}`);
        }
    });

    return true;
};

// API Endpunkte
app.get('/api/studies', async (req, res) => {
    const page = parseInt(req.query.page) || 0;
    const limit = 200;
    const offset = page * limit;
    
    const query = `
        SELECT 
            rowid as id,
            modalitaet,
            studiendatum,
            studienbeschreibung,
            anfragename,
            institution,
            anfragende_abteilung,
            anfragender_arzt,
            ueberweiser,
            befundverfasser,
            patientengeschlecht,
            patientenalter,
            diagnose,
            untersuchungsstatus,
            created_at
        FROM studies 
        ORDER BY studiendatum DESC 
        LIMIT ? OFFSET ?
    `;

    try {
        const rows = await new Promise((resolve, reject) => {
            db.all(query, [limit, offset], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        res.json(rows);
    } catch (error) {
        logger.error('Datenbankfehler bei /api/studies:', error);
        res.status(500).json({ error: 'Datenbankfehler' });
    }
});

app.post('/api/upload', upload.array('files'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Keine Dateien hochgeladen' });
    }

    const results = {
        success: [],
        errors: []
    };

    const insertStudy = (study) => {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO studies (
                    modalitaet,
                    studiendatum,
                    studienbeschreibung,
                    anfragename,
                    institution,
                    anfragende_abteilung,
                    anfragender_arzt,
                    ueberweiser,
                    befundverfasser,
                    patientengeschlecht,
                    patientenalter,
                    diagnose,
                    untersuchungsstatus
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const values = [
                study['Modalität'],
                formatDate(study['Studiendatum']),
                study['Studienbeschreibung'],
                study['Anfragename'],
                study['Institution'],
                study['Anfragende Abteilung'],
                study['Anfragender Arzt'],
                study['Überweiser'],
                study['Berfundverfasser'],
                study['Patientengeschlecht'],
                study['Patientenalter'],
                study['Diagnose'],
                study['Untersuchungsstatus']
            ];

            db.run(query, values, function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    };

    for (const file of req.files) {
        try {
            const fileContent = fs.readFileSync(file.path, 'utf8');
            const jsonData = JSON.parse(fileContent);

            // Validiere JSON-Struktur
            validateJsonData(jsonData);

            // Verarbeite jeden Datensatz
            const insertPromises = jsonData.map(study => insertStudy(study));
            await Promise.all(insertPromises);

            // Protokolliere erfolgreichen Upload
            logger.info(`Datei "${file.originalname}" erfolgreich verarbeitet (${jsonData.length} Datensätze)`);

            results.success.push({
                filename: file.originalname,
                recordCount: jsonData.length
            });

        } catch (error) {
            logger.error(`Fehler bei Datei ${file.originalname}:`, error);
            results.errors.push({
                filename: file.originalname,
                error: error.message
            });
        } finally {
            // Temporäre Datei löschen
            fs.unlink(file.path, err => {
                if (err) logger.error(`Fehler beim Löschen der temporären Datei ${file.path}:`, err);
            });
        }
    }

    if (results.errors.length > 0 && results.success.length === 0) {
        return res.status(400).json(results);
    }

    res.json(results);
});

// Fehlerbehandlung
app.use((err, req, res, next) => {
    logger.error('Unbehandelte Ausnahme:', err);
    
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'Datei ist größer als 50MB'
            });
        }
    }
    
    res.status(500).json({
        error: process.env.NODE_ENV === 'production' 
            ? 'Ein interner Serverfehler ist aufgetreten'
            : err.message
    });
});

// Graceful Shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM Signal empfangen. Server wird heruntergefahren...');
    shutdownServer();
});

process.on('SIGINT', () => {
    logger.info('SIGINT Signal empfangen. Server wird heruntergefahren...');
    shutdownServer();
});

const shutdownServer = () => {
    db.close((err) => {
        if (err) {
            logger.error('Fehler beim Schließen der Datenbankverbindung:', err);
            process.exit(1);
        }
        logger.info('Datenbankverbindung geschlossen');
        process.exit(0);
    });
};

// Server starten
app.listen(config.port, config.host, () => {
    logger.info(`Server läuft auf ${config.host}:${config.port} in ${config.env} Modus`);
});

module.exports = { app, db };