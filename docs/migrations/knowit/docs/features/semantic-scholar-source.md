# Semantic Scholar Paper Source

**Branch:** `feature/semantic-scholar-source`

## What

Add Semantic Scholar as a second paper source alongside arXiv, using its free API to fetch papers, citations, and references.

## Why

arXiv covers computer science, physics, math, etc. but misses biology, medicine, and social science papers. Semantic Scholar broadens coverage and provides citation data that arXiv doesn't have.

## How to Implement

### Backend

1. **Create `app/services/paper_sources/semantic_scholar_search.py`**
   - Use Semantic Scholar REST API (no key required for basic access, rate limit ~100/5min)
   - Endpoint: `https://api.semanticscholar.org/graph/v1/paper/search?query={topic}&limit={max}&fields=title,authors,abstract,year,url,externalIds,citationCount,referenceCount`
   - Normalize into the existing `Paper` model
   - `source = "semantic_scholar"`, `paper_id = "s2:..."`, `source_id` = the S2 paper ID
   - Map categories from S2's `fieldsOfStudy` if available

2. **Update `PaperSearchFn` type** to include source selection:
   ```python
   PaperSearchFn = Callable[[str, int, str], list[Paper]]  # topic, max_results, source
   ```

3. **Update search route** — `GET /api/v1/search/papers?source=arxiv|semantic_scholar|both`
   - `source=both` searches both and merges, deduplicating by DOI/title similarity

4. **Handle S2 rate limits**
   - Respect `Retry-After` headers
   - Implement exponential backoff

5. **Add `citation_count` and `reference_count`** to `Paper` model (optional fields, null for arXiv)

### Frontend

6. **Source selector** — dropdown or tabs: "arXiv | Semantic Scholar | Both"
7. **Source badge** in paper table rows: colored badge showing "arXiv" or "Semantic Scholar"
8. **Citation count** column when S2 is the source

## When You Know It's Done

- [ ] Can search Semantic Scholar for papers
- [ ] Papers from both sources share the same `Paper` model
- [ ] `source=both` merges and deduplicates results
- [ ] Rate limiting is handled gracefully with user feedback
- [ ] Citation counts appear when available
- [ ] Tests: `test_semantic_scholar_search.py`

## Expected Results

Search "retrieval augmented generation" → get 10 arXiv papers + 10 Semantic Scholar papers → table shows source badges → S2 papers include citation counts.

## Dependencies

- None

## Files to Touch

```
backend/app/services/paper_sources/semantic_scholar_search.py  (new)
backend/app/models/papers.py                                    (add citation fields)
backend/app/routes/search.py                                    (source param)
backend/app/pipeline/research_pipeline.py                       (source selection)
frontend/app/page.tsx                                           (source selector, badges)
backend/tests/test_semantic_scholar_search.py                   (new)
```
