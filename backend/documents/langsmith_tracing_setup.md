# LangSmith Tracing Setup

This backend is instrumented with LangSmith manual tracing for the RAG request path.

## What Gets Traced

Each `/api/chat` request creates a root `rag.chat` trace. The trace contains child runs for:

- `rag.query_rewrite`
- `rag.hybrid_retrieval`
- `rag.rerank`
- `rag.context_selection`
- `rag.groq_generation`

Trace payloads are summarized to include useful metadata, chunk IDs, source filenames, relevance scores, and short previews rather than full oversized documents.

## Environment Variables

Set these in `backend/.env`:

```env
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your_langsmith_api_key
LANGSMITH_PROJECT=advanced-rag-local
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
```

Restart the backend after changing these values.

## Run Locally

Start ChromaDB:

```bash
./backend/scripts/start-chroma.sh
```

Start the backend:

```bash
cd backend
npm run dev
```

Start the frontend:

```bash
cd frontend
npm run dev
```

Ask a question in the UI, then open LangSmith and select the project configured in `LANGSMITH_PROJECT`.
