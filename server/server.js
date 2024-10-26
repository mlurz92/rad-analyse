// server/server.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config');
const { logger, requestLogger, errorLogger } = require('./logging');
const cache = require('./cache');

console.log('Server startet...');
console.log('Konfiguration:', {
    port: config.port,
    host: config.host,
    env: config.env,
    dbPath: config.dbPath,
    logPath: config.logPath,
    uploadPath: config.uploadPath
});

// Express App initialisieren
const app = express();
console.log('Express App initialisiert');

// Datenbankverbindung herstellen
const db = new sqlite3.Database(config.dbPath, (err) => {
    if (err) {
        logger.error('Fehler beim Verbinden mit der Datenbank:', { error: err.message });
    } else {
        logger.info('Mit Datenbank verbunden:', { dbPath: config.dbPath });
    }
});

// Definieren des Basis-Pfads
const basePath = '/rad-analyse';

// Middleware
app.use(cors());
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'fonts.gstatic.com']
        }
    }
}));
app.use(compression());
app.use(express.json());

// Statische Dateien unter dem Basis-Pfad bereitstellen
app.use(basePath, express.static(path.join(__dirname, 'public')));

// Logging Middleware
app.use(requestLogger);

// Caching Middleware
app.use(cache.middleware());

// Konfiguration des Uploads
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

// Router initialisieren
const router = express.Router();

// API Routes unter Verwendung des Basis-Pfads
router.get('/api/studies', async (req, res) => {
    const page = parseInt(req.query.page) || 0;
    const limit = config.queryLimit;
    const offset = page * limit;

    const query = `
        SELECT * FROM studies 
        ORDER BY studiendatum DESC 
        LIMIT ? OFFSET ?
    `;

    db.all(query, [limit, offset], (err, rows) => {
        if (err) {
            logger.error('Fehler bei Datenbankabfrage:', { error: err.message });
            return res.status(500).json({ error: 'Datenbankfehler' });
        }
        res.json(rows);
    });
});

router.post('/api/upload', upload.array('files'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Keine Dateien hochgeladen' });
    }

    const results = {
        success: [],
        errors: []
    };

    for (const file of req.files) {
        try {
            const fileContent = fs.readFileSync(file.path, 'utf8');
            const jsonData = JSON.parse(fileContent);

            // Datenbankeinfügungen
            const insertStmt = db.prepare(`
                INSERT INTO studies (
                    modalitaet, studiendatum, studienbeschreibung, anfragename,
                    institution, anfragende_abteilung, anfragender_arzt, ueberweiser,
                    befundverfasser, patientengeschlecht, patientenalter, diagnose,
                    untersuchungsstatus
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            db.serialize(() => {
                db.run('BEGIN TRANSACTION;');
                jsonData.forEach((item, index) => {
                    insertStmt.run([
                        item.Modalität,
                        item.Studiendatum,
                        item.Studienbeschreibung || null,
                        item.Anfragename || null,
                        item.Institution,
                        item['Anfragende Abteilung'] || null,
                        item['Anfragender Arzt'] || null,
                        item.Überweiser || null,
                        item.Befundverfasser || null,
                        item.Patientengeschlecht,
                        item.Patientenalter,
                        item.Diagnose || null,
                        item.Untersuchungsstatus
                    ], (err) => {
                        if (err) {
                            logger.error('Fehler beim Einfügen der Daten:', { error: err.message, datei: file.originalname, datensatz: index + 1 });
                            results.errors.push({
                                filename: file.originalname,
                                error: `Datenbankfehler im Datensatz ${index + 1}: ${err.message}`
                            });
                        }
                    });
                });
                db.run('COMMIT;');
            });

            insertStmt.finalize();

            results.success.push({
                filename: file.originalname,
                size: file.size
            });
        } catch (error) {
            logger.error('Fehler bei Datei-Processing:', { error: error.message, datei: file.originalname });
            results.errors.push({
                filename: file.originalname,
                error: error.message
            });
        } finally {
            // Temporäre Datei löschen
            fs.unlink(file.path, err => {
                if (err) logger.error('Fehler beim Löschen der temporären Datei:', { error: err.message, datei: file.path });
            });
        }
    }

    res.json(results);
});

// Fehlerbehandlung Middleware
router.use(errorLogger);

// Router unter dem Basis-Pfad einbinden
app.use(basePath, router);

// Server starten
console.log('Starte Server...');
app.listen(config.port, config.host, () => {
    console.log('='.repeat(50));
    console.log(`Server läuft auf http://${config.host}:${config.port}`);
    console.log(`Umgebung: ${config.env}`);
    console.log(`Datenbank: ${config.dbPath}`);
    console.log(`Logs: ${config.logPath}`);
    console.log(`Uploads: ${config.uploadPath}`);
    console.log('='.repeat(50));
});

// Fehlerbehandlung für unbehandelte Ausnahmen
process.on('uncaughtException', (err) => {
    logger.error('Unbehandelte Ausnahme:', { error: err.message, stack: err.stack });
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    logger.error('Unbehandelte Promise-Ablehnung:', { error: err.message, stack: err.stack });
    process.exit(1);
});

module.exports = { app, db };