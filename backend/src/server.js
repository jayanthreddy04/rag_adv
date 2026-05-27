import http from 'http';
import app from './app.js';
import { chromaDB } from './config/chroma.js';
import { documentService } from './services/documentService.js';
import { logger } from './utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5001;

const server = http.createServer(app);

async function startServer() {
  try {
    logger.info('Starting Advanced RAG Chatbot Platform server...');
    
    // Connect to ChromaDB
    await chromaDB.connect();
    
    // Initialize Ingestion database / index trackers
    await documentService.init();

    // Trigger an initial automatic document scan in the background
    documentService.triggerIngestion()
      .then(() => logger.info('Automatic initial document scan queued.'))
      .catch((err) => logger.error('Error starting initial background ingestion:', err));

    server.listen(PORT, () => {
      logger.info(`Backend API server running on port: ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful Shutdown handler
const gracefulShutdown = () => {
  logger.info('Shutting down server gracefully...');
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });

  // Force exit after 10s if sockets remain open
  setTimeout(() => {
    logger.warn('Forcing server shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();
