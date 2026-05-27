import { Groq } from 'groq-sdk';
import { logger } from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

class RerankingService {
  constructor() {
    this.groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
    this.stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 'from',
      'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'us', 'our', 'you', 'your', 'i', 'me', 'my',
      'he', 'him', 'his', 'she', 'her', 'has', 'have', 'had', 'do', 'does', 'did', 'as', 'if', 'then', 'else', 'when', 'where',
      'how', 'why', 'what', 'who', 'which', 'can', 'will', 'should', 'would', 'could', 'about', 'also', 'more', 'some', 'any'
    ]);
  }

  tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1 && !this.stopWords.has(word));
  }

  /**
   * Fast, local mathematical scoring to re-sort chunks based on overlaps and semantic distances.
   */
  scoreLocally(queryText, chunks) {
    const queryTokens = this.tokenize(queryText);
    const querySet = new Set(queryTokens);

    return chunks.map(chunk => {
      const chunkTokens = this.tokenize(chunk.text);
      const chunkSet = new Set(chunkTokens);

      // 1. Calculate Jaccard similarity
      const intersection = new Set([...querySet].filter(x => chunkSet.has(x)));
      const union = new Set([...querySet, ...chunkSet]);
      const jaccard = union.size > 0 ? intersection.size / union.size : 0;

      // 2. Keyword overlap density (ratio of query terms matched)
      const matches = queryTokens.filter(token => chunkSet.has(token)).length;
      const queryOverlapRatio = queryTokens.length > 0 ? matches / queryTokens.length : 0;

      // 3. Dense term occurrences (bonus if multiple instances of query terms occur)
      let totalOccurrences = 0;
      for (const token of queryTokens) {
        for (const chunkToken of chunkTokens) {
          if (chunkToken === token) totalOccurrences++;
        }
      }
      const occurrenceScore = chunkTokens.length > 0 ? Math.min(1.0, totalOccurrences / 10) : 0;

      // 4. Combine with the initial retrieval score (which is RRF score or cosine similarity)
      // Standardize initial score: we scale it to 0-1
      const initialScore = chunk.score || 0;
      
      // Calculate final combined mathematical relevance score
      const localRelevanceScore = (
        0.3 * initialScore +
        0.3 * queryOverlapRatio +
        0.2 * jaccard +
        0.2 * occurrenceScore
      );

      return {
        ...chunk,
        relevance_score: Math.round(localRelevanceScore * 100) / 100, // round to 2 decimal places
        jaccard_score: jaccard,
        overlap_score: queryOverlapRatio
      };
    });
  }

  /**
   * Optional LLM-based reranking using Groq for ultimate retrieval precision.
   * Send the top candidates to Groq and ask it to rate their direct relevance to the query.
   */
  async rerankWithGroq(queryText, chunks, limit = 5) {
    if (!this.groq || !process.env.GROQ_API_KEY) {
      logger.warn('Groq API key not configured. Skipping LLM reranking, falling back to local scoring.');
      return chunks;
    }

    if (chunks.length === 0) return [];

    // Only rerank the top candidates (up to 8) to optimize token usage and latency
    const candidates = chunks.slice(0, 8);
    const remainder = chunks.slice(8);

    try {
      logger.info(`Sending ${candidates.length} chunks to Groq for semantic reranking...`);
      
      const systemPrompt = `You are an expert information retrieval assistant. Your task is to evaluate the relevance of document chunks to a user's search query.
For each chunk, provide a relevance score between 0 and 100, where:
- 100 means the chunk contains the exact, complete, and direct answer to the query.
- 50 means the chunk is relevant and provides context, but does not fully answer the query.
- 0 means the chunk is completely irrelevant and unrelated to the query.

Respond STRICTLY in a valid JSON format. The response should be a JSON array of objects, each containing "id" (string) and "score" (number). Do not include any reasoning, markdown blocks (like \`\`\`json), or conversational filler.
Format example: [{"id": "chunk_1", "score": 95}, {"id": "chunk_2", "score": 40}]`;

      const userPrompt = `Query: "${queryText}"

Chunks to rank:
${candidates.map((c, i) => `[ID: ${c.id}] (Index ${i})\nContent: ${c.text}\n---\n`).join('\n')}`;

      const response = await this.groq.chat.completions.create({
        model: 'llama-3.1-8b-instant', // High-speed, cost-effective model
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' } // Enforce JSON
      });

      const resultText = response.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(resultText);
      
      // The model might wrap it in a parent object or return an array directly depending on its behavior
      let scoresList = [];
      if (Array.isArray(parsed)) {
        scoresList = parsed;
      } else if (parsed.scores && Array.isArray(parsed.scores)) {
        scoresList = parsed.scores;
      } else if (typeof parsed === 'object') {
        // Try to find any array inside the object
        const arrays = Object.values(parsed).find(val => Array.isArray(val));
        if (arrays) {
          scoresList = arrays;
        } else {
          // It might be a map of { id: score }
          scoresList = Object.entries(parsed).map(([id, score]) => ({ id, score }));
        }
      }

      const scoresMap = new Map();
      scoresList.forEach(item => {
        if (item.id && typeof item.score === 'number') {
          scoresMap.set(item.id, item.score / 100); // normalize to 0-1
        }
      });

      // Update candidate scores with LLM score
      const rerankedCandidates = candidates.map(chunk => {
        const llmScore = scoresMap.has(chunk.id) ? scoresMap.get(chunk.id) : null;
        
        // Combine local relevance score with LLM score if available (LLM has higher weight)
        let finalScore = chunk.relevance_score;
        if (llmScore !== null) {
          finalScore = 0.7 * llmScore + 0.3 * chunk.relevance_score;
        }
        
        return {
          ...chunk,
          relevance_score: Math.round(finalScore * 100) / 100,
          llm_score: llmScore
        };
      });

      // Merge back and sort by final relevance score
      const allReranked = [...rerankedCandidates, ...remainder]
        .sort((a, b) => b.relevance_score - a.relevance_score);

      logger.info('Groq reranking completed successfully.');
      return allReranked;

    } catch (error) {
      logger.error('Error in Groq reranking:', error);
      // Fallback: return chunks with local scores
      return chunks.sort((a, b) => b.relevance_score - a.relevance_score);
    }
  }

  /**
   * Main entrypoint for Reranking
   */
  async rerank(queryText, chunks, options = {}) {
    const useLlmReranker = options.useLlmReranker || false;
    const limit = options.limit || 5;

    // 1. Initial heuristic local scoring
    const locallyScored = this.scoreLocally(queryText, chunks);

    // 2. Perform LLM reranking if requested
    if (useLlmReranker) {
      return await this.rerankWithGroq(queryText, locallyScored, limit);
    }

    // Otherwise sort by local relevance score and return
    return locallyScored.sort((a, b) => b.relevance_score - a.relevance_score);
  }
}

export const rerankingService = new RerankingService();
export default rerankingService;
