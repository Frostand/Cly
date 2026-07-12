# Full PDF Reading

**Branch:** `feature/full-pdf-reading`

## What

Parse the full text of PDFs and feed structured sections (Introduction, Methods, Results, Conclusion) into the AI provider for much deeper paper extraction than abstract-only or raw full-text.

## Why

`feature/pdf-parsing` gets raw text from PDFs. This feature goes further: it identifies sections, extracts figures/tables metadata, and constructs a provider prompt that uses structured sections. The result is far more accurate structured notes.

## How to Implement

### Backend

1. **Section classifier** — `app/services/paper_sources/section_classifier.py`
   - Use regex heuristics to identify: Abstract, Introduction, Related Work, Methods/Approach, Experiments/Results, Discussion, Conclusion, References
   - Handle common arXiv formatting patterns
   - Fallback: equal-sized chunks if sections can't be identified

2. **Smart truncation for provider prompt**
   - Abstract: always include (short)
   - Introduction: first 1500 chars (usually states the problem)
   - Methods: first 2000 chars (the approach)
   - Results: first 1500 chars (key findings)
   - Conclusion: first 1000 chars (summary and limitations)
   - **Never include References section** (wastes tokens)
   - Total prompt stays within provider's context window

3. **Figure/table extraction**
   - Capture figure captions and table headers from PDF
   - Include in extraction prompt: "The paper contains 5 figures and 3 tables"
   - Extract table data as structured text when possible

4. **Provider prompt template**:
   ```
   Title: {title}
   Authors: {authors}
   
   Abstract:
   {abstract}
   
   Introduction:
   {intro_chunk}
   
   Methods:
   {methods_chunk}
   
   Results:
   {results_chunk}
   
   Conclusion:
   {conclusion_chunk}
   
   Extract structured research notes from the above paper sections.
   Include specific methods, datasets, metrics, and limitations mentioned.
   ```

5. **Confidence differentiation**
   - Full-text extractions get `has_full_text: true` and base confidence starts at 0.7 (not 1.0)
   - Abstract-only extractions get `has_full_text: false` and base confidence 0.3
   - The mock provider's confidence=1.0 should be changed to reflect this

### Frontend

6. **Extraction quality badge**
   - "Full text · Sections" (green) — PDF parsed with sections
   - "Full text · Raw" (yellow) — PDF parsed but sections not identified
   - "Abstract only" (gray) — no PDF available

## When You Know It's Done

- [ ] Sections are correctly identified in arXiv PDFs
- [ ] Provider prompt uses structured sections
- [ ] Full-text extractions are clearly more detailed than abstract-only
- [ ] Confidence reflects extraction quality tier
- [ ] Prompt stays within provider context window
- [ ] References section is always excluded
- [ ] Tests: `test_section_classifier.py` with real arXiv PDFs

## Expected Results

Same paper, before and after:
- **Abstract only:** "Method: Uses retrieval augmentation... Dataset: Not specified... Limitations: Not specified..."
- **Full text with sections:** "Method: Dense Passage Retrieval (DPR) with Fusion-in-Decoder (FiD)... Dataset: Natural Questions, TriviaQA, KILT... Limitations: FiD decoder struggles with contradictory retrieved passages..."

## Dependencies

- `feature/pdf-parsing` (raw PDF text extraction)

## Files to Touch

```
backend/app/services/paper_sources/section_classifier.py   (new)
backend/app/services/extraction/paper_extractor.py         (section-based prompt)
backend/app/models/extractions.py                          (has_full_text field)
backend/tests/test_section_classifier.py                   (new)
frontend/app/page.tsx                                      (quality badge)
```
