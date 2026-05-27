# Groq API High-Speed Performance Report

Groq is an AI infrastructure company that built the Language Processing Unit (LPU) Inference Engine. The LPU is a new processor architecture designed specifically for the sequential and intensive nature of LLM workloads.

## LPU Architecture vs Traditional GPU

Traditional Graphics Processing Units (GPUs) are designed for massive parallel graphics workloads, featuring thousands of slow threads. When running LLM inference, GPUs are often memory-bandwidth bottlenecked, as they wait for model weights to load from High Bandwidth Memory (HBM).

Groq's LPU is a Tensor Streaming Processor (TSP) that features:
- **SRAM-only memory**: The entire model is loaded directly into ultra-fast SRAM memory on the chip. There is zero external memory access delay, enabling extremely high bandwidth.
- **Deterministic hardware execution**: Execution is scheduled at compile-time by the software compiler rather than at runtime by hardware schedulers. This guarantees deterministic latency and zero jitter.

## Inference Performance Benchmarks (Tokens Per Second)

Groq achieves record-breaking generation speeds on popular open-weights models:

- **Llama 3.1 8B Instant**: Up to 800 - 1200 tokens per second (T/s) per user.
- **Llama 3.3 70b SpecDec**: Up to 250 - 450 tokens per second (T/s) per user.
- **Mixtral 8x7B 32768**: Up to 250 - 350 tokens per second (T/s) per user.

This high speed enables real-time multi-agent workflows, long query expansions, and real-time reranking that would otherwise be sluggish on standard GPU hardware (where speed is typically 15 - 50 T/s).

## API Integration Details

The Groq NodeJS SDK is compatible with the standard OpenAI API structure.
Connection configuration example:
```javascript
import { Groq } from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const chatCompletion = await groq.chat.completions.create({
  messages: [{ role: 'user', content: 'Explain LPUs.' }],
  model: 'llama-3.3-70b-versatile',
  temperature: 0.2,
  stream: true
});
```

### Groq Supported Models list
1. `llama-3.3-70b-versatile` - highly capable general generation model and the replacement for the decommissioned `llama3-70b-8192`.
2. `llama-3.1-8b-instant` - long-context, ultra-low-latency model for query rewriting and production RAG utilities.
3. `mixtral-8x7b-32768` - 32k context window, high accuracy, MOE model.
4. `gemma2-9b-it` - 8k context window, Google's lightweight open model.
