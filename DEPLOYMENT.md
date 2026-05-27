# Vercel Deployment Guide

This repo is configured as one Vercel project:

- React/Vite frontend builds from `frontend/` into `frontend/dist`
- Express backend is served through `api/index.js`
- `/api/*` requests are rewritten to the backend serverless function

## Important Constraint

Vercel cannot run the local Chroma server from `backend/scripts/start-chroma.sh`, and it cannot persist `backend/db/chroma_data`. Production must use Chroma Cloud or another external Chroma-compatible service.

## Required Vercel Environment Variables

Add these in Vercel Project Settings -> Environment Variables:

```env
NODE_ENV=production
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_FAST_MODEL=llama-3.1-8b-instant

CHROMA_HOST=https://api.trychroma.com
CHROMA_API_KEY=your_chroma_cloud_api_key
CHROMA_TENANT=your_chroma_tenant
CHROMA_DATABASE=your_chroma_database

LANGSMITH_TRACING=true
LANGSMITH_API_KEY=your_langsmith_api_key
LANGSMITH_PROJECT=advanced-rag-production
LANGSMITH_ENDPOINT=https://api.smith.langchain.com

REDIS_URL=disabled
VITE_API_BASE_URL=
```

Leave `VITE_API_BASE_URL` empty for same-domain Vercel deployment. The frontend will call `/api`.

## Deploy From Vercel Dashboard

1. Push this repository to GitHub.
2. Import the repository in Vercel.
3. Keep the root directory as the repository root.
4. Vercel will use `vercel.json` for install, build, output, functions, and rewrites.
5. Add all required environment variables.
6. Deploy.

## Deploy From CLI

```bash
npm i -g vercel
vercel login
vercel
vercel env add GROQ_API_KEY
vercel env add CHROMA_API_KEY
vercel env add CHROMA_TENANT
vercel env add CHROMA_DATABASE
vercel env add LANGSMITH_TRACING
vercel env add LANGSMITH_API_KEY
vercel env add LANGSMITH_PROJECT
vercel env add LANGSMITH_ENDPOINT
vercel --prod
```

## Data Setup

Before production chat works well, ingest documents into the Chroma Cloud collection named `document_chunks`.

Recommended workflow:

1. Put documents in `backend/documents`.
2. Set Chroma Cloud env vars locally in `backend/.env`.
3. Run the backend locally.
4. Trigger ingestion from the UI or `POST /api/documents/ingest`.
5. Confirm vectors are present in Chroma Cloud.
6. Deploy to Vercel.

## Local Development

Start local Chroma:

```bash
./backend/scripts/start-chroma.sh
```

Start backend:

```bash
cd backend
npm run dev
```

Start frontend:

```bash
cd frontend
npm run dev
```

For local Vite dev, the frontend defaults to `http://localhost:5005/api`.
