# Linear-ready delivery backlog

Create one Linear team, **Research IDE**, and use its actual key in place of `RID`. Use the workflow states and label taxonomy in `docs/development/git-linear-workflow.md`; create labels for work type, product area, risk, and stage from the project brief.

## Initiatives and milestone projects

| Initiative | Initial project | Objective and exit criteria | Key dependencies |
| --- | --- | --- | --- |
| Dream IDE Foundation | Dream IDE Technical Assessment | Architecture, extension boundaries, upstream strategy, quality gates, and threat-model baseline are reviewed. | None |
| Research Knowledge System | Research-Aware IDE Foundation | Persisted project/object/relationship MVP with confirmed vs inferred links. | Foundation |
| Literature Intelligence | Semantic Literature Search MVP | Explainable retrieval, saved sources, and matrix work against fixture and one live adapter. | Research model, providers |
| Literature Intelligence | Source Manager and Literature Matrix | Researchers can verify source-linked matrix cells and export a filtered view. | Search MVP |
| Notebook and Code Intelligence | Notebook Scanner MVP | Notebook/cell extraction, risk findings, and reviewable links work locally. | Research model |
| Research Knowledge System | Research Object Graph MVP | Graph navigation, confirmation, versioning, and provenance events work across MVP objects. | Foundation |
| Experiment and Provenance | Experiment Tracking and Provenance MVP | Runs, artifacts, figure/table lineage, and staleness are captured. | Graph, notebook/linker |
| Git Research Workflow | Git Workflow Orchestrator MVP | Linear-linked branch/PR flow and research impact template work with approval gates. | Foundation, Git adapters |
| Claims and Reproducibility | Claim Audit Board MVP | Claim evidence/contradictions/staleness and audit findings are reviewable. | Graph, provenance |
| Claims and Reproducibility | Reproducibility Auditor MVP | Code/data/environment/run/output checks return actionable findings. | Experiments/provenance |
| Agent Platform | Multi-Agent Orchestration MVP | Provider-neutral roles, context inspection, permissions, budgets, and approvals work. | Provider abstraction, graph |
| Product Quality and Infrastructure | Private Beta Readiness | Reliability, security, accessibility, docs, support, and release criteria are met. | All MVP projects |

## Critical path

Foundation → research object contracts and graph persistence → source/notebook ingestion → experiment/provenance → claims and reproducibility → end-to-end MVP validation. Provider abstraction and Git workflow can begin after Foundation but must integrate with the graph before private beta.

## First project: Dream IDE Technical Assessment

Project objective: turn the current audit into enforced engineering controls and a reviewed extension contract. Non-goals: research product features, schema changes, hosted backend, or monorepo migration. Target completion: all exit criteria below validated on `main`.

| ID | Issue | Points | Labels | Dependencies | Testable acceptance criteria |
| --- | --- | ---: | --- | --- | --- |
| RID-001 | Confirm fork ownership, upstream policy, and release identity | 2 | documentation, dream-core, low-risk | none | Upstream remote/ownership, licensing checklist, product/release naming, and sync cadence are reviewed and recorded. |
| RID-002 | Establish automated quality baseline | 3 | infrastructure, testing, high-risk | RID-001 | PR CI runs frozen install, lint, typecheck, and build; repository settings checklist identifies required hosted protections. |
| RID-003 | Add test harness and deterministic fixture conventions | 3 | testing, infrastructure, medium-risk | RID-002 | `pnpm test` runs a sample unit test in CI; fixture locations and mock rules are documented. |
| RID-004 | Define research extension contract | 3 | documentation, dream-core, research-graph | RID-001 | API/DB/UI boundaries, typed registration seams, and prohibited core modifications are reviewed in ADR/docs. |
| RID-005 | Define research data and provenance ADRs | 5 | research, database, provenance, high-risk | RID-004 | ADR-003 through ADR-006 decide identifiers, relational graph approach, vector boundary, and artifact storage with migration/recovery implications. |
| RID-006 | Define executor and provider security contract | 5 | security, providers, agents, high-risk | RID-004 | Approval policy, tool scopes, transmission disclosure, audit events, and threat-model mitigations are accepted. |
| RID-007 | Establish GitHub branch protection and ownership controls | 2 | infrastructure, security, git-workflow | RID-002 | Hosted main-branch rules, CODEOWNERS identities, secret scanning, Dependabot, and release permissions are configured and evidence linked. |
| RID-008 | Run architecture review and Foundation exit gate | 2 | documentation, validation | RID-003, RID-005, RID-006, RID-007 | Decisions, CI evidence, risks, and the Phase 1 plan are approved; follow-ups are linked. |

## Issue template requirements

Every issue must include problem, user value, scope, non-goals, proposed behavior, technical notes, testable acceptance criteria, dependencies, risks, testing, documentation, observability, and design references. Do not start an implementation issue above 5 points without splitting it; 8-point work requires a decomposition review.

## First three pull requests

1. `docs/RID-001-project-foundation` — repository map, ADR-001, vision, threat model, and upstream strategy; no runtime changes.
2. `chore/RID-002-quality-baseline` — quality/CodeQL workflows, PR/issue templates, CODEOWNERS, and GitHub settings checklist; no product behavior changes.
3. `test/RID-003-test-harness` — select and configure the test runner, one API/domain fixture test, CI test job, and contributor test instructions.

PR 3 is intentionally deferred until the plan is reviewed because the repository has no existing test framework and its choice affects dependencies and CI duration.
