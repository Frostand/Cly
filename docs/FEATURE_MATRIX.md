# Feature Matrix

Legend: production = persisted through a project-scoped service; preview =
read-only or deterministic demonstration state; unavailable = visibly disabled
with an explanation. The machine-checked
[`cly-v1-capabilities.json`](cly-v1-capabilities.json) inventory is authoritative
for individual mutations.

| Feature | Screen | Empty | Populated | Error/offline/partial | Interactions | Tests | Backend |
|---|---:|---:|---:|---:|---:|---:|---|
| Research Overview | yes | yes | yes | yes | yes | yes | production local reads + project brief |
| Context Composer | yes | yes | yes | stale/large | yes | unit/component/E2E | production |
| NotebookLM companion | Literature tab | yes | yes | manual/unavailable | yes | E2E bundle flow | export unavailable |
| Agent sessions | yes | yes | yes | waiting/failed | yes | navigation/E2E | durable sessions production; execution unavailable |
| Models & Agents | yes | yes | yes | preview-only | topology editor | component/E2E | configuration production; execution unavailable |
| Subscription/API modes | Integrations | n/a | yes | unavailable/planned | yes | component | unavailable |
| Experiment Manager | yes | yes | yes | failed/partial | yes | component/E2E | definitions production; remote execution unavailable |
| Research Graph | yes | yes | yes | uncertain/stale/broken | yes | unit/E2E | relationships production |
| Source Manager | yes | yes | yes | metadata/permission | yes | component/E2E | metadata production; folder/archive/deduplicate unavailable |
| Literature Matrix | yes | yes | yes | uncertain extraction | yes | component/visual | search import production |
| Notebook Scanner | yes | yes | yes | stale/at risk | yes | component/E2E | preview |
| Code Linker | yes | yes | yes | unlinked/risk | yes | component | preview |
| Claim Audit | yes | yes | yes | unsupported/invalidated | yes | unit/component/E2E | core create/review/link production |
| Figure/table provenance | yes | yes | yes | manual/stale/broken | yes | component/visual | read-only evidence view |
| Reproducibility Auditor | yes | yes | yes | blocking/partial | yes | component/E2E | preview |
| External integrations | yes | n/a | yes | permission/sync/planned | yes | component | unavailable |
| Next-Step Planner | yes | yes | yes | dismissed/deferred | yes | unit/component/E2E | preview |
| Decision Log | yes | yes | yes | superseded/unresolved | yes | unit/component/E2E | preview |
| Menus/command palette | yes | n/a | yes | explained disabled actions | yes | component/E2E | Electron bridge complete |
| Fixture states | yes | yes | yes | loading/offline/errors/risks | yes | unit/E2E | development only |

## Intentionally deferred

Real model execution from Cly Research, CLI orchestration, OAuth, secret
persistence, NotebookLM automation, GitHub/Hugging Face sync,
notebook/experiment execution, cloud research storage, billing, and hosted team
collaboration are not included in the free beta.
