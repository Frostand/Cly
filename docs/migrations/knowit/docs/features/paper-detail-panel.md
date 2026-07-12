# Paper Detail Panel with Structured Notes

**Branch:** `feature/paper-detail-panel`

## What

Clicking a paper row opens a slide-over or expandable detail panel showing the full structured extraction notes, abstract, authors, categories, and links — all in one place without navigating away.

## Why

Currently the paper table shows truncated abstracts, inline extraction previews, and tiny category badges. Users need a focused reading view to inspect a paper's extracted notes and decide whether to save it.

## How to Implement

### Frontend

1. **Add detail panel state**
   ```typescript
   const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
   ```

2. **Create `PaperDetailPanel` component**
   - Slide-over from the right (desktop) or full-screen modal (mobile)
   - Sections:
     - **Header:** title, authors, published date, source badge
     - **Abstract:** full text, not truncated
     - **Structured Notes:** problem, method, contribution, key results, limitations, tags — all from the extraction
     - **Confidence:** progress bar showing extraction confidence %
     - **Evidence:** the `source_quote_or_evidence` field
     - **Links:** arXiv abstract, PDF, Google Scholar link
     - **Actions:** "Save to folder" (wire to local-folders feature later), "Copy citation"
   - Close with Escape key, click-outside, or X button

3. **Wire table row click**
   - `onClick` on each `<tr>` sets `selectedPaperId`
   - Add `cursor-pointer` and `hover:bg-*` to rows

4. **Loading state**
   - If extraction is still in progress (confidence = 0, fallback), show "Notes being generated..." skeleton

### Design Notes
- Use the existing `--panel` and `--panel-strong` colors
- 400px wide on desktop, full-screen on mobile
- Backdrop blur/overlay behind the panel
- Smooth slide transition (CSS transform or framer-motion if available)

## When You Know It's Done

- [ ] Clicking a paper row opens the detail panel
- [ ] All extraction fields are displayed clearly
- [ ] Confidence is shown as a visual indicator (bar or percentage)
- [ ] Panel closes with Escape key, click-outside, and X button
- [ ] Works on mobile (full-screen modal)
- [ ] Keyboard accessible (focus trap, Tab through fields)
- [ ] Shows fallback state when extraction is pending

## Expected Results

Click a paper → panel slides open → see problem, method, contribution, and confidence at a glance. Close it and click another paper to compare.

## Dependencies

- `feature/compact-paper-table` (needs clickable rows)

## Files to Touch

```
frontend/app/page.tsx                          (selectedPaperId state, row onClick)
frontend/app/components/PaperDetailPanel.tsx   (new)
frontend/app/globals.css                       (slide-over animation, backdrop)
```
