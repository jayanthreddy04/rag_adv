import { ChromaClient, CloudClient } from 'chromadb';
import { logger } from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

class ChromaDBManager {
  constructor() {
    const hasCloudConfig = Boolean(
      process.env.CHROMA_API_KEY &&
      process.env.CHROMA_TENANT &&
      process.env.CHROMA_DATABASE
    );

    if (hasCloudConfig) {
      const configuredCloudHost = process.env.CHROMA_HOST || 'https://api.trychroma.com';
      const cloudHost = configuredCloudHost.startsWith('http')
        ? configuredCloudHost
        : `https://${configuredCloudHost}`;

      logger.info(`Initializing Chroma Cloud client for tenant/database: ${process.env.CHROMA_TENANT}/${process.env.CHROMA_DATABASE}`);
      this.client = new CloudClient({
        apiKey: process.env.CHROMA_API_KEY,
        tenant: process.env.CHROMA_TENANT,
        database: process.env.CHROMA_DATABASE,
        cloudHost
      });
    } else {
      const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
      logger.info(`Initializing local ChromaDB client pointing to: ${chromaUrl}`);
      this.client = new ChromaClient({ path: chromaUrl });
    }

    this.collectionName = 'document_chunks';
    this.collection = null;
  }

  async connect(retries = 5, delay = 2000) {
    for (let i = 1; i <= retries; i++) {
      try {
        // Ping ChromaDB
        const version = await this.client.version();
        logger.info(`ChromaDB server connection successful. Server version: ${version}`);
        
        // Get or create collection
        // Note: we don't supply embeddingFunction to ChromaClient because we generate embeddings in-house
        // via our embeddingService and pass raw vectors directly to collection.add/query.
        this.collection = await this.client.getOrCreateCollection({
          name: this.collectionName,
          metadata: { "hnsw:space": "cosine" } // Use cosine similarity
        });
        
        logger.info(`Collection '${this.collectionName}' initialized in ChromaDB.`);
        return this.collection;
      } catch (error) {
        logger.warn(`ChromaDB connection attempt ${i} failed: ${error.message}`);
        if (i === retries) {
          logger.error('Could not connect to ChromaDB server. Verify that the Chroma server is running.');
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  async getCollection() {
    if (!this.collection) {
      return await this.connect();
    }
    return this.collection;
  }
}

export const chromaDB = new ChromaDBManager();
export default chromaDB;
