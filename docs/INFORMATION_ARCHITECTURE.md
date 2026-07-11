# Information Architecture

## Shell

1. Title and command bar: project, path, phase, search, agent/local state, notifications, fixture mode, create, inspector, settings.
2. Grouped left sidebar: primary destination hierarchy.
3. Main workspace: lists, tables, graphs, timelines, details, comparisons, and reports.
4. Contextual inspector: selected-object metadata, links, context, and actions.
5. Optional Activity drawer: agents, imports, audits, background work, and future terminal/log streams.

## Navigation groups

| Group | Destinations |
|---|---|
| Workspace | Overview, Agent Sessions, Context |
| Research | Research Graph, Experiments, Sources, Literature, Notebooks, Code Linker, Claims |
| Integrity | Provenance, Reproducibility, Decisions, Next Steps |
| System | Integrations, Models & Agents, Settings |

NotebookLM is a tab inside Literature because it is a source-bundle companion, not an independent system of record. Provider modes live inside Integrations. Agent topology lives in Models & Agents; running work lives in Agent Sessions.

## Selection model

Lists, cards, tables, graph nodes, findings, decisions, and sessions set one stable selected ID. The inspector resolves that ID against the normalized repository. Navigation clears stale selection.

## Responsive behavior

- Expanded sidebar: 224 px; compact sidebar: 52 px.
- Inspector: 292 px and part of the grid above 1180 px.
- Below 1180 px the inspector becomes an overlay.
- Two- and three-column research layouts collapse at smaller widths.
- Dense tables scroll horizontally; large datasets render bounded row windows.
