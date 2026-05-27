import { traceable } from 'langsmith/traceable';
import dotenv from 'dotenv';

dotenv.config();

const truthy = (value) => /^(true|1|yes)$/i.test(String(value || ''));

export const isLangSmithEnabled = () => (
  truthy(process.env.LANGSMITH_TRACING) && Boolean(process.env.LANGSMITH_API_KEY)
);

export const summarizeChunk = (chunk) => ({
  id: chunk.id,
  source: chunk.metadata?.source,
  chunk_index: chunk.metadata?.chunk_index,
  score: chunk.score,
  relevance_score: chunk.relevance_score,
  retrieval_method: chunk.retrieval_method,
  text_preview: chunk.text ? `${chunk.text.slice(0, 240)}${chunk.text.length > 240 ? '...' : ''}` : ''
});

export async function traceStep({ name, runType = 'chain', inputs = {}, metadata = {}, tags = [] }, fn, summarizeOutput) {
  if (!isLangSmithEnabled()) {
    return await fn();
  }

  const wrapped = traceable(
    async () => await fn(),
    {
      name,
      run_type: runType,
      tags: ['advanced-rag', ...tags],
      metadata: {
        service: 'advanced-rag-api',
        environment: process.env.NODE_ENV || 'development',
        ...metadata
      },
      processInputs: () => inputs,
      processOutputs: (outputs) => (
        summarizeOutput ? summarizeOutput(outputs) : outputs
      )
    }
  );

  return await wrapped();
}
