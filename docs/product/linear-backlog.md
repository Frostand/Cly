# Linear-ready delivery backlog

Use the **Cly Research** Linear team (`CLY`). Cly is a standalone research platform: the research core and local service own the workflow, while embedded and external coding environments are clients.

## Initiative and project structure

| Initiative | Initial project | Objective and exit criteria | Dependencies |
| --- | --- | --- | --- |
| Standalone Research Platform | Cly Research Operating System | Research core, local service, and client contracts are independently defined and protected by tests. | None |
| Research Knowledge System | Research Graph MVP | Persist projects, objects, and relationships with confirmed vs. inferred links. | Platform boundary |
| Literature Intelligence | Literature Intelligence MVP | Explainable retrieval, saved sources, and literature matrix work with fixture and live adapters. | Research graph |
| Experiments & Provenance | Experiment Tracking MVP | Runs, artifacts, environments, and code/notebook lineage are captured. | Graph, local service |
| Research Workflow Integrations | Companion-mode MVP | VS Code-compatible, Jupyter, CLI, and GitHub adapters expose Cly context without replacing users' tools. | Local service, graph |
| Claims, Audits & Agents | Claim and Reproducibility MVP | Claims, evidence, audits, approvals, and agent controls are reviewable. | Graph, provenance |

## Critical path

Standalone core and local service → research object graph → sources and literature → experiment/provenance capture → claims and reproducibility → companion integrations. Cly does not include an embedded code workspace.

## First project: Standalone research platform boundary

| Issue | Scope | Testable acceptance criteria |
| --- | --- | --- |
| Define standalone core and client contracts | Separate research domain and local-service interfaces from desktop/editor implementation. | A client contract supports desktop, extension, notebook, and CLI callers without importing editor-specific state. |
| Establish local service and repository observer | Define project identity, filesystem/Git observation, permission boundaries, and provenance event capture. | A repository change is associated with a project and records a reviewable provenance event. |
| Remove inherited IDE infrastructure | Remove the former editor runtime, packaging, and IDE tooling while preserving Cly documentation and research-core contracts. | No Dream IDE runtime, Electron packaging, or editor UI remains on the default branch. |
| Define companion-mode integration contract | Specify deep links, code/selection attachment, task context, diff review, and approval behavior. | An external client can attach code or a commit to a Cly research object through the local service. |

Every issue must state the problem, user value, bounded scope and non-goals, acceptance criteria, dependencies, privacy/security risks, testing, documentation, and observability. Split implementation work above 5 points.
