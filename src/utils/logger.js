/**
 * Structured Logger for CloudWatch
 * Provides consistent JSON logging with correlation IDs
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'];

function log(level, message, metadata = {}) {
    if (LOG_LEVELS[level] < currentLogLevel) {
        return; // Skip logs below current level
    }

    const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        requestId: process.env.AWS_REQUEST_ID || 'local',
        ...metadata
    };

    console.log(JSON.stringify(logEntry));
}

module.exports = {
    debug: (message, metadata) => log('DEBUG', message, metadata),
    info: (message, metadata) => log('INFO', message, metadata),
    warn: (message, metadata) => log('WARN', message, metadata),
    error: (message, metadata) => log('ERROR', message, metadata)
};
