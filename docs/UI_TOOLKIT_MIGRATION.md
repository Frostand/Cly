# UI toolkit migration

| Route | Previous layout | Toolkit integration | Status | Verification |
|---|---|---|---|---|
| Overview | continuous summary | Radix shared controls, Motion feedback | complete shared layer | Electron route |
| Agent Sessions | manual grid split, fake terminal, static topology | persisted `ClySplitPane`, xterm, Radix modes, React Flow topology | migrated | component + Electron |
| Context | fixed grid | persisted `ClySplitPane`, Radix modes | migrated | Electron workflow |
| Research Graph | hand-positioned DOM/SVG | React Flow custom nodes/controls | migrated | Electron graph selection |
| Experiments/Runs | fixed HTML tables | `ClyDataTable` | migrated | sorting + route E2E |
| Sources | fixed HTML table | `ClyDataTable` | migrated | selection + route E2E |
| Literature | fixed matrix | shared Radix controls; TanStack migration pending | partial | visual fixture |
| Notebooks/Code | fixed master/detail | shared Radix controls; split migration pending | partial | route E2E |
| Claims | compact board/table patterns | shared Radix controls; TanStack table pending | partial | route E2E |
| Provenance | list/lineage | shared Radix controls; Flow lineage pending | partial | route E2E |
| Reproducibility | audit report | shared progress/dialog controls | partial | scroll regression |
| Decisions | timeline | shared Radix controls; long-history virtual path pending | partial | route E2E |
| Next Steps | manual bounded list | `ClyVirtualList` for large fixtures | migrated | 500-row fixture |
| Integrations/Models | grouped rows/tables | shared Radix controls; table migration pending | partial | route E2E |
| Settings | preference rows | Radix dialog/toggle shared layer | complete shared layer | route E2E |

Remaining work is explicitly limited to extending the new shared table/split/graph wrappers across the routes marked partial; no competing implementation should be added.
