# Polish & Reliability

**Branch:** `feature/polish-reliability`

## What

System-wide hardening: error recovery, offline support, performance optimization, accessibility audit, and production-readiness checks.

## Why

The app works but is fragile: no offline handling, long pipelines can fail silently, no structured logging, no performance budgets. This milestone makes it reliable enough for daily use.

## How to Implement

### Backend

1. **Structured logging**
   - Replace `print()` with Python `logging` module
   - Log levels: DEBUG (pipeline steps), INFO (run lifecycle), WARNING (rate limits, fallbacks), ERROR (failures)
   - Log to file in `backend/data/logs/` by default, configurable via `RFM_LOG_LEVEL`
   - Never log full paper text, prompts, or API keys

2. **Pipeline retry & recovery**
   - arXiv search: retry up to 3 times with exponential backoff
   - Provider calls: retry once on transient errors, fail gracefully with fallback
   - Pipeline state: if server restarts mid-pipeline, detect orphaned runs and mark them failed

3. **Error UX improvements**
   - Specific error messages instead of generic "run failed"
   - "arXiv is rate-limiting, retrying in 5s..." vs "Run failed"
   - Distinguish: user error (bad topic), provider error (API down), network error (no internet)

4. **Performance**
   - Add database indexes on commonly queried columns (`runs.created_at`, `run_papers.run_id`, `paper_extractions.run_id`)
   - Batch paper saves instead of one-by-one
   - Provider health checks cached for 30 seconds
   - Response size limits: paginate papers if >100 results

5. **Health dashboard** — `GET /api/v1/system/health`
   - Database: connected, size, table counts
   - Providers: each provider's health
   - arXiv API: reachable
   - Storage: disk space remaining in data directory

### Frontend

6. **Offline handling**
   - Detect network loss → show "Backend unreachable" banner
   - Queue actions? (out of scope for now, just graceful degradation)
   - Retry button on failed fetches

7. **Loading states everywhere**
   - Skeleton loaders for table rows, landscape panel, provider list
   - No flash of empty state before data loads

8. **Accessibility audit**
   - All interactive elements keyboard-navigable
   - Screen reader labels on sort controls, graph nodes, folder actions
   - Color contrast passes WCAG AA
   - Focus management in modals and slide-overs

9. **Error boundaries**
   - React error boundary around the main app
   - "Something went wrong" fallback UI with reload button
   - Per-section error boundaries (table, graph, landscape)

## When You Know It's Done

- [ ] Structured logging with configurable levels
- [ ] Pipeline recovers from transient arXiv/provider errors
- [ ] Specific error messages replace generic ones
- [ ] Database queries are indexed and fast
- [ ] Loading skeletons for all async content
- [ ] Keyboard navigation works throughout
- [ ] Offline detection with user feedback
- [ ] Error boundary catches render crashes

## Expected Results

The app handles a spotty internet connection gracefully: "Searching arXiv... retry 1/3" → succeeds → pipeline continues. An error in the landscape synthesis shows "Synthesis failed: provider timeout" instead of "Run failed". The UI never shows a blank state while loading.

## Dependencies

- Everything above (this is the final quality pass)

## Files to Touch

```
backend/app/ (scattered: logging, retries, indexes, error messages)
backend/app/storage/database.py             (add indexes)
frontend/app/components/ErrorBoundary.tsx   (new)
frontend/app/components/Skeleton.tsx        (new)
frontend/app/globals.css                    (skeleton animations)
frontend/app/page.tsx                       (offline detection, skeletons)
```
