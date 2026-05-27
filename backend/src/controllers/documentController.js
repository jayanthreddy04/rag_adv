import { documentService } from '../services/documentService.js';
import { cacheService } from '../services/cacheService.js';
import { logger } from '../utils/logger.js';

export const triggerIngestion = async (req, res, next) => {
  try {
    logger.info('Received manual ingestion trigger request.');
    await documentService.triggerIngestion();
    
    res.status(202).json({
      message: 'Ingestion pipeline triggered in the background.',
      status: documentService.getStatus()
    });
  } catch (error) {
    next(error);
  }
};

export const getIngestionStatus = async (req, res, next) => {
  try {
    const status = documentService.getStatus();
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
};

export const getIndexedDocuments = async (req, res, next) => {
  try {
    const documents = await documentService.getIndexedDocuments();
    res.status(200).json({ documents });
  } catch (error) {
    next(error);
  }
};

export const clearCache = async (req, res, next) => {
  try {
    await cacheService.clear();
    res.status(200).json({ message: 'Global cache cleared successfully.' });
  } catch (error) {
    next(error);
  }
};
