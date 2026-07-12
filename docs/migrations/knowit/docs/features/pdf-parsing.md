# PDF Parsing

**Branch:** `feature/pdf-parsing`

## What

Download and parse PDFs from arXiv to extract full text, enabling the AI provider to analyze the actual paper content instead of just the abstract.

## Why

Abstract-only extraction misses methods, datasets, results tables, and limitations that only appear in the full text. PDF parsing makes structured notes significantly more accurate.

## How to Implement

### Backend

1. **PDF fetcher** — `app/services/paper_sources/pdf_fetcher.py`
   - Download PDF from `paper.pdf_url`
   - Stream to memory or temp file (don't persist PDFs locally by default)
   - Handle arXiv rate limits (3-second delay, retries)
   - Handle missing PDFs gracefully (fall back to abstract-only extraction)

2. **Text extractor** — `app/services/paper_sources/pdf_parser.py`
   - Use `pymupdf` (fitz) or `pdfplumber` for text extraction
   - `pymupdf` is faster but heavier; `pdfplumber` is pure Python
   - Extract: title page text, all body text, references section
   - Try to identify section boundaries (Introduction, Methods, Results, Conclusion)
   - Strip references for token efficiency (LLM doesn't need to re-read bibliography)

3. **Update extraction prompt**
   - When full text is available, pass structured sections:
     ```
     Title: ...
     Abstract: ...
     Introduction: [first 2000 chars]
     Methods: [first 2000 chars]
     Results: [first 2000 chars]
     Conclusion: [first 2000 chars]
     ```
   - Truncate sections to fit provider context window
   - Flag: `extraction has_full_text: true` in the model

4. **Update pipeline stage**
   - Add `PDF_DOWNLOADING` stage between `RANKING` and `EXTRACTING`
   - Papers without PDFs skip this stage and use abstract-only
   - Show per-paper status: "PDF downloaded", "No PDF available", "Parsing failed"

5. **New dependency:** add `pymupdf` or `pdfplumber` to `requirements.txt`

### Frontend

6. **Extraction badge**
   - Show "Full text" or "Abstract only" badge on each extraction
   - Full-text extractions get a green indicator

## When You Know It's Done

- [ ] arXiv PDFs are downloaded and text is extracted
- [ ] Section boundaries are identified (Introduction, Methods, etc.)
- [ ] Extraction prompt uses full text when available
- [ ] Papers without PDFs gracefully fall back to abstract-only
- [ ] Pipeline stage shows PDF download progress
- [ ] Full-text extraction produces more detailed notes than abstract-only
- [ ] PDFs are NOT persisted to disk by default (privacy)
- [ ] Test: `test_pdf_parser.py` with a known arXiv PDF
- [ ] Test: `test_pdf_fetcher_handles_missing_pdf.py`

## Expected Results

Paper "Retrieval Augmented Generation for Agents" now has structured notes with the specific method (e.g., "uses DPR + FiD"), datasets (e.g., "evaluated on KILT and Natural Questions"), and nuanced limitations extracted from the discussion section — details that weren't in the abstract.

## Dependencies

- None (standalone backend feature)

## Files to Touch

```
backend/app/services/paper_sources/pdf_fetcher.py   (new)
backend/app/services/paper_sources/pdf_parser.py    (new)
backend/app/services/extraction/paper_extractor.py  (use full text)
backend/app/pipeline/research_pipeline.py           (add PDF stage)
backend/app/models/runs.py                          (add RunStatus)
backend/requirements.txt                            (add pymupdf or pdfplumber)
backend/tests/test_pdf_parser.py                    (new)
backend/tests/test_pdf_fetcher.py                   (new)
frontend/app/page.tsx                               (full-text badge)
```
