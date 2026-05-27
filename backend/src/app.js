import express from 'express';
import cors from 'cors';
import { body } from 'express-validator';
import { handleChat } from './controllers/chatController.js';
import { 
  triggerIngestion, 
  getIngestionStatus, 
  getIndexedDocuments,
  clearCache 
} from './controllers/documentController.js';
import { chatLimiter, apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

const app = express();

// Middlewares
app.use(cors({
  origin: '*', // Allow all origins for development, customize for production
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Log HTTP requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  next();
});

// Root check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Chat Route with custom validations and rate limiter
app.post(
  '/api/chat',
  chatLimiter,
  [
    body('query').isString().notEmpty().withMessage('Query is required and must be a string.'),
    body('history').optional().isArray().withMessage('History must be an array of message objects.'),
    body('useLlmReranker').optional().isBoolean().withMessage('useLlmReranker must be a boolean.'),
    body('filter').optional({ nullable: true }).isObject().withMessage('Filter must be a metadata query object.')
  ],
  handleChat
);

// Document Ingestion routes with general rate limiter
app.post('/api/documents/ingest', apiLimiter, triggerIngestion);
app.get('/api/documents/status', apiLimiter, getIngestionStatus);
app.get('/api/documents', apiLimiter, getIndexedDocuments);

// Cache management route
app.post('/api/cache/clear', apiLimiter, clearCache);

// 404 Route handler
app.use((req, res) => {
  res.status(404).json({ error: { message: `Route not found: ${req.originalUrl}` } });
});

// Centralized error handling middleware
app.use(errorHandler);

export default app;
