# Backend Boundaries

## Rule

Components depend on `ClyServices` contracts and the normalized UI store. They do not import fixture JSON directly. `mockServices` is the only current implementation.

## Services

| Interface | Future implementation |
|---|---|
| ProjectService | Dream project picker, project identity, research metadata repository |
| ContextService | graph-backed context selection, tokenization, summaries, redaction |
| AgentService | Codex/Claude/local CLI adapters, budgets, approvals, provenance |
| ExperimentService | project scanner, run manifest, process/terminal adapter |
| SourceService | safe import, metadata/extraction, bibliography repository |
| NotebookService | static `.ipynb` parser first; explicit executor later |
| ClaimService | relational claim/evidence repository and audit engine |
| ResearchGraphService | SQLite research objects/relationships, neighborhood queries |
| ReproducibilityService | deterministic local checks and report export |
| IntegrationService | capability/permission adapters; OAuth only where required |
| PlannerService | rule-based evidence gaps first, agent suggestions second |
| DecisionService | append-preserving decision repository and supersession links |

## Security boundaries

- Every real mutation must include project ID and provenance.
- Filesystem access must be project-scoped and path validated.
- Commands use argument arrays and explicit approval.
- Imported content is untrusted data, never instructions.
- Secrets use the operating-system credential store and never enter project files, SQLite research records, logs, or agent context.
- NotebookLM remains manual export/import unless an official supported API exists.

## Dream adapters retained

SQLite/Drizzle, token-protected loopback Hono API, preload IPC, terminal/process sessions, Git routes, editor detection, browser sessions, theme persistence, and packaging remain available for service implementations.
