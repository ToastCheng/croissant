import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
    return `[${timestamp}] ${level}: ${stack || message}`;
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info', // Default to info, can be overridden by env
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }), // Print stack trace for errors
        logFormat
    ),
    transports: [
        new winston.transports.Console({
            format: combine(
                colorize(), // Colorize console output
                timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                logFormat
            )
        })
    ]
});

// Optional: Add file transport if needed in future
// logger.add(new winston.transports.File({ filename: 'error.log', level: 'error' }));
// logger.add(new winston.transports.File({ filename: 'combined.log' }));

export default logger;
