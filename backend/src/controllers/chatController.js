import { validationResult } from 'express-validator';
import { llmService } from '../services/llmService.js';
import { logger } from '../utils/logger.js';

export const handleChat = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { query, history, useLlmReranker, filter } = req.body;

  // Set headers for Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'none');
  
  // Prevent client connection timeout
  res.flushHeaders();

  logger.info(`Received chat request: "${query.substring(0, 50)}..."`);

  // Handle client disconnect / cancellation
  let clientConnected = true;
  req.on('close', () => {
    if (clientConnected) {
      logger.info('Client closed connection / cancelled response generation.');
      clientConnected = false;
    }
  });

  try {
    await llmService.streamRAGAnswer(
      query, 
      history || [], 
      { useLlmReranker: !!useLlmReranker, filter }, 
      res
    );
  } catch (error) {
    logger.error('Error in chat controller:', error);
    if (clientConnected) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  } finally {
    clientConnected = false;
  }
};
