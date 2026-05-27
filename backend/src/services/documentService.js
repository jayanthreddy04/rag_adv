import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import pdf from 'pdf-parse';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { embeddingService } from './embeddingService.js';
import { chromaDB } from '../config/chroma.js';
import { RecursiveCharacterTextSplitter } from '../utils/textSplitter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCUMENTS_DIR = path.join(__dirname, '../../documents');
const PACKAGED_DB_DIR = path.join(__dirname, '../../db');
const IS_SERVERLESS = process.env.VERCEL === '1';
const DB_DIR = IS_SERVERLESS ? path.join(os.tmpdir(), 'advanced-rag-db') : PACKAGED_DB_DIR;
const CHUNKS_INDEX_PATH = path.join(DB_DIR, 'chunks_index.json');
const INGESTION_TRACKER_PATH = path.join(DB_DIR, 'ingestion_tracker.json');
const PACKAGED_CHUNKS_INDEX_PATH = path.join(PACKAGED_DB_DIR, 'chunks_index.json');
const PACKAGED_INGESTION_TRACKER_PATH = path.join(PACKAGED_DB_DIR, 'ingestion_tracker.json');

class DocumentService {
  constructor() {
    this.status = {
      state: 'idle', // 'idle', 'processing', 'completed', 'failed'
      totalFiles: 0,
      processedFiles: 0,
      totalChunks: 0,
      currentFile: null,
      error: null
    };
    
    // In-memory cache of chunks for fast BM25 matching
    this.chunksIndex = [];
    // Tracker for file MD5 hashes to avoid re-embedding
    this.ingestionTracker = {};
  }

  async init() {
    // Ensure directories exist
    if (!IS_SERVERLESS) {
      await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
    }
    await fs.mkdir(DB_DIR, { recursive: true });
    
    // Load existing chunk index and ingestion tracker if they exist
    const chunksIndexPathToRead = existsSync(CHUNKS_INDEX_PATH) ? CHUNKS_INDEX_PATH : PACKAGED_CHUNKS_INDEX_PATH;
    if (existsSync(chunksIndexPathToRead)) {
      try {
        const raw = await fs.readFile(chunksIndexPathToRead, 'utf-8');
        this.chunksIndex = JSON.parse(raw);
        logger.info(`Loaded ${this.chunksIndex.length} cached document chunks from index.`);
      } catch (err) {
        logger.error('Failed to load chunks index:', err);
      }
    }

    const ingestionTrackerPathToRead = existsSync(INGESTION_TRACKER_PATH) ? INGESTION_TRACKER_PATH : PACKAGED_INGESTION_TRACKER_PATH;
    if (existsSync(ingestionTrackerPathToRead)) {
      try {
        const raw = await fs.readFile(ingestionTrackerPathToRead, 'utf-8');
        this.ingestionTracker = JSON.parse(raw);
        logger.info(`Loaded ingestion tracker with ${Object.keys(this.ingestionTracker).length} tracked files.`);
      } catch (err) {
        logger.error('Failed to load ingestion tracker:', err);
      }
    }
  }

  getStatus() {
    return this.status;
  }

  async getIndexedDocuments() {
    const docs = [];
    const files = Object.keys(this.ingestionTracker);
    for (const file of files) {
      docs.push({
        name: file,
        hash: this.ingestionTracker[file].hash,
        chunks: this.ingestionTracker[file].chunksCount,
        ingestedAt: this.ingestionTracker[file].ingestedAt
      });
    }
    return docs;
  }

  getChunks() {
    return this.chunksIndex;
  }

