import { pipeline } from '@xenova/transformers';
import { logger } from '../utils/logger.js';

class EmbeddingService {
  constructor() {
    this.modelName = 'Xenova/all-MiniLM-L6-v2';
    this.pipelinePromise = null;
    this.extractor = null;
  }

  async init() {
    if (this.extractor) return;
    
    if (!this.pipelinePromise) {
      logger.info(`Initializing local embedding model: ${this.modelName}`);
      this.pipelinePromise = pipeline('feature-extraction', this.modelName)
        .then(extractor => {
          this.extractor = extractor;
          logger.info(`Local embedding model ${this.modelName} loaded successfully.`);
          return extractor;
        })
        .catch(err => {
          logger.error('Failed to load local embedding model:', err);
          this.pipelinePromise = null;
          throw err;
        });
    }
    
    return this.pipelinePromise;
  }

  /**
   * Generates a 384-dimensional embedding for a given text.
   * @param {string} text 
   * @returns {Promise<number[]>}
   */
  async generate(text) {
    try {
      await this.init();
      
      const cleanText = text.replace(/\n+/g, ' ').trim();
      const output = await this.extractor(cleanText, {
        pooling: 'mean',
        normalize: true,
      });

      // Convert Float32Array back to a normal JS Array
      return Array.from(output.data);
    } catch (error) {
      logger.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Generates embeddings for a batch of texts.
   * @param {string[]} texts 
   * @returns {Promise<number[][]>}
   */
  async generateBatch(texts) {
    try {
      await this.init();
      logger.debug(`Generating embeddings batch for ${texts.length} items`);
      
      const embeddings = [];
      // We process sequentially or in small chunks to avoid memory bottlenecks
      for (const text of texts) {
        const emb = await this.generate(text);
        embeddings.push(emb);
      }
      return embeddings;
    } catch (error) {
      logger.error('Error generating batch embeddings:', error);
      throw error;
    }
  }
}

export const embeddingService = new EmbeddingService();
