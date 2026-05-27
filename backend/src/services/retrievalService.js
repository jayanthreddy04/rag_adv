import { chromaDB } from '../config/chroma.js';
import { embeddingService } from './embeddingService.js';
import { documentService } from './documentService.js';
import { logger } from '../utils/logger.js';

class RetrievalService {
  constructor() {
    this.k1 = 1.5; // BM25 tuning parameter (term frequency saturation)
    this.b = 0.75;  // BM25 tuning parameter (length normalization)
    this.stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 'from',
      'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'us', 'our', 'you', 'your', 'i', 'me', 'my',
      'he', 'him', 'his', 'she', 'her', 'has', 'have', 'had', 'do', 'does', 'did', 'as', 'if', 'then', 'else', 'when', 'where',
      'how', 'why', 'what', 'who', 'which', 'can', 'will', 'should', 'would', 'could', 'about', 'also', 'more', 'some', 'any'
    ]);
  }

  /**
   * Tokenizes a text into individual alphanumeric lowercase words, excluding stop words.
   * @param {string} text 
   * @returns {string[]}
   */
  tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !this.stopWords.has(word));
  }

  /**
   * Performs Semantic Vector Search in ChromaDB.
   */
  async searchSemantic(queryText, limit = 10, filter = null) {
    try {
      const collection = await chromaDB.getCollection();
      const queryEmbedding = await embeddingService.generate(queryText);
      
      const queryParams = {
        queryEmbeddings: [queryEmbedding],
        nResults: limit
      };

      if (filter) {
        queryParams.where = filter;
      }

      logger.info(`Performing semantic vector search for query: "${queryText.substring(0, 50)}..."`);
      const results = await collection.query(queryParams);
      
      if (!results || !results.ids || results.ids[0].length === 0) {
        return [];
      }

      const formattedResults = [];
      for (let i = 0; i < results.ids[0].length; i++) {
        // Distance is cosine distance, convert to similarity
        // Cosine distance = 1 - cosine similarity, so similarity = 1 - distance
        const distance = results.distances[0][i];
        const similarity = 1 - distance;

        formattedResults.push({
          id: results.ids[0][i],
          text: results.documents[0][i],
          metadata: results.metadatas[0][i],
          score: similarity,
          type: 'semantic'
        });
      }
      
      return formattedResults;
    } catch (error) {
      logger.error('Semantic search error:', error);
      return [];
    }
  }

  /**
   * Local high-performance BM25 keyword search.
   */
  searchBM25(queryText, limit = 10, filter = null) {
    try {
      const chunks = documentService.getChunks();
      if (!chunks || chunks.length === 0) {
        logger.warn('BM25 index is empty.');
        return [];
      }

      // Filter chunks if metadata filter is provided
      let filteredChunks = chunks;
      if (filter) {
        filteredChunks = chunks.filter(c => {
          for (const key in filter) {
            if (c.metadata[key] !== filter[key]) return false;
          }
          return true;
        });
      }

      const queryTokens = this.tokenize(queryText);
      if (queryTokens.length === 0) {
        // Fallback to basic string search if query has no keywords (e.g. only stop words)
        return filteredChunks.slice(0, limit).map(c => ({
          ...c,
          score: 0.1,
          type: 'keyword'
        }));
      }

      const N = filteredChunks.length;
      
      // Calculate tokenized documents and document lengths
      const docTokensList = filteredChunks.map(c => this.tokenize(c.text));
      const docLens = docTokensList.map(tokens => tokens.length);
      const avgdl = docLens.reduce((sum, len) => sum + len, 0) / N;

      // Calculate document frequency (DF) for each query token
      const df = {};
      for (const token of queryTokens) {
        let count = 0;
        for (const tokens of docTokensList) {
          if (tokens.includes(token)) {
            count++;
          }
        }
        df[token] = count;
      }

      // Compute standard IDF for query tokens
      const idf = {};
      for (const token of queryTokens) {
        const docFreq = df[token] || 0;
        // Standard BM25 IDF formula with smoothing to avoid negative IDF for very frequent words
        idf[token] = Math.max(0.0001, Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1));
      }

      // Calculate BM25 score for each document chunk
      const scoredChunks = filteredChunks.map((chunk, docIdx) => {
        const tokens = docTokensList[docIdx];
        const docLen = docLens[docIdx];
        
        // Count term frequency (TF) in this doc
        const tf = {};
        for (const token of tokens) {
          tf[token] = (tf[token] || 0) + 1;
        }

        let score = 0;
        for (const token of queryTokens) {
          const termFreq = tf[token] || 0;
          if (termFreq > 0) {
            const numerator = termFreq * (this.k1 + 1);
            const denominator = termFreq + this.k1 * (1 - this.b + this.b * (docLen / avgdl));
            score += idf[token] * (numerator / denominator);
          }
        }

        return {
          id: chunk.id,
          text: chunk.text,
          metadata: chunk.metadata,
          score,
          type: 'keyword'
        };
      });

      // Filter out chunks with 0 score, sort descending and slice limit
      return scoredChunks
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      logger.error('BM25 search error:', error);
      return [];
    }
  }

  /**
   * Reciprocal Rank Fusion (RRF) to combine Semantic and BM25 results.
   */
  mergeRRF(semanticResults, keywordResults, limit = 10, rrfK = 60) {
    const chunkMap = new Map();
    
    // Process semantic rankings
    semanticResults.forEach((chunk, index) => {
      const rank = index + 1;
      const rrfScore = 1.0 / (rrfK + rank);
      chunkMap.set(chunk.id, {
        chunk,
        rrfScore,
        semanticRank: rank,
        keywordRank: null
      });
    });

    // Process keyword rankings
    keywordResults.forEach((chunk, index) => {
      const rank = index + 1;
      const rrfScore = 1.0 / (rrfK + rank);
      
      if (chunkMap.has(chunk.id)) {
        const entry = chunkMap.get(chunk.id);
        entry.rrfScore += rrfScore;
        entry.keywordRank = rank;
      } else {
        chunkMap.set(chunk.id, {
          chunk,
          rrfScore,
          semanticRank: null,
          keywordRank: rank
        });
      }
    });

    // Sort by RRF score descending
    const mergedList = Array.from(chunkMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit)
      .map(entry => {
        // Return structured node
        const sourceDetails = [];
        if (entry.semanticRank !== null) sourceDetails.push(`semantic (rank ${entry.semanticRank})`);
        if (entry.keywordRank !== null) sourceDetails.push(`keyword (rank ${entry.keywordRank})`);

        return {
          id: entry.chunk.id,
          text: entry.chunk.text,
          metadata: entry.chunk.metadata,
          score: entry.rrfScore,
          retrieval_method: sourceDetails.join(' + ')
        };
      });

    return mergedList;
  }

  /**
   * Advanced Hybrid retrieval combining vector and keyword search.
   */
  async retrieveHybrid(queryText, options = {}) {
    const limit = options.limit || 10;
    const filter = options.filter || null;
    const rrfK = options.rrfK || 60;

    // Fetch double the limit from each search to have sufficient coverage for fusion
    const searchLimit = limit * 2;

    const semanticList = await this.searchSemantic(queryText, searchLimit, filter);
    const keywordList = this.searchBM25(queryText, searchLimit, filter);

    logger.info(`Semantic search found ${semanticList.length} items. BM25 found ${keywordList.length} items.`);
    
    // Merge results using RRF
    const mergedChunks = this.mergeRRF(semanticList, keywordList, limit, rrfK);
    return mergedChunks;
  }
}

export const retrievalService = new RetrievalService();
export default retrievalService;
