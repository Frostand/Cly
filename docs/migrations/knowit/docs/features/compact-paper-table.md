# Compact Sortable Paper Table

**Branch:** `feature/compact-paper-table`

## What

Replace the current fixed-width HTML table with a compact, sortable table where users can click column headers to sort by rank, title, relevance score, or date.

## Why

The current table is not sortable, wastes horizontal space with a fixed min-width, and doesn't let users customize their view. A sortable table is essential for exploring results.

## How to Implement

### Frontend

1. **Add sort state to `page.tsx`**
   ```typescript
   const [sortKey, setSortKey] = useState<"rank" | "title" | "score" | "date">("rank");
   const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
   ```

2. **Sort papers before rendering**
   - `useMemo` to sort `rankedResult.papers` by `sortKey` and `sortDir`
   - Rank: `rank_position`
   - Title: `paper.title` (localeCompare)
   - Score: `relevance_score`
   - Date: `paper.published_date` (nulls last)

3. **Make column headers clickable**
   - Add `onClick` to each `<th>` that toggles sort
   - Show sort indicator (▲/▼) on the active column
   - `cursor-pointer` and `hover:bg-*` on headers

4. **Tighten layout**
   - Remove `min-w-[860px]` — let columns flow naturally
   - Add `max-w-[320px]` with `truncate` on the abstract cell
   - Make the title a row above the abstract on mobile via responsive classes
   - Add a compact view toggle (dense rows vs current spacing)

5. **Add column visibility toggles**
   - Small dropdown or checkboxes to show/hide: Score, Categories, Links, Explanation
   - Persist preference in `localStorage`

### Design Notes
- Keep the existing CSS custom properties for colors
- Sort indicators use the `--accent` color
- Compact view reduces padding from `py-4` to `py-2`

## When You Know It's Done

- [ ] Clicking column headers sorts the table
- [ ] Active sort column shows ▲ or ▼ indicator
- [ ] Table is responsive — works at 375px width without horizontal scroll
- [ ] Column visibility toggles work and persist across page reloads
- [ ] Compact/dense toggle works
- [ ] Sort order resets when a new run completes

## Expected Results

Users can click "Score" to see the most relevant papers at the top, or "Title" to alphabetize. The table fits on a phone screen without horizontal scrolling.

## Dependencies

- #5 (extract frontend types) — nice to have but not required

## Files to Touch

```
frontend/app/page.tsx         (sort state, header clicks, responsive layout)
frontend/app/globals.css      (sort indicator styles, compact row styles)
```
