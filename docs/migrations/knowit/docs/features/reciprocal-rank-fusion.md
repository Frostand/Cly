# Reciprocal Rank Fusion (keyword + semantic)

**Branch:** `feature/reciprocal-rank-fusion`

## What

Replace the current single-keyword ranker with a combined ranking system that merges keyword scores with semantic similarity scores using Reciprocal Rank Fusion (RRF).

## Why

Keyword matching alone misses papers that are conceptually relevant but use different terminology. Combining keyword + semantic ranking gives better ordering without needing a full embedding re-ranker in Wave 4.

## How to Implement

### Backend

1. **Create `app/services/ranking/semantic_ranker.py`**
   - Emit a semantic relevance score for each paper against the topic
   - Use the mock provider's deterministic embeddings for development (SHA256-hash-based vectors, cosine similarity)
   - When a real embedding provider is available, swap it in via the provider interface

2. **Create `app/services/ranking/rrf_ranker.py`**
   - Accept keyword-ranked and semantic-ranked lists
   - Compute RRF: `score = 1/(k + rank)` for each ranker, sum across rankers, sort descending
   - Use `k=60` (standard RRF constant)
   - Produce a merged `list[RankedPaper]` with `ranking_method = "rrf_keyword_semantic_v1"`
   - `ranking_explanation` should show both component ranks

3. **Update `research_pipeline.py`**
   - After keyword ranking, run semantic ranking
   - Merge via RRF before saving ranked papers
   - Update `current_stage` to include a `SEMANTIC_RANKING` status

4. **Add `RunStatus.SEMANTIC_RANKING`** to `app/models/runs.py`

### Frontend
- The papers table already displays `ranking_method` — no changes needed beyond seeing the new method name

## When You Know It's Done

- [ ] `rrf_ranker.py` produces merged rankings where papers scoring high in both lists rank highest
- [ ] Papers matching the topic only semantically still appear above irrelevant ones
- [ ] `ranking_method` shows `rrf_keyword_semantic_v1`
- [ ] Pipeline stage transitions: searching → ranking → semantic_ranking → extracting → synthesizing
- [ ] All existing tests pass
- [ ] New test: `test_rrf_merges_both_signals.py` — papers with low keyword but high semantic rank above papers with neither
- [ ] New test: `test_semantic_ranker_empty_papers.py`

## Expected Results

A research run for "retrieval augmented generation" should rank papers about "knowledge-grounded language models" (semantically close, keyword-distant) above papers that merely mention "retrieval" in passing.

## Dependencies

- None (keyword ranker already exists; semantic ranker starts with mock embeddings)

## Files to Touch

```
backend/app/services/ranking/semantic_ranker.py     (new)
backend/app/services/ranking/rrf_ranker.py           (new)
backend/app/models/runs.py                           (add RunStatus)
backend/app/pipeline/research_pipeline.py             (wire stages)
backend/tests/test_rrf_ranker.py                      (new)
backend/tests/test_semantic_ranker.py                 (new)
```
