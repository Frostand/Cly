# KnowIT → Cly migration archive

KnowIT's useful literature workflow has been rewritten into Cly's native Electron, React, and SQLite architecture on `codex/cly-40-knowit`.

This directory now retains product requirements and design references only. The copied FastAPI and Next.js runtimes were removed after parity review because Cly must not ship or maintain a second application runtime.

Implemented in Cly:

- project-scoped arXiv and Semantic Scholar discovery;
- normalized paper metadata, provider error mapping, fallback, and deduplication;
- keyword ranking, replaceable semantic-ranker contract, and Reciprocal Rank Fusion;
- native Literature Workspace results, status states, and save actions;
- Source, Literature Matrix, Claim, and Research Graph integration;
- retrieval, ranking, relationship, and enrichment provenance;
- explicit deterministic structured-note enrichment and non-mutating theme previews.

Retained references:

- `tickets.md` — CLY-40 requirements and acceptance criteria;
- `BUILD_PLAN.md` — original KnowIT product direction;
- `docs/` — feature and architecture research from KnowIT;
- `PARITY.md` — migration verification and intentionally deferred capabilities.
