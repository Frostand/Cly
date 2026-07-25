# Feature Matrix

Legend: production = persisted through a project-scoped service. Unsupported
actions are not rendered as production controls. Automated fixtures are test
infrastructure and are never included in production bundles. The machine-checked
[`cly-v1-capabilities.json`](cly-v1-capabilities.json) inventory is authoritative
for individual mutations.

| Feature | Screen | Empty | Populated | Error/offline/partial | Interactions | Tests | Backend |
|---|---:|---:|---:|---:|---:|---:|---|
| Research Overview | yes | yes | yes | yes | yes | yes | production local reads + project brief |
| Context Composer | yes | yes | yes | stale/large | yes | unit/component/E2E | production |
| Agent sessions | yes | yes | yes | waiting/failed/cancelled | start, stream, approve, stop, resume, restart | unit/component/E2E | durable authenticated Codex/Claude execution |
| Models & Agents | yes | yes | yes | signed-out/offline/last-good | detected model and reasoning selection | component/E2E | production provider discovery + configuration |
| Local CLI providers | Integrations | checking/not installed | connected | signed out/detection error | refresh, secure sign-in launch, copy setup, docs | component | production provider discovery + desktop IPC |
| Experiment Manager | yes | yes | yes | failed/partial | yes | unit/component/E2E | definitions plus local numeric CSV/TSV prediction production; remote execution unavailable |
| Research Graph | yes | yes | yes | uncertain/stale/broken | yes | unit/E2E | relationships production |
| Source Manager | yes | yes | yes | metadata/permission/duplicate | folder, URL, BibTeX, archive, restore, enrich, deduplicate | component/E2E | production local ingestion and provenance |
| Literature Matrix | yes | yes | yes | uncertain extraction | yes | component/visual | search import production |
| Claim Audit | yes | yes | yes | unsupported/invalidated | yes | unit/component/E2E | core create/review/link production |
| Figure/table provenance | yes | yes | yes | manual/stale/broken | yes | component/visual | read-only evidence view |
| Reproducibility Auditor | yes | yes | yes | blocking/partial | yes | component/E2E | durable local audit and finding dispositions |
| Detected editors | Integrations | yes | yes | detection/open error | refresh/open active project | component | production desktop IPC |
| Next-Step Planner | yes | yes | yes | dismissed/deferred | yes | unit/component/E2E | durable local planner state |
| Decision Log | yes | yes | yes | superseded/unresolved | create/update/supersede/export | unit/component/E2E | durable local decision history |
| Menus/command palette | yes | n/a | yes | explained disabled actions | yes | component/E2E | Electron bridge complete |
| Fixture states | yes | yes | yes | loading/offline/errors/risks | yes | unit/E2E | development only |

## Intentionally deferred

Hosted-provider execution, Cly-owned OAuth or secret persistence, NotebookLM
automation, GitHub/Hugging Face sync, notebook execution, code scanning,
categorical/survival/causal analysis, cloud research storage, billing, and
hosted team collaboration are not included in the free beta and are not shown
as production controls. Local analysis is limited to numeric predictors and
binary or numeric outcomes; it is exploratory and is not clinical advice.
