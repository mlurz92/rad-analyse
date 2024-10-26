// server/routes/api.js

const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const config = require('../config');
const { logger } = require('../logging');

const db = new sqlite3.Database(config.dbPath);

// Studien abrufen
router.get('/studies', (req, res) => {
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

module.exports = router;