import { Groq } from 'groq-sdk';
import { retrievalService } from './retrievalService.js';
import { rerankingService } from './rerankingService.js';
import { cacheService } from './cacheService.js';
import { logger } from '../utils/logger.js';
import { traceStep, summarizeChunk } from '../utils/langsmith.js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

class LLMService {
  constructor() {
    this.groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
    this.defaultModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'; // High capacity for generation
    this.fastModel = process.env.GROQ_FAST_MODEL || 'llama-3.1-8b-instant'; // Low latency for query optimization
    this.maxContextTokens = 3000; // rough word limit to fit context safety margins
  }

  /**
   * Rewrites the user query using conversation history to make it standalone and optimized for search.
   */
  async rewriteQuery(queryText, history = []) {
    return await traceStep(
      {
        name: 'rag.query_rewrite',
        runType: 'llm',
        inputs: {
          query: queryText,
          history_turns: history.length,
          model: this.fastModel
        },
        metadata: {
          provider: 'groq',
          model: this.fastModel
        }
      },
      async () => {
        if (history.length === 0 || !this.groq) {
          return queryText;
        }

        try {
          logger.info('Optimizing query based on conversation history...');
          
          const systemPrompt = `You are a search query optimizer. Given a conversation history and a new question, your job is to rewrite the new question into a standalone, descriptive search query.
The rewritten query must:
1. Be a complete sentence or concise search phrase.
2. Incorporate important context from previous turns (names, terms, topics).
3. Do NOT attempt to answer the question.
4. Only output the final rewritten query, nothing else (no conversational framing, no quotes).`;

          const formattedHistory = history
            .slice(-6) // Take last 6 turns
            .map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
            .join('\n');

          const userPrompt = `Conversation History:
${formattedHistory}

New Question: ${queryText}
Rewritten Standalone Query:`;

          const response = await this.groq.chat.completions.create({
            model: this.fastModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.1,
            max_tokens: 150
          });

          const rewritten = response.choices[0]?.message?.content?.trim() || queryText;
          logger.info(`Original query: "${queryText}" -> Optimized: "${rewritten}"`);
          return rewritten;
        } catch (error) {
          logger.error('Error rewriting query, using original query:', error);
          return queryText;
        }
      },
      (rewritten) => ({ rewritten_query: rewritten })
    );
  }

  /**
   * Intelligently selects context chunks, strictly respecting word/token budgets.
   */
  selectTopKContext(chunks) {
    const selected = [];
    let accumulatedWords = 0;

    for (const chunk of chunks) {
      // Basic word-count estimation for token control
      const wordCount = chunk.text.split(/\s+/).length;
      if (accumulatedWords + wordCount > this.maxContextTokens) {
        logger.debug(`Context budget reached. Stopping ingestion of sources at rank ${selected.length + 1}`);
        break;
      }
      
      // Only include chunks that have a threshold relevance
      if (chunk.relevance_score && chunk.relevance_score < 0.15) {
        logger.debug(`Skipping chunk ${chunk.id} due to low relevance score: ${chunk.relevance_score}`);
        continue;
      }

      selected.push(chunk);
      accumulatedWords += wordCount;
    }

    return selected;
  }

  /**
   * Orchestrates retrieval, caching, reranking, and streams the answer using SSE.
   * @param {string} rawQuery 
   * @param {Array} history 
   * @param {Object} options 
   * @param {Response} res - Express Response object to stream SSE
   */
  async streamRAGAnswer(rawQuery, history = [], options = {}, res) {
    return await traceStep(
      {
        name: 'rag.chat',
        runType: 'chain',
        inputs: {
          query: rawQuery,
          history_turns: history.length,
          use_llm_reranker: Boolean(options.useLlmReranker),
          filter: options.filter || null
        },
        metadata: {
          groq_model: this.defaultModel,
          groq_fast_model: this.fastModel
        }
      },
      async () => await this._streamRAGAnswer(rawQuery, history, options, res),
      (outputs) => outputs || { streamed: true }
    );
  }

