import { createClient } from 'redis';
import { LRUCache } from 'lru-cache';
import { logger } from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

class CacheService {
  constructor() {
    this.redisClient = null;
    this.isRedisReady = false;
    
    // In-memory fallback cache (LRU)
    // Max 1000 entries, TTL 5 minutes by default
    this.localCache = new LRUCache({
      max: 1000,
      ttl: 1000 * 60 * 5 // 5 minutes
    });

    this.initRedis();
  }

  async initRedis() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl || redisUrl.toLowerCase() === 'disabled') {
      logger.info('Redis URL not configured. Using in-memory fallback cache.');
      return;
    }

    logger.info(`Attempting to connect to Redis at: ${redisUrl}`);
    
    try {
      this.redisClient = createClient({ url: redisUrl });
      
      this.redisClient.on('error', (err) => {
        // Only log once to avoid cluttering logs
        if (this.isRedisReady) {
          logger.warn(`Redis client error: ${err.message}. Falling back to in-memory cache.`);
        }
        this.isRedisReady = false;
      });

      this.redisClient.on('connect', () => {
        logger.info('Redis client connected.');
      });

      this.redisClient.on('ready', () => {
        logger.info('Redis client ready for commands.');
        this.isRedisReady = true;
      });

      await this.redisClient.connect();
    } catch (err) {
      logger.warn(`Redis connection failed: ${err.message}. Using in-memory fallback cache.`);
      this.isRedisReady = false;
      this.redisClient = null;
    }
  }

  /**
   * Retrieves a value from the cache.
   * @param {string} key 
   * @returns {Promise<any>}
   */
  async get(key) {
    if (this.isRedisReady && this.redisClient) {
      try {
        const value = await this.redisClient.get(key);
        if (value) {
          logger.debug(`Cache hit (Redis) for key: ${key}`);
          return JSON.parse(value);
        }
      } catch (err) {
        logger.error(`Error reading from Redis cache for key ${key}:`, err);
      }
    }

    // Fallback to local memory cache
    const value = this.localCache.get(key);
    if (value !== undefined) {
      logger.debug(`Cache hit (In-Memory) for key: ${key}`);
      return value;
    }

    logger.debug(`Cache miss for key: ${key}`);
    return null;
  }

  /**
   * Sets a value in the cache.
   * @param {string} key 
   * @param {any} value 
   * @param {number} ttlInSeconds - Time to live in seconds (default 300)
   */
  async set(key, value, ttlInSeconds = 300) {
    const stringified = JSON.stringify(value);
    
    if (this.isRedisReady && this.redisClient) {
      try {
        await this.redisClient.set(key, stringified, {
          EX: ttlInSeconds
        });
        logger.debug(`Cache set (Redis) for key: ${key}`);
        return;
      } catch (err) {
        logger.error(`Error writing to Redis cache for key ${key}:`, err);
      }
    }

    // Fallback to local memory cache (ttl parameter in lru-cache is in milliseconds)
    this.localCache.set(key, value, { ttl: ttlInSeconds * 1000 });
    logger.debug(`Cache set (In-Memory) for key: ${key}`);
  }

  /**
   * Deletes a key from the cache.
   * @param {string} key 
   */
  async delete(key) {
    if (this.isRedisReady && this.redisClient) {
      try {
        await this.redisClient.del(key);
        logger.debug(`Cache deleted (Redis) for key: ${key}`);
      } catch (err) {
        logger.error(`Error deleting from Redis cache for key ${key}:`, err);
      }
    }
    this.localCache.delete(key);
    logger.debug(`Cache deleted (In-Memory) for key: ${key}`);
  }

  /**
   * Clears the entire cache.
   */
  async clear() {
    if (this.isRedisReady && this.redisClient) {
      try {
        await this.redisClient.flushAll();
        logger.info('Cache cleared (Redis).');
      } catch (err) {
        logger.error('Error flushing Redis cache:', err);
      }
    }
    this.localCache.clear();
    logger.info('Cache cleared (In-Memory).');
  }
}

export const cacheService = new CacheService();
export default cacheService;
