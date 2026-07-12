# Reading Map UI

**Branch:** `feature/reading-map-ui`

## What

A guided reading experience that shows papers in a recommended order based on the landscape's `recommended_reading_path`, with progress tracking.

## Why

Users get 25 papers back but don't know where to start. The landscape already generates a reading path. A dedicated reading mode turns that into a guided flow: "Read this first, then this, then dig into these clusters."

## How to Implement

### Frontend

1. **Reading mode toggle** — "Table | Graph | Read" tabs above the results

2. **Reading view layout:**
   - Left: reading list (numbered, shows paper titles from `recommended_reading_path`)
   - Center: current paper view (title, abstract, structured notes, PDF link)
   - Right: progress panel (X of Y papers read, time estimate, clusters explored)

3. **Progress tracking:**
   - Click "Mark as read" to advance
   - Progress persists in `localStorage` per run/folder
   - Visual checkmark next to read papers
   - "Continue reading" button picks up where you left off

4. **Reading list features:**
   - Drag to reorder the reading path
   - "Skip for now" — moves paper to a "Later" section
   - Highlight the current paper
   - Show confidence badge on each (full-text vs abstract-only)

5. **Completion state:**
   - "You've read all N papers in this run"
   - Summary of clusters covered
   - "Explore related papers" link to relationship map

## When You Know It's Done

- [ ] Reading mode shows papers in the landscape's recommended order
- [ ] Current paper shows full details (title, abstract, notes, links)
- [ ] Mark as read advances to next paper
- [ ] Progress persists across page reloads
- [ ] Can reorder the reading list
- [ ] Completion screen shows summary stats

## Expected Results

Click "Read" → first paper loads → read the structured notes → click "Mark as read" → second paper loads → after 5 papers, see "3 of 5 papers / 2 clusters covered".

## Dependencies

- `feature/paper-detail-panel` (paper view component)
- `feature/relationship-map` (completion → explore related)

## Files to Touch

```
frontend/app/components/ReadingMap.tsx        (new)
frontend/app/components/ReadingList.tsx       (new)
frontend/app/components/ReadingProgress.tsx   (new)
frontend/app/page.tsx                         (reading mode toggle, state)
frontend/app/globals.css                      (reading layout styles)
```