  async _streamRAGAnswer(rawQuery, history = [], options = {}, res) {
    const useLlmReranker = options.useLlmReranker || false;
    const filter = options.filter || null;
    const cacheKey = `rag:${crypto.createHash('md5').update(rawQuery + JSON.stringify(history) + JSON.stringify(options)).digest('hex')}`;

    const hasGroqKey = !!(this.groq && process.env.GROQ_API_KEY);

    try {
      // 1. Check Cache
      const cachedResponse = await cacheService.get(cacheKey);
      if (cachedResponse) {
        logger.info('Serving complete cached response...');
        res.write(`event: query_optimized\ndata: ${JSON.stringify({ rewrittenQuery: cachedResponse.rewrittenQuery })}\n\n`);
        res.write(`event: sources_retrieved\ndata: ${JSON.stringify(cachedResponse.sources)}\n\n`);
        
        // Stream the cached text in tiny chunks to simulate a real typing experience
        const words = cachedResponse.answer.split(' ');
        for (let i = 0; i < words.length; i += 3) {
          const chunkStr = words.slice(i, i + 3).join(' ') + ' ';
          res.write(`event: content\ndata: ${JSON.stringify({ token: chunkStr })}\n\n`);
          await new Promise(r => setTimeout(r, 40));
        }
        
        res.write(`event: done\ndata: {}\n\n`);
        res.end();
        return;
      }

      // 2. Rewrite/Optimize the query
      let rewrittenQuery = rawQuery;
      if (hasGroqKey) {
        rewrittenQuery = await this.rewriteQuery(rawQuery, history);
      } else {
        logger.info('Groq API Key not found. Skipping query rewriting.');
      }
      res.write(`event: query_optimized\ndata: ${JSON.stringify({ rewrittenQuery })}\n\n`);

      // 3. Hybrid Retrieve
      const retrievedChunks = await traceStep(
        {
          name: 'rag.hybrid_retrieval',
          runType: 'retriever',
          inputs: {
            query: rewrittenQuery,
            limit: 10,
            filter
          },
          metadata: {
            vector_store: 'chroma',
            keyword_retriever: 'bm25'
          }
        },
        async () => await retrievalService.retrieveHybrid(rewrittenQuery, {
          limit: 10,
          filter
        }),
        (chunks) => ({
          chunk_count: chunks.length,
          chunks: chunks.slice(0, 10).map(summarizeChunk)
        })
      );

      // 4. Rerank Chunks
      // Force local mathematical rerank if Groq key is missing
      const rerankedChunks = await traceStep(
        {
          name: 'rag.rerank',
          runType: useLlmReranker && hasGroqKey ? 'llm' : 'chain',
          inputs: {
            query: rewrittenQuery,
            retrieved_count: retrievedChunks.length,
            use_llm_reranker: useLlmReranker && hasGroqKey,
            limit: 5
          }
        },
        async () => await rerankingService.rerank(rewrittenQuery, retrievedChunks, {
          useLlmReranker: useLlmReranker && hasGroqKey,
          limit: 5
        }),
        (chunks) => ({
          chunk_count: chunks.length,
          chunks: chunks.slice(0, 10).map(summarizeChunk)
        })
      );

      // 5. Intelligent top-k selection
      const contextChunks = await traceStep(
        {
          name: 'rag.context_selection',
          runType: 'chain',
          inputs: {
            reranked_count: rerankedChunks.length,
            max_context_tokens: this.maxContextTokens
          }
        },
        async () => this.selectTopKContext(rerankedChunks),
        (chunks) => ({
          selected_count: chunks.length,
          chunks: chunks.map(summarizeChunk)
        })
      );
      
      // Map simplified citations for the frontend (cleaner payload)
      const frontendSources = contextChunks.map((chunk, index) => ({
        index: index + 1,
        id: chunk.id,
        source: chunk.metadata.source,
        text: chunk.text,
        relevance_score: chunk.relevance_score,
        retrieval_method: chunk.retrieval_method,
        keywords: chunk.metadata.keywords,
        chunk_index: chunk.metadata.chunk_index
      }));

      res.write(`event: sources_retrieved\ndata: ${JSON.stringify(frontendSources)}\n\n`);

      if (contextChunks.length === 0) {
        logger.warn('No relevant documents found.');
      }

      let fullAnswerText = '';

      if (hasGroqKey) {
        // 6. Build prompts
        const systemPrompt = `You are a helpful, professional, and accurate AI technical assistant. You must answer the user's question using ONLY the provided document chunks in the Context section below.

Strict Constraints:
1. Grounding: Answer the question based strictly on the retrieved Context. If the context does not contain enough information to answer, state clearly that you do not know the answer based on the stored documents. Do not make up information or use external knowledge.
2. Citations: You MUST cite your sources inline in your response using bracketed indices corresponding to the source list (e.g. [1], [2]). Every factual claim derived from a chunk must be followed by its citation index. If multiple chunks support a claim, list them like [1][2].
3. Detail: Be structured, thorough, and use markdown where appropriate (code blocks, bullet points, headers).
4. Do not mention "the context provided" or "according to the sources" explicitly in conversation unless necessary. Simply answer directly and cite inline.

Context:
${contextChunks.map((c, i) => `--- SOURCE [${i + 1}] (${c.metadata.source}) ---\n${c.text}\n`).join('\n')}`;

        const messages = [
          { role: 'system', content: systemPrompt },
          ...history.slice(-8), // include last 8 messages
          { role: 'user', content: rawQuery }
        ];

        fullAnswerText = await traceStep(
          {
            name: 'rag.groq_generation',
            runType: 'llm',
            inputs: {
              query: rawQuery,
              context_count: contextChunks.length,
              model: this.defaultModel,
              temperature: 0.2,
              max_tokens: 1024
            },
            metadata: {
              provider: 'groq',
              model: this.defaultModel
            }
          },
          async () => {
            logger.info('Calling Groq completions API for streaming RAG generation...');
            const completion = await this.groq.chat.completions.create({
              model: this.defaultModel,
              messages,
              temperature: 0.2, // Low temperature for high fidelity to context
              max_tokens: 1024,
              stream: true
            });

            let streamedText = '';
            for await (const chunk of completion) {
              const token = chunk.choices[0]?.delta?.content || '';
              if (token) {
                streamedText += token;
                res.write(`event: content\ndata: ${JSON.stringify({ token })}\n\n`);
              }
            }

            return streamedText;
          },
          (answer) => ({
            answer_preview: answer.slice(0, 500),
            character_count: answer.length
          })
        );
      } else {
        // SIMULATION MODE
        logger.info('Simulating RAG generation due to missing Groq API Key...');
        
        let simResponse = '';
        if (contextChunks.length === 0) {
          simResponse = `⚠️ **[Simulation Mode - Groq API Key not found]**\n\nNo relevant documents could be found in the database. Please make sure documents are placed in the \`backend/documents/\` folder and are properly ingested.`;
        } else {
          simResponse = `💡 **[Simulation Mode - Groq API Key not found]**\n\nThis is a simulated response generated directly from the top matching local document chunks. To enable dynamic AI generation, please set a valid \`GROQ_API_KEY\` in your \`backend/.env\` file.\n\n### Synthesis of Retrieved Information:\n\n`;
          
          contextChunks.forEach((c, idx) => {
            const indexLabel = idx + 1;
            // Short summary of chunk text
            const firstSentence = c.text.split(/[.!?]/)[0] || c.text.substring(0, 80);
            simResponse += `- **From ${c.metadata.source} (Source [${indexLabel}]):** ${firstSentence}. [${indexLabel}]\n`;
          });

          simResponse += `\n### Extracted Keywords:\n`;
          const allKeywords = Array.from(new Set(contextChunks.flatMap(c => c.metadata.keywords ? c.metadata.keywords.split(',') : [])));
          simResponse += allKeywords.map(k => `\`${k}\``).join(', ') + '\n\n';
          
          simResponse += `### Sample Raw Chunk Context:\n\`\`\`text\n${contextChunks[0].text.substring(0, 300)}...\n\`\`\``;
        }

        fullAnswerText = simResponse;
        
        // Stream the simulated response
        const words = simResponse.split(' ');
        for (let i = 0; i < words.length; i += 3) {
          const chunkStr = words.slice(i, i + 3).join(' ') + ' ';
          res.write(`event: content\ndata: ${JSON.stringify({ token: chunkStr })}\n\n`);
          // Introduce a short delay to simulate network/processing streaming
          await new Promise(resolve => setTimeout(resolve, 30));
        }
      }

      // 7. Save completed response in cache (only if we retrieved valid context to avoid caching general empty pages)
      if (fullAnswerText) {
        await cacheService.set(cacheKey, {
          rewrittenQuery,
          sources: frontendSources,
          answer: fullAnswerText
        }, 600); // cache for 10 minutes
      }

      res.write(`event: done\ndata: {}\n\n`);
      res.end();

    } catch (error) {
      logger.error('Error during streaming RAG flow:', error);
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
}

export const llmService = new LLMService();
export default llmService;
