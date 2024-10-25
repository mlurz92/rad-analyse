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

// Performance-Monitoring
const startPerformanceMonitoring = (logger) => {
    const interval = process.env.NODE_ENV === 'production' ? 300000 : 60000; // 5min prod, 1min dev
    
    setInterval(() => {
        const usage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        logger.info('Performance metrics', {
            memory: {
                heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + ' MB',
                heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + ' MB',
                rss: Math.round(usage.rss / 1024 / 1024) + ' MB',
                external: Math.round(usage.external / 1024 / 1024) + ' MB'
            },
            cpu: {
                user: Math.round(cpuUsage.user / 1000000) + ' ms',
                system: Math.round(cpuUsage.system / 1000000) + ' ms'
            }
        });
    }, interval);
};

// Log-Rotation und Bereinigung
const setupLogRotation = () => {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 Tage
    
    setInterval(() => {
        fs.readdir(config.logPath, (err, files) => {
            if (err) {
                console.error('Fehler beim Lesen des Log-Verzeichnisses:', err);
                return;
            }

            const now = Date.now();
            files.forEach(file => {
                const filePath = path.join(config.logPath, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) {
                        console.error(`Fehler beim Lesen der Dateistatistik für ${file}:`, err);
                        return;
                    }

                    if (now - stats.mtime.getTime() > maxAge) {
                        fs.unlink(filePath, err => {
                            if (err) {
                                console.error(`Fehler beim Löschen der alten Log-Datei ${file}:`, err);
                            }
                        });
                    }
                });
            });
        });
    }, 24 * 60 * 60 * 1000); // Täglich prüfen
};

// Request-Logging Middleware
const requestLogger = (logger) => {
    return (req, res, next) => {
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
};

// Error-Logging Middleware
const errorLogger = (logger) => {
    return (err, req, res, next) => {
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
};

const logger = createLogger();
startPerformanceMonitoring(logger);
setupLogRotation();

module.exports = {
    logger,
    requestLogger: requestLogger(logger),
    errorLogger: errorLogger(logger)
};