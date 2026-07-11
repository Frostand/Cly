# Feature Matrix

Legend: yes = implemented in the UI prototype; fixture = simulated through shared state/services; Phase 2 = real backend intentionally deferred.

| Feature | Screen | Empty | Populated | Error/offline/partial | Interactions | Tests | Backend |
|---|---:|---:|---:|---:|---:|---:|---|
| Research Overview | yes | yes | yes | yes | yes | yes | Phase 2 |
| Context Composer | yes | yes | yes | stale/large | yes | unit/component/E2E | Phase 2 |
| NotebookLM companion | Literature tab | yes | yes | manual/unavailable | yes | E2E bundle flow | Phase 2 |
| Agent sessions | yes | yes | yes | waiting/failed | yes | navigation/E2E | Phase 2 |
| Models & Agents | yes | yes | yes | preview-only | topology editor | component/E2E | Phase 2 |
| Subscription/API modes | Integrations | n/a | yes | unavailable/planned | yes | component | Phase 2 |
| Experiment Manager | yes | yes | yes | failed/partial | yes | component/E2E | Phase 2 |
| Research Graph | yes | yes | yes | uncertain/stale/broken | yes | unit/E2E | Phase 2 |
| Source Manager | yes | yes | yes | metadata/permission | yes | component/E2E | Phase 2 |
| Literature Matrix | yes | yes | yes | uncertain extraction | yes | component/visual | Phase 2 |
| Notebook Scanner | yes | yes | yes | stale/at risk | yes | component/E2E | Phase 2 |
| Code Linker | yes | yes | yes | unlinked/risk | yes | component | Phase 2 |
| Claim Audit | yes | yes | yes | unsupported/invalidated | yes | unit/component/E2E | Phase 2 |
| Figure/table provenance | yes | yes | yes | manual/stale/broken | yes | component/visual | Phase 2 |
| Reproducibility Auditor | yes | yes | yes | blocking/partial | yes | component/E2E | Phase 2 |
| External integrations | yes | n/a | yes | permission/sync/planned | yes | component | Phase 2 |
| Next-Step Planner | yes | yes | yes | dismissed/deferred | yes | unit/component/E2E | Phase 2 |
| Decision Log | yes | yes | yes | superseded/unresolved | yes | unit/component/E2E | Phase 2 |
| Menus/command palette | yes | n/a | yes | explained disabled actions | yes | component/E2E | Electron bridge complete |
| Fixture states | yes | yes | yes | loading/offline/errors/risks | yes | unit/E2E | development only |

## Intentionally deferred

Real model calls, CLI orchestration, OAuth, secret persistence, NotebookLM automation, GitHub/Hugging Face sync, notebook/experiment execution, cloud backend, billing, and team collaboration are not implemented.
