import rateLimit from 'express-rate-limit';

export const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 15, // limit each IP to 15 chat requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many chat requests. Please try again after a minute.'
  }
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 API requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP. Please try again later.'
  }
});
