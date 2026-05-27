# Advanced ChromaDB Developer Guide

ChromaDB is the AI-native open-source vector database designed to make it simple to build LLM apps by storing and querying embeddings. It focuses on developer productivity, simplicity, and scaling.

## Core Concepts

1. **Collections**: A collection in Chroma is analogous to a table in a relational database or a collection in MongoDB. It stores document text, embedding vectors, and metadata associated with each document.
2. **Embeddings**: High-dimensional vector representations of text. By default, Chroma can generate them using sentence-transformers, but custom embeddings (like local HuggingFace or OpenAI) can be pushed directly.
3. **HNWS Index**: ChromaDB uses Hierarchical Navigable Small World (HNSW) graphs for fast, approximate nearest neighbor (ANN) searches.

## Distance Metrics

ChromaDB supports three distance functions to calculate similarity:

- **Squared L2 (Euclidean)**: Measures the straight-line distance between two points in Euclidean space. Lower distance indicates higher similarity. Formula: `l2`
- **Cosine Distance**: Measures the cosine of the angle between two vectors, ignoring magnitude. Popular for textual semantics. Distance ranges from 0 to 2. Formula: `cosine`.
- **Inner Product (IP)**: Calculated as the negative inner product (to align with distance minimization). Formula: `ip`.

You can configure the distance metric during collection creation:
```javascript
const collection = await client.createCollection({
  name: "tech_docs",
  metadata: { "hnsw:space": "cosine" }
});
```

## ChromaDB Querying and Metadata Filtering

ChromaDB allows filtering results on metadata using a MongoDB-like query structure.
Example:
```javascript
const results = await collection.query({
  queryEmbeddings: [[0.1, 0.2, ...]],
  nResults: 5,
  where: {
    "author": "john_doe"
  }
});
```

Supported comparison operators include `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`. Logical operators include `$and` and `$or`.

## HNSW Tuning Configurations

You can tune Chroma's performance by setting HNSW parameters in the metadata:
- `hnsw:construction_ef`: Controls speed vs accuracy tradeoffs during index building (defaults to 100).
- `hnsw:search_ef`: Controls speed vs accuracy tradeoffs during search query execution (defaults to 10).
- `hnsw:M`: The maximum number of connection tracks per node in the graph (defaults to 16).
