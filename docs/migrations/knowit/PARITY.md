# CLY-40 parity review

| KnowIT capability | Cly implementation | Status |
| --- | --- | --- |
| arXiv search | `electron/api/literature/arxiv.js` | Migrated |
| Semantic Scholar search | `electron/api/literature/semantic-scholar.js` | Migrated |
| Multi-source fallback/deduplication | `electron/api/literature/search.js` | Migrated |
| Keyword ranking | `rankLiterature` | Migrated |
| Reciprocal Rank Fusion | `rankLiteratureWithRrf` | Migrated |
| Semantic ranking boundary | `LiteratureSemanticRanker` | Migrated |
| Native literature UI | Cly Literature Workspace | Migrated |
| Saved-paper library | Project-scoped Cly Sources | Migrated |
| Literature matrix | Existing Cly matrix backed by Sources | Migrated |
| Evidence relationships | Project-scoped source-to-claim relationships | Migrated |
| Structured notes | Explicit deterministic enrichment with provenance | Migrated baseline |
| Theme synthesis | Review-only theme preview | Migrated baseline |
| Actual local cross-encoder model | Replaceable adapter boundary exists | Deferred; must not be claimed as implemented |
| Full-PDF parsing | Existing source import roadmap | Outside CLY-40 |
| Local folders/download bundles | Cly project/source organization | Outside CLY-40 |

The FastAPI and Next.js snapshots were removed after this review. Cly owns all migrated runtime behavior.
