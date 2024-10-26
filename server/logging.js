const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('./config');

// Eigenes Format für strukturiertes Logging
const customFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }),
    winston.format.errors({ stack: true }),
    winston.format.metadata({
        fillExcept: ['message', 'level', 'timestamp', 'label']
    }),
    winston.format.printf(({ level, message, timestamp, metadata, stack }) => {
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        if (Object.keys(metadata).length > 0) {
            log += ` | ${JSON.stringify(metadata)}`;
        }
        if (stack) {
            log += `\n${stack}`;
        }
        return log;
    })
);

// Log-Rotation Funktion
const getLogFileName = (type) => {
    const date = new Date().toISOString().split('T')[0];
    return path.join(config.logPath, `${type}-${date}.log`);
};

// Performance-Monitoring-Format
const performanceFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    return JSON.stringify({
        timestamp,
        level,
        message,
        ...metadata,
        performance: {
            memory: process.memoryUsage(),
            cpu: process.cpuUsage()
        }
    });
});

// Logger-Instanzen erstellen
const createLogger = () => {
    // Sicherstellen, dass Log-Verzeichnis existiert
    if (!fs.existsSync(config.logPath)) {
        fs.mkdirSync(config.logPath, { recursive: true });
    }

    const logger = winston.createLogger({
        level: config.logLevel,
        format: customFormat,
        transports: [
            // Fehler-Logs
            new winston.transports.File({
                filename: getLogFileName('error'),
                level: 'error',
                maxsize: 5242880, // 5MB
                maxFiles: 30,
                tailable: true
            }),
            // API-Logs
            new winston.transports.File({
                filename: getLogFileName('api'),
                level: 'info',
                maxsize: 5242880,
                maxFiles: 30,
                tailable: true
            }),
            // Performance-Logs
            new winston.transports.File({
                filename: getLogFileName('performance'),
                level: 'info',
                format: performanceFormat,
                maxsize: 5242880,
                maxFiles: 30,
                tailable: true
            }),
            // Debug-Logs
            new winston.transports.File({
                filename: getLogFileName('debug'),
                level: 'debug',
                maxsize: 5242880,
                maxFiles: 7,
                tailable: true
            })
        ]
    });

    // Entwicklungsumgebung: Zusätzlich in Konsole loggen
    if (process.env.NODE_ENV !== 'production') {
        logger.add(new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }));
    }

    return logger;
};

const logger = createLogger();

// Request-Logging Middleware
const requestLogger = (req, res, next) => {
    const start = process.hrtime();

    // Response beenden
    const cleanup = () => {
        res.removeListener('finish', logRequest);
        res.removeListener('error', logError);
        res.removeListener('close', cleanup);
    };

    // Request loggen
    const logRequest = () => {
        cleanup();
        const [seconds, nanoseconds] = process.hrtime(start);
        const duration = seconds * 1000 + nanoseconds / 1000000;

        logger.info('Request completed', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration.toFixed(3)}ms`,
            userAgent: req.get('user-agent'),
            ip: req.ip
        });
    };

    // Fehler loggen
    const logError = (error) => {
        cleanup();
        logger.error('Request error', {
            method: req.method,
            url: req.url,
            error: error.message,
            stack: error.stack
        });
    };

    res.on('finish', logRequest);
    res.on('error', logError);
    res.on('close', cleanup);

    next();
};

// Error-Logging Middleware
const errorLogger = (err, req, res, next) => {
    logger.error('Application error', {
        error: err.message,
        stack: err.stack,
        method: req.method,
        url: req.url,
        body: req.body,
        query: req.query,
        params: req.params,
        ip: req.ip
    });
    next(err);
};

module.exports = {
    logger,
    requestLogger,
    errorLogger
};
