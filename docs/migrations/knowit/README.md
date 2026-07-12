# KnowIT literature migration source

This directory is a temporary, isolated source snapshot from `/Users/al1234/Documents/KnowIT!` for CLY-40.

It is kept under the Cly literature feature so the migration can happen incrementally:

- `backend/` contains the original FastAPI models, paper sources, ranking, extraction, and pipeline code.
- `frontend/` contains the original Next.js literature UI.
- `docs/` contains the original product and feature specifications.

The snapshot intentionally excludes Git metadata, virtual environments, dependency folders, generated Next.js/Python caches, and local database data. The Python and Next.js code is reference material during the migration; runtime ownership remains with Cly's Electron/React research architecture.

Migration order:

1. Port paper/source contracts into `src/features/research/domain/`.
2. Port ranking and provider boundaries into Cly services with deterministic fixtures.
3. Port the useful literature UI into `src/features/cly/`.
4. Remove this snapshot once the migrated implementation has parity and tests.

## CLY-40 migration status

Implemented on `codex/cly-40-knowit`:

- Native Electron Semantic Scholar search route scoped to the active Cly project.
- Normalized provider-paper contracts and deterministic local ranking explanations.
- Stable provider/DOI/URL duplicate detection.
- Project-scoped Source persistence with literature metadata and ranking provenance.
- Native Literature Workspace search, status, ranked-result, save, and matrix flow.
- Deterministic provider, route, domain, store, and repository tests.

Remaining follow-up slices from `tickets.md`:

- arXiv adapter and cross-provider deduplication;
- an actual configurable local cross-encoder implementation;
- optional structured extraction and reviewable synthesis;
- removal of this migration snapshot after parity review.
