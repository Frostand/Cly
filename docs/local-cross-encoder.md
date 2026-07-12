# Local literature cross-encoder

Cly can rerank literature with a locally hosted Hugging Face Text Embeddings Inference (TEI) reranker. The Electron process sends the research query and candidate title/abstract pairs to TEI's `/rerank` endpoint. Cly accepts loopback endpoints only, so research metadata is not sent to another machine.

## Start a local model

Choose the TEI image matching the computer architecture. One CPU example is:

```bash
docker run --rm -p 8080:80 \
  -v cly-tei-data:/data \
  ghcr.io/huggingface/text-embeddings-inference:cpu-1.9 \
  --model-id BAAI/bge-reranker-base
```

For Apple Silicon, use the current TEI ARM64 CPU image documented by Hugging Face. GPU-specific images are also available.

## Configure Cly

Start Cly with the loopback TEI base URL and the model identifier used by that server:

```bash
CLY_CROSS_ENCODER_URL=http://127.0.0.1:8080 \
CLY_CROSS_ENCODER_MODEL=BAAI/bge-reranker-base \
pnpm dev
```

When configured and healthy, literature results identify the ranking method as `cross_encoder_tei:<model>` and combine the cross-encoder order with keyword ranking through Reciprocal Rank Fusion. The method, model label, component ranks, and final explanation are saved in Source provenance.

If TEI is not configured, unavailable, times out, or returns malformed scores, literature discovery remains usable and visibly falls back to the deterministic metadata ranker.

Reference: [Hugging Face TEI quick tour](https://huggingface.co/docs/text-embeddings-inference/en/quick_tour#re-rankers).
