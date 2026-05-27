import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let output = `[${timestamp}] ${level}: ${message}`;
    if (stack) {
      output += `\n${stack}`;
    }
    if (Object.keys(meta).length > 0 && !stack) {
      output += ` ${JSON.stringify(meta)}`;
    }
    return output;
  })
);

const logsDir = path.join(__dirname, '../../logs');

const transports = [
  new winston.transports.Console({
    format: consoleFormat,
  }),
];

if (process.env.VERCEL !== '1' && process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
    })
  );
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'advanced-rag-api' },
  transports,
});
