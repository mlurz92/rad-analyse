// server/routes/upload.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config');
const { logger } = require('../logging');

const db = new sqlite3.Database(config.dbPath);

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

// Upload-Route
router.post('/', upload.array('files'), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Keine Dateien hochgeladen' });
    }

    const results = {
        success: [],
        errors: []
    };

    req.files.forEach(file => {
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
    });

    res.json(results);
});

module.exports = router;