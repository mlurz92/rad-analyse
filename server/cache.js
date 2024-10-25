const NodeCache = require('node-cache');
const config = require('./config');
const { logger } = require('./logging');

class CacheManager {
    constructor() {
        this.cache = new NodeCache({
            stdTTL: 3600, // 1 Stunde Standard-TTL
            checkperiod: 600, // Alle 10 Minuten prüfen
            useClones: false,
            deleteOnExpire: true
        });

        this.statistics = {
            hits: 0,
            misses: 0,
            sets: 0
        };

        // Cache-Events
        this.cache.on('expired', (key, value) => {
            logger.debug('Cache expired', { key });
        });

        this.cache.on('del', (key, value) => {
            logger.debug('Cache deleted', { key });
        });

        // Statistik-Reporting
        setInterval(() => {
            this.reportStatistics();
        }, 300000); // Alle 5 Minuten
    }

    async get(key, fetchFunction, ttl = 3600) {
        let value = this.cache.get(key);
        
        if (value !== undefined) {
            this.statistics.hits++;
            return value;
        }

        this.statistics.misses++;
        
        try {
            value = await fetchFunction();
            this.set(key, value, ttl);
            return value;
        } catch (error) {
            logger.error('Cache fetch error', { key, error: error.message });
            throw error;
        }
    }

    set(key, value, ttl = 3600) {
        this.statistics.sets++;
        return this.cache.set(key, value, ttl);
    }

    delete(key) {
        return this.cache.del(key);
    }

    flush() {
        this.cache.flushAll();
        logger.info('Cache flushed');
    }

    // Statistiken aktualisieren und loggen
    reportStatistics() {
        const stats = this.cache.getStats();
        const hitRatio = (this.statistics.hits / (this.statistics.hits + this.statistics.misses)) * 100;

        logger.info('Cache statistics', {
            hits: this.statistics.hits,
            misses: this.statistics.misses,
            sets: this.statistics.sets,
            hitRatio: `${hitRatio.toFixed(2)}%`,
            keys: this.cache.keys().length,
            memory: stats.memory
        });
    }

    // Cache-Middleware für Express
    middleware(options = {}) {
        return async (req, res, next) => {
            if (req.method !== 'GET') {
                return next();
            }

            const key = `${req.originalUrl || req.url}`;
            try {
                const cachedResponse = await this.get(key, async () => {
                    const originalSend = res.send.bind(res);
                    let responseBody;

                    res.send = (body) => {
                        responseBody = body;
                        return originalSend(body);
                    };

                    await new Promise((resolve) => {
                        res.sendResponse = res.send;
                        res.send = (body) => {
                            responseBody = body;
                            resolve();
                        };
                        next();
                    });

                    return {
                        body: responseBody,
                        headers: res.getHeaders()
                    };
                }, options.ttl);

                // Cache-Headers setzen
                res.set('X-Cache', 'HIT');
                Object.entries(cachedResponse.headers).forEach(([key, value]) => {
                    res.set(key, value);
                });

                return res.send(cachedResponse.body);
            } catch (error) {
                logger.error('Cache middleware error', { key, error: error.message });
                next();
            }
        };
    }
}

module.exports = new CacheManager();