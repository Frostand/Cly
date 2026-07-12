# Topic Memory & Growth Over Time

**Branch:** `feature/topic-memory`

## What

Track which topics have been researched, when, and what was found. Show how understanding grows across multiple runs on related topics.

## Why

Users research a topic, then come back weeks later and run a new search. The app should remember previous runs, show what's new since last time, and highlight papers that appeared in multiple runs.

## How to Implement

### Backend

1. **Topic history endpoint** — `GET /api/v1/topics`
   - Returns list of unique topics researched, with run count, last run date, paper count per run
   - Group similar topics (e.g., "RAG" and "retrieval augmented generation")

2. **Cross-run paper detection**
   - When a new run completes, check which papers also appeared in previous runs for the same/similar topic
   - Calculate "persistence score" — papers appearing in 3+ runs are "consistently relevant"
   - Add `appeared_in_previous_runs: int` to paper metadata

3. **New papers detection** — `GET /api/v1/runs/{id}/new-papers`
   - Compare current run papers against all previous runs
   - Highlight papers published after the last run date
   - Flag: `is_new_since_last_run: bool`

4. **Topic insights** — `GET /api/v1/topics/{topic}/insights`
   - Papers consistently appearing across runs
   - New papers since last run
   - Evolving clusters — how the landscape changed between runs

### Frontend

5. **Topic history sidebar**
   - List of previous topics, click to see all runs for that topic
   - "New" badge on topics with papers published since last visit

6. **Run timeline**
   - Chronological view of runs for a topic
   - Each run shows: date, paper count, landscape overview snippet
   - Paper count trend (growing field? declining?)

7. **Cross-run comparison**
   - Side-by-side landscape comparison between two runs
   - "Papers new since your last run" section highlighted

## When You Know It's Done

- [ ] Topic history shows all previously researched topics
- [ ] Papers appearing in multiple runs are flagged
- [ ] New papers since last run are highlighted
- [ ] Landscape comparison between two runs
- [ ] All data stays local (SQLite)

## Expected Results

Search "RAG" again after a month → see "5 new papers since your last run" highlighted at the top → notice 3 papers that appeared in all 3 of your RAG runs → the landscape has grown a new "multi-modal RAG" cluster.

## Dependencies

- `feature/local-folders` (run grouping infrastructure)

## Files to Touch

```
backend/app/routes/topics.py              (new)
backend/app/routes/runs.py                (add cross-run endpoints)
backend/app/storage/repositories.py       (cross-run queries)
frontend/app/components/TopicHistory.tsx  (new)
frontend/app/components/RunTimeline.tsx   (new)
frontend/app/page.tsx                     (topic history sidebar)
backend/tests/test_topic_memory.py        (new)
```
