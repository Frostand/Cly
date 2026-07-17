# Information Architecture

## Shell

1. Title and command bar: project, path, search, activity, local state, fixture mode in development, and a selection-driven inspector control.
2. Grouped left sidebar: project work in the scrolling hierarchy; Settings remains pinned in the footer.
3. Main workspace: lists, tables, graphs, timelines, details, comparisons, and reports.
4. Contextual inspector: selected-object metadata, links, context, and actions.
5. Optional Activity drawer: agents, imports, audits, background work, and future terminal/log streams.

## Navigation groups

| Group | Destinations |
|---|---|
| Project | Overview, Objectives |
| Work | Agent Sessions, Context, Experiments, Costs |
| Evidence | Sources, Literature, Notebooks, Code Linker, Research Graph, Claims |
| Review | Data Obligations, Provenance, Reproducibility, Impact Review, Decisions, Next Steps, Reviewer Capsules |
| Configuration | Integrations, Models & Agents |
| Pinned footer | Settings, appearance, sidebar control |

NotebookLM is a tab inside Literature because it is a source-bundle companion, not an independent system of record. Provider modes live inside Integrations. Agent topology lives in Models & Agents; running work lives in Agent Sessions.

Route pages own their specific primary action. The global title bar does not
duplicate creation controls or use an ambiguous **New** action.

## Selection model

Lists, cards, tables, graph nodes, findings, decisions, and sessions set one stable selected ID. The inspector resolves that ID against the normalized repository. Navigation clears stale selection.

## Responsive behavior

- Expanded sidebar: 224 px; compact sidebar: 52 px.
- Inspector: 292 px and part of the grid above 1180 px.
- Below 1180 px the inspector becomes an overlay.
- Two- and three-column research layouts collapse at smaller widths.
- Dense tables scroll horizontally; large datasets render bounded row windows.
