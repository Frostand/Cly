# Target repository organization

The current single-package Electron application should remain intact through the MVP. A monorepo migration is not justified until a shared web/API deployment, independently versioned packages, or a second application actually exists.

```text
electron/
  api/research/             # authenticated route registration and request schemas
  db/research/              # Drizzle tables, repositories, migrations
  research/                 # domain services: graph, provenance, audits, execution
src/
  features/research/        # panel UI, queries, view models, feature-local state
  components/ide/           # only thin navigation/panel registration edits
docs/
  research-model/           # stable object, relation, provenance specifications
  architecture/decisions/   # ADRs
tests/
  unit/ integration/ e2e/ fixtures/
```

If a monorepo becomes necessary, first complete ADR-002 and a migration project: introduce workspace packages without moving runtime code, move one leaf feature at a time, retain path aliases/CI compatibility, and verify packaged Electron builds before deleting old paths.