  /**
   * Helper to extract keyword tags from a text chunk
   */
  extractKeywords(text, count = 5) {
    const words = text
      .toLowerCase()
      .replace(/[^a-zA-Z\s]/g, '')
      .split(/\s+/);
    
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 'from',
      'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'us', 'our', 'you', 'your', 'i', 'me', 'my',
      'he', 'him', 'his', 'she', 'her', 'has', 'have', 'had', 'do', 'does', 'did', 'as', 'if', 'then', 'else', 'when', 'where',
      'how', 'why', 'what', 'who', 'which', 'can', 'will', 'should', 'would', 'could', 'about', 'also', 'more', 'some', 'any'
    ]);

    const freqMap = {};
    for (const word of words) {
      if (word.length > 4 && !stopWords.has(word)) {
        freqMap[word] = (freqMap[word] || 0) + 1;
      }
    }

    return Object.keys(freqMap)
      .sort((a, b) => freqMap[b] - freqMap[a])
      .slice(0, count);
  }

  /**
   * Main background ingestion procedure.
   */
  async triggerIngestion() {
    if (this.status.state === 'processing') {
      logger.warn('Ingestion already in progress.');
      return;
    }

    this.status.state = 'processing';
    this.status.error = null;
    this.status.processedFiles = 0;
    this.status.totalChunks = 0;

    // Run ingestion in background so it doesn't block the caller
    this._runIngestion()
      .then(() => {
        this.status.state = 'completed';
        this.status.currentFile = null;
        logger.info('Document ingestion completed successfully.');
      })
      .catch((err) => {
        this.status.state = 'failed';
        this.status.error = err.message;
        this.status.currentFile = null;
        logger.error('Document ingestion failed:', err);
      });
  }

  async _runIngestion() {
    await this.init();
    
    // Ensure ChromaDB collection is connected
    const collection = await chromaDB.getCollection();

    const files = await fs.readdir(DOCUMENTS_DIR);
    // Filter supported formats
    const docFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ext === '.txt' || ext === '.md' || ext === '.pdf';
    });

    this.status.totalFiles = docFiles.length;
    logger.info(`Found ${docFiles.length} files to scan in documents directory.`);

    let updatedChunksIndex = [...this.chunksIndex];
    let trackerUpdated = false;

    for (const filename of docFiles) {
      const filePath = path.join(DOCUMENTS_DIR, filename);
      this.status.currentFile = filename;
      
      const fileBuffer = await fs.readFile(filePath);
      const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');

      // Check if file hash has changed
      if (this.ingestionTracker[filename] && this.ingestionTracker[filename].hash === hash) {
        logger.info(`File ${filename} is unchanged. Skipping re-ingestion.`);
        this.status.processedFiles++;
        continue;
      }

      logger.info(`Ingesting/updating document: ${filename}`);
      
      // Parse file content based on extension
      let fileText = '';
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.pdf') {
        const parsed = await pdf(fileBuffer);
        fileText = parsed.text;
      } else {
        fileText = fileBuffer.toString('utf-8');
      }

      if (!fileText || !fileText.trim()) {
        logger.warn(`Document ${filename} appears to be empty. Skipping.`);
        this.status.processedFiles++;
        continue;
      }

      // Split text recursively
      const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
      const rawChunks = splitter.splitText(fileText);
      logger.info(`Split ${filename} into ${rawChunks.length} chunks.`);

      // If file was previously ingested under a different hash, we need to delete its old chunks from ChromaDB
      if (this.ingestionTracker[filename]) {
        logger.info(`Deleting older version of ${filename} chunks from ChromaDB...`);
        // Remove from ChromaDB using metadata filter
        await collection.delete({
          where: { "source": filename }
        });
        // Remove from local chunksIndex
        updatedChunksIndex = updatedChunksIndex.filter(c => c.metadata.source !== filename);
      }

      // Prepare chunks, calculate embeddings, metadata, IDs
      const chunkIds = [];
      const chunkEmbeddings = [];
      const chunkMetadatas = [];
      const chunkTexts = [];

      for (let i = 0; i < rawChunks.length; i++) {
        const text = rawChunks[i];
        const id = `${filename}_chunk_${i}_${hash.substring(0, 8)}`;
        const keywords = this.extractKeywords(text, 5);
        
        const metadata = {
          source: filename,
          chunk_index: i,
          total_chunks: rawChunks.length,
          keywords: keywords.join(','),
          word_count: text.split(/\s+/).length,
          character_count: text.length,
          ingested_at: new Date().toISOString()
        };

        const embedding = await embeddingService.generate(text);

        chunkIds.push(id);
        chunkEmbeddings.push(embedding);
        chunkMetadatas.push(metadata);
        chunkTexts.push(text);

        // Store in JSON chunk index
        updatedChunksIndex.push({
          id,
          text,
          metadata
        });
      }

      // Add vectors in ChromaDB
      if (chunkIds.length > 0) {
        logger.info(`Saving vectors for ${filename} to ChromaDB...`);
        await collection.add({
          ids: chunkIds,
          embeddings: chunkEmbeddings,
          metadatas: chunkMetadatas,
          documents: chunkTexts
        });
      }

      // Record in tracker
      this.ingestionTracker[filename] = {
        hash,
        chunksCount: rawChunks.length,
        ingestedAt: new Date().toISOString()
      };

      trackerUpdated = true;
      this.status.totalChunks += rawChunks.length;
      this.status.processedFiles++;
    }

    // Save outputs if any documents were processed or deleted
    if (trackerUpdated) {
      this.chunksIndex = updatedChunksIndex;
      await fs.writeFile(CHUNKS_INDEX_PATH, JSON.stringify(this.chunksIndex, null, 2), 'utf-8');
      await fs.writeFile(INGESTION_TRACKER_PATH, JSON.stringify(this.ingestionTracker, null, 2), 'utf-8');
      logger.info('Chunks index and ingestion tracker updated on disk.');
    }
  }
}

export const documentService = new DocumentService();
export default documentService;
