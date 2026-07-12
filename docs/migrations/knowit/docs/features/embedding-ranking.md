# Embedding + Cross-Encoder Ranking

**Branch:** `feature/embedding-ranking`

## What

Upgrade ranking from keyword+semantic RRF to full embedding-based similarity with an optional cross-encoder re-ranking pass for the top N papers.

## Why

Keyword ranking misses conceptual connections. RRF with mock embeddings is better but not great. Real embeddings (via Ollama or cloud provider) give much stronger ranking. A cross-encoder re-ranks the top candidates with finer precision.

## How to Implement

### Backend

1. **Use provider embeddings** instead of mock hash embeddings
   - Call `provider.embed_texts([topic] + [paper.title + " " + paper.abstract for paper in papers])`
   - Compute cosine similarity between topic embedding and each paper embedding
   - Normalize scores to 0–1 range

2. **Add cross-encoder re-ranking** (optional, behind a flag)
   - After embedding ranking, take top 20 papers
   - For each paper, call `provider.rerank(query=topic, documents=[paper.title + " " + paper.abstract])`
   - This is a mock implementation: use the provider's `rerank` method
   - Merge re-rank scores with embedding scores via weighted RRF

3. **Create `app/services/ranking/embedding_ranker.py`**
   - `rank_by_embeddings(topic, papers, provider)` → `list[RankedPaper]`
   - `ranking_method = "embedding_v1"` or `"embedding_cross_encoder_v1"`

4. **Update pipeline**
   - After keyword ranking, run embedding ranking if provider supports it
   - Merge keyword + embedding via RRF
   - Optionally re-rank top-N with cross-encoder

5. **Fallback gracefully**
   - If provider doesn't support embeddings, skip embedding ranking
   - If provider doesn't support re-ranking, skip cross-encoder
   - Always produce results (even if only keyword ranking worked)

## When You Know It's Done

- [ ] Embedding ranking works with Ollama (or mock fallback)
- [ ] Papers conceptually similar to the topic rank higher
- [ ] Cross-encoder re-ranking improves top-10 ordering when available
- [ ] Falls back gracefully when provider lacks embedding/reranking support
- [ ] `ranking_method` reflects which rankers were active
- [ ] Tests: `test_embedding_ranker.py`, `test_cross_encoder_fallback.py`

## Expected Results

With Ollama embeddings, "knowledge-grounded language models" ranks above "retrieval systems for databases" because the semantic meaning is closer to "retrieval augmented generation" even though both share keywords.

## Dependencies

- `feature/reciprocal-rank-fusion` (RRF infrastructure already in place)

## Files to Touch

```
backend/app/services/ranking/embedding_ranker.py     (new)
backend/app/services/ranking/cross_encoder_ranker.py (new)
backend/app/services/ranking/rrf_ranker.py            (update weights)
backend/app/pipeline/research_pipeline.py             (wire stages)
backend/tests/test_embedding_ranker.py                (new)
backend/tests/test_cross_encoder_ranker.py            (new)
```
