const path = require('path');
const fs = require('fs');
require('dotenv').config();

function ensureDirectory(dir) {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
        }
        fs.accessSync(dir, fs.constants.W_OK);
        return true;
    } catch (err) {
        console.error(`Fehler beim Erstellen/Zugriff auf Verzeichnis ${dir}:`, err);
        return false;
    }
}

function validateConfig(config) {
    const required = [
        'PORT',
        'DB_PATH',
        'UPLOAD_PATH',
        'LOG_PATH'
    ];

    const missing = required.filter(key => !config[key]);
    
    if (missing.length > 0) {
        throw new Error(`Fehlende Umgebungsvariablen: ${missing.join(', ')}`);
    }

    // Port validieren
    const port = parseInt(config.PORT, 10);
    if (isNaN(port) || port <= 0 || port > 65535) {
        throw new Error('PORT muss eine gültige Portnummer sein (1-65535)');
    }

    // Pfade validieren und erstellen
    const paths = ['DB_PATH', 'UPLOAD_PATH', 'LOG_PATH'];
    paths.forEach(pathKey => {
        const dir = path.dirname(config[pathKey]);
        if (!ensureDirectory(dir)) {
            throw new Error(`Verzeichnis für ${pathKey} (${dir}) konnte nicht erstellt/verwendet werden`);
        }
    });

    return {
        port: port,
        host: config.HOST || 'localhost',
        dbPath: config.DB_PATH,
        uploadPath: config.UPLOAD_PATH,
        logPath: config.LOG_PATH,
        env: config.NODE_ENV || 'development',
        maxUploadSize: parseInt(config.MAX_UPLOAD_SIZE || '52428800', 10),
        logLevel: config.LOG_LEVEL || 'info',
        cacheEnabled: config.CACHE_ENABLED === 'true',
        cacheTTL: parseInt(config.CACHE_TTL || '3600', 10),
        maxConnections: parseInt(config.MAX_CONNECTIONS || '100', 10),
        queryLimit: parseInt(config.QUERY_LIMIT || '200', 10)
    };
}

const config = validateConfig(process.env);

module.exports = config;
