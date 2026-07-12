# Cly route layout patterns

| Route | V2 dominant pattern | Supporting pattern |
| --- | --- | --- |
| Overview | Project brief and integrity scan | Metric strip, activity timeline, graph preview |
| Agent Sessions | Session list and Orchestrator transcript | Resizable workbench tabs |
| Context | Dense context selector with sticky budget pane | Ordered packs and selection actions |
| Research Graph | Edge-to-edge graph canvas | Floating tools and trace rail |
| Experiments | Comparison-first data tables | Run timeline and selected detail |
| Sources | Search/filter table | Contextual source inspector |
| Literature | Evidence comparison matrix | Theme/chronology variants and bundle workflow |
| Notebooks | Notebook outline and audit detail | Findings, cells, and linked research |
| Code Linker | File outline and research-purpose detail | Relationship and risk lists |
| Claims | Compact audit board or table | Evidence detail and contextual inspector |
| Provenance | Lineage flow by default | Gallery/table alternatives and broken-chain emphasis |
| Reproducibility | Audit report | Score summary, grouped checklist, finding rows |
| Decisions | Chronological timeline | Evidence, alternatives, outcome, and supersession |
| Next Steps | Ranked recommendation rows | Roadmap grouping and direct actions |
| Integrations | Compact provider catalog | Setup/manage detail and capability metadata |
| Models & Agents | Preset list and selected topology | Permission, model, runtime, and budget controls |
| Settings | Native preferences navigation | Form rows separated by dividers |

## Pattern constraints

- Route roots use `.cly-route-*` so unique layout needs do not leak into shared primitives.
- Comparison-heavy collections stay tabular.
- Board/card layouts are permitted only where spatial grouping is itself meaningful.
- Timeline entries do not become freestanding dashboard cards.
- Empty states replace the collection in place.
- At 1024 px, supporting columns collapse before the primary task does.
- The graph canvas retains the largest available region and clips internally.

## Large collections

Sources show a bounded table window with an explicit result count. Next Steps uses `VirtualizedList` above 100 items and renders fewer than 30 DOM rows for the 500-item fixture. Graph rendering remains bounded by the existing graph implementation. Other large table routes use fixed-height scroll containers and sticky headers.
