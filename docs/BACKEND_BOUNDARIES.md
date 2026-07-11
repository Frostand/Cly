# Backend boundaries

## Core services

| Service | Responsibility |
| --- | --- |
| Project | Project identity, membership, and local policy |
| Research graph | Objects, evidence relationships, provenance, and neighborhood queries |
| Source | Safe import, metadata, extraction, and bibliography records |
| Experiment | Run manifests, environments, metrics, and artifacts |
| Claim | Evidence evaluation, audit findings, and report impact |
| Context | Selected-context previews, redaction, token budgeting, and rationale |
| Agent | Provider-neutral task routing, budgets, approvals, and provenance |
| Integration | Opt-in adapters for repositories, editors, notebooks, GitHub, CLI, SDK, and MCP |
| Planner | Evidence gaps and reviewable next-step suggestions |

## Security rules

- Every mutation includes a project ID and creates provenance.
- Filesystem and repository access are project-scoped and path-validated.
- Commands use approved adapters and explicit human approval.
- Imported sources and tool output are untrusted content.
- Secrets stay in the operating-system credential store and never enter research records, logs, or agent context.

## Explicit exclusions

The service does not implement an IDE, terminal, Git client, browser shell, or notebook client. Those remain external companions.
