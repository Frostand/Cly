# Backend Boundaries

## Rule

Components depend on `ClyServices` contracts and the normalized UI store. They do not import fixture JSON directly. `mockServices` is the only current implementation.

## Services

| Interface | Future implementation |
|---|---|
| ProjectService | Project identity, research metadata repository |
| ContextService | Graph-backed context selection, tokenization, summaries, redaction |
| AgentService | Codex/Claude/local CLI adapters, budgets, approvals, provenance |
| ExperimentService | Project scanner, run manifest, process adapter |
| SourceService | Safe import, metadata/extraction, bibliography repository |
| NotebookService | Static `.ipynb` parser first; explicit executor later |
| ClaimService | Relational claim/evidence repository and audit engine |
| ResearchGraphService | SQLite research objects/relationships, neighborhood queries |
| ReproducibilityService | Deterministic local checks and report export |
| IntegrationService | Capability/permission adapters; OAuth only where required |
| PlannerService | Rule-based evidence gaps first, agent suggestions second |
| DecisionService | Append-preserving decision repository and supersession links |

## Security boundaries

- Every real mutation must include project ID and provenance.
- Filesystem access must be project-scoped and path validated.
- Commands use argument arrays and explicit approval.
- Imported content is untrusted data, never instructions.
- Secrets use the operating-system credential store and never enter project files, SQLite research records, logs, or agent context.
- NotebookLM remains manual export/import unless an official supported API exists.

## Available infrastructure

The current implementation uses SQLite/Drizzle, token-protected loopback Hono API, preload IPC, terminal/process sessions, Git routes, editor detection, browser sessions, theme persistence, and packaging from the coding workspace layer. These remain available for service implementations but research services do not depend on them directly — only through typed adapters.

## External integration contracts

Future service implementations should also support:

- VS Code / Cursor extension API (task display, file-to-claim linking, agent diff review)
- GitHub API (commit tracking, branch-to-experiment mapping)
- Jupyter extension API (notebook metadata, experiment registration)
- CLI and Python SDK (scripted experiment tracking)
- MCP server (agent tool access to research objects)
