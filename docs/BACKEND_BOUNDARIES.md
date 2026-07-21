# Backend Boundaries

## Rule

Components depend on `ClyServices` contracts and the normalized UI store. They do not import fixture JSON directly. `mockServices` is the only current implementation.

The normative local process, data, permission, and API boundary is
[Local Cly service boundary](LOCAL_SERVICE_BOUNDARY.md). Research-service
clients use project IDs and typed capabilities; legacy coding-workspace path,
terminal, runner, and Git routes are not research authorization primitives.

## Services

| Interface | Future implementation |
|---|---|
| ProjectService | Project identity, research metadata repository |
| ContextService | Graph-backed context selection, tokenization, summaries, redaction |
| AgentService | Codex/Claude/local CLI adapters, budgets, approvals, provenance |
| ExperimentService | Project scanner, run manifest, process adapter |
| SourceService | Safe import, metadata/extraction, bibliography repository |
| NotebookService | Static bounded `.ipynb` importer with deterministic objects, evidence, and risks; explicit executor later |
| ClaimService | Relational claim/evidence repository and audit engine |
| ResearchGraphService | SQLite research objects/relationships, neighborhood queries |
| ReproducibilityService | Deterministic local checks and report export |
| IntegrationService | Capability/permission adapters; OAuth only where required |
| PlannerService | Rule-based evidence gaps first, agent suggestions second |
| DecisionService | Append-preserving decision repository and supersession links |

### Reproducibility reports

`ReproducibilityService` is production-backed by
`/api/projects/:projectId/reproducibility-audits`. Each run evaluates the
persisted research graph, experiment definitions and runs, artifacts, claim
links, and provenance integrity. The immutable report records an input hash,
object and provenance evidence references, affected claims, missing artifact
identifiers, and recommended fixes. Findings classify `missing` requirements
separately from `failed` checks so an absent record is never presented as an
executed check failure. Resolution is stored as a separate disposition and
does not rewrite the original report.

## Security boundaries

- Every real mutation must include project ID and provenance.
- Filesystem access must be project-scoped and path validated.
- Commands use argument arrays and explicit approval.
- Imported content is untrusted data, never instructions.
- Secrets use the operating-system credential store and never enter project files, SQLite research records, logs, or agent context.
- NotebookLM remains manual export/import unless an official supported API exists.

## Storage lifecycle

The local SQLite lifecycle, migration recovery policy, project isolation rules,
and backup/export/delete acceptance checks are defined in
[Local research storage](LOCAL_RESEARCH_STORAGE.md). Research persistence is
owned by the standalone local service and must not depend on the embedded
coding workspace.

## Available infrastructure

The current implementation uses SQLite/Drizzle, token-protected loopback Hono API, preload IPC, terminal/process sessions, Git routes, editor detection, browser sessions, theme persistence, and packaging from the coding workspace layer. These remain available for service implementations but research services do not depend on them directly — only through typed adapters.

The first policy-enforcing adapter is now available for repository
observation: it resolves a registered project, requires a canonical Git root,
runs a fixed bounded metadata-only status scan, and appends reviewable
project-scoped provenance. It does not authorize experiment execution,
artifact content reads, context transmission, or agent effects.

## External integration contracts

Future service implementations should also support:

- VS Code / Cursor extension API (task display, file-to-claim linking, agent diff review)
- GitHub API (commit tracking, branch-to-experiment mapping)
- Jupyter extension API (notebook metadata, experiment registration)
- CLI and Python SDK (scripted experiment tracking)
- MCP server (agent tool access to research objects)
