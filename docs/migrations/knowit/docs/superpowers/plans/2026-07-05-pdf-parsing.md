# PDF Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download arXiv PDFs in memory, parse useful paper sections, and feed structured full text into extraction while preserving abstract-only fallback behavior.

**Architecture:** Add isolated paper-source services for fetching PDF bytes and parsing text. The pipeline runs a PDF stage after ranking, stores only extraction metadata, and passes parsed sections through the existing AI provider interface.

**Tech Stack:** FastAPI backend, Pydantic models, SQLite repositories, pytest/unittest, Next.js frontend, PyMuPDF.

## Global Constraints

- PDFs are not persisted to disk by default.
- Provider calls continue through the existing provider interface.
- Missing, failed, or unparsable PDFs fall back to abstract-only extraction.
- Cloud provider UI copy must make full-text data transfer obvious.
- Tests must use mock providers and mocked PDF/network behavior.

---

### Task 1: Backend PDF Fetching And Parsing

**Files:**
- Create: `backend/app/services/paper_sources/pdf_fetcher.py`
- Create: `backend/app/services/paper_sources/pdf_parser.py`
- Modify: `backend/requirements.txt`
- Test: `backend/tests/test_pdf_fetcher.py`
- Test: `backend/tests/test_pdf_parser.py`

**Interfaces:**
- Produces: `fetch_pdf_for_paper(paper: Paper) -> PdfFetchResult`
- Produces: `parse_pdf_text(pdf_bytes: bytes) -> ParsedPaperText`

- [x] Add in-memory PDF fetching with arXiv delay/retry controls.
- [x] Add PyMuPDF parsing with section detection and reference stripping.
- [x] Add mocked unit tests for missing PDFs, PDF bytes, sections, and references.

### Task 2: Extraction And Pipeline Integration

**Files:**
- Modify: `backend/app/models/extractions.py`
- Modify: `backend/app/models/runs.py`
- Modify: `backend/app/services/extraction/paper_extractor.py`
- Modify: `backend/app/pipeline/research_pipeline.py`
- Modify: `backend/app/storage/database.py`
- Modify: `backend/app/storage/repositories.py`
- Test: `backend/tests/test_extraction.py`
- Test: `backend/tests/test_pipeline.py`
- Test: `backend/tests/test_storage.py`

**Interfaces:**
- Consumes: `ParsedPaperText`
- Produces: `PaperExtraction.has_full_text: bool`
- Produces: `PaperExtraction.full_text_status: str`

- [x] Add `PDF_DOWNLOADING` run status.
- [x] Feed parsed sections into extraction prompts when available.
- [x] Persist `has_full_text` and `full_text_status` only, not raw PDF text.
- [x] Keep abstract-only fallback for missing/download-failed/parse-failed PDFs.

### Task 3: Frontend Status And Badges

**Files:**
- Modify: `frontend/app/types.ts`
- Modify: `frontend/app/page.tsx`

**Interfaces:**
- Consumes: extraction `has_full_text` and `full_text_status`.

- [x] Add PDF parsing to the progress tracker.
- [x] Show a green Full text badge or muted Abstract only badge on each extraction.
- [x] Update cloud provider disclosure to include parsed paper text.
