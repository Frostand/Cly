# Testing strategy

Add a test runner before implementation work that changes research behavior. Use deterministic fixtures and mocks; paid APIs must not be required for normal CI.

- Unit: graph rules, provenance/staleness, claim audit logic, provider routing, notebook parsing, retrieval ranking.
- Integration: SQLite migrations/repositories, authenticated Hono routes, parser adapters, Git metadata capture, artifact storage.
- End-to-end: the MVP research chain in `docs/product/mvp-acceptance.md`.
- Fixtures: valid/malformed PDFs, out-of-order notebooks, repositories, experiment runs, provider failures, claim graphs, and Git conflicts.

The current repository has lint, typecheck, and build commands but no test command. PR 1 establishes the test harness and makes unit/integration checks required before research logic begins.
