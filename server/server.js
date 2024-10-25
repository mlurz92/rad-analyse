const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config');

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

// Middleware
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

console.log('Middleware konfiguriert');

// Datenbank Setup
console.log('Verbinde zur Datenbank...');
const db = new sqlite3.Database(config.dbPath, (err) => {
    if (err) {
        console.error('Fehler beim Verbinden zur Datenbank:', err);
        process.exit(1);
    }
    console.log('Datenbankverbindung hergestellt');
    
    // Schema initialisieren
    try {
        const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
        db.exec(schema, (err) => {
            if (err) {
                console.error('Fehler beim Erstellen der Tabellen:', err);
            } else {
                console.log('Datenbankschema initialisiert');
            }
        });
    } catch (error) {
        console.error('Fehler beim Lesen des Datenbankschemas:', error);
    }
});

// Upload Konfiguration
console.log('Konfiguriere Upload...');
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

console.log('Upload konfiguriert');

// API Routes
app.get('/api/studies', async (req, res) => {
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
            console.error('Fehler bei Datenbankabfrage:', err);
            return res.status(500).json({ error: 'Datenbankfehler' });
        }
        res.json(rows);
    });
});

app.post('/api/upload', upload.array('files'), async (req, res) => {
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
            
            // Hier Datenbankoperationen...
            
            results.success.push({
                filename: file.originalname,
                size: file.size
            });
        } catch (error) {
            console.error(`Fehler bei Datei ${file.originalname}:`, error);
            results.errors.push({
                filename: file.originalname,
                error: error.message
            });
        } finally {
            // Temporäre Datei löschen
            fs.unlink(file.path, err => {
                if (err) console.error(`Fehler beim Löschen der temporären Datei ${file.path}:`, err);
            });
        }
    }

    res.json(results);
});

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
    console.error('Unbehandelte Ausnahme:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('Unbehandelte Promise-Ablehnung:', err);
    process.exit(1);
});

module.exports = { app, db };
