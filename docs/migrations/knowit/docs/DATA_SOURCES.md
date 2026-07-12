# Data Sources

## Strategy

Elicit has access to a very large paper corpus. We should not try to beat that by manually building a bigger private corpus first.

Instead, use open scholarly infrastructure and combine sources over time.

## Source Order

Build connectors in this order:

1. arXiv
2. OpenAlex
3. Semantic Scholar
4. Crossref
5. PubMed
6. Local PDF/library import

## arXiv

Best for:

- ML preprints
- AI research
- fast-moving technical topics
- free paper PDFs

Use first because the project starts ML-focused.

Limitations:

- Not all fields are covered.
- Metadata can be limited.
- Search is not enough for broad literature coverage.

## OpenAlex

Best for:

- broad scholarly metadata
- finding works beyond arXiv
- institutions, authors, venues, concepts
- open large-scale scholarly data

Use after arXiv to expand coverage.

## Semantic Scholar

Best for:

- paper discovery
- citation-like graph metadata
- relevance and recommendations
- abstracts and paper metadata

Useful for improving search and related-paper discovery.

## Crossref

Best for:

- DOI metadata
- publisher metadata
- resolving paper identifiers

Use as a metadata enrichment source.

## PubMed

Best for:

- biomedical and clinical papers

Do not prioritize for the first ML-focused MVP unless the project changes domains.

## Local PDFs

Best for:

- user-owned paper libraries
- offline/private workflows
- papers not easily available through APIs

Add later, after the core workflow works.

## Deduplication

Papers from multiple sources should be merged when possible.

Signals:

```text
arXiv ID
DOI
Semantic Scholar paper ID
OpenAlex work ID
normalized title
author overlap
published year
```

Do not overcomplicate this at first. Start with exact arXiv ID and DOI matching.
