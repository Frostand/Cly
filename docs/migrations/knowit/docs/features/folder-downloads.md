# Folder Downloads

**Branch:** `feature/folder-downloads`

## What

Export a folder's papers and extractions as a downloadable file — CSV, JSON, or BibTeX.

## Why

Users want to take their research out of the app for reference management (Zotero), writing (Overleaf), or sharing with collaborators.

## How to Implement

### Backend

1. **Export endpoint** — `GET /api/v1/folders/{id}/export?format=csv|json|bibtex`
   - Fetch folder papers and their extractions
   - Format based on query param
   - Return with appropriate `Content-Type` and `Content-Disposition: attachment`

2. **Export formats:**
   - **CSV:** title, authors (semicolon-joined), year, abstract, problem, method, contribution, key_results (pipe-joined), tags, paper_url, pdf_url
   - **JSON:** full structured export matching the data model, useful for programmatic use
   - **BibTeX:** `@article` entries with title, author, year, url, abstract in `note` field

3. **BibTeX helper** — simple string builder (no need for a library for basic fields):
   ```python
   def _to_bibtex(paper, extraction) -> str:
       year = paper.published_date.year if paper.published_date else "n.d."
       return f"""@article{{{paper.source_id},
     title = {{{paper.title}}},
     author = {{{' and '.join(paper.authors)}}},
     year = {{{year}}},
     url = {{{paper.paper_url}}},
     note = {{{paper.abstract[:200]}...}}
   }}
   """
   ```

### Frontend

4. **Download button** in the folder sidebar or folder view
   - Dropdown or button group: "Export as CSV | JSON | BibTeX"
   - Click triggers download via `window.open` or an anchor with `download` attribute
   - Show a brief toast "Exported 12 papers as CSV"

## When You Know It's Done

- [ ] CSV export produces a valid CSV with all fields
- [ ] JSON export produces valid JSON matching the data model
- [ ] BibTeX export produces valid `.bib` entries importable into Zotero, Mendeley, etc.
- [ ] Empty folder export returns an empty file with headers (not an error)
- [ ] Special characters in titles/authors are properly escaped per format
- [ ] Test: `test_folder_exports.py` for each format

## Expected Results

Click "Export as BibTeX" → browser downloads `rag-papers.bib` → drag into Zotero → all 12 papers appear with titles, authors, URLs, and abstracts in notes.

## Dependencies

- `feature/local-folders` (folders must exist)

## Files to Touch

```
backend/app/routes/folders.py           (add export endpoint)
backend/app/services/export/            (new directory)
backend/app/services/export/__init__.py (new)
backend/app/services/export/csv_exporter.py   (new)
backend/app/services/export/json_exporter.py  (new)
backend/app/services/export/bibtex_exporter.py (new)
backend/tests/test_folder_exports.py    (new)
frontend/app/components/FolderSidebar.tsx  (add export button)
```
