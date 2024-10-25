const path = require('path');
require('dotenv').config();

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

    // Pfade validieren
    const paths = ['DB_PATH', 'UPLOAD_PATH', 'LOG_PATH'];
    paths.forEach(pathKey => {
        const dir = path.dirname(config[pathKey]);
        try {
            // Verzeichnis erstellen falls nicht vorhanden
            if (!require('fs').existsSync(dir)) {
                require('fs').mkdirSync(dir, { recursive: true });
            }
            require('fs').accessSync(dir, require('fs').constants.W_OK);
        } catch (err) {
            console.error(`Fehler beim Zugriff auf Verzeichnis ${dir}:`, err);
            throw new Error(`Verzeichnis für ${pathKey} (${dir}) ist nicht beschreibbar`);
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
