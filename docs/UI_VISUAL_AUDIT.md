# Cly UI visual audit

Date: 2026-07-12

## Executive findings

The application already has sound route coverage, fixture-backed interactions, tables, split views, timelines, a graph canvas, an inspector, dialogs, a command palette, and a persistent desktop shell. The main visual failure is that the shared primitives flatten those different structures into the same treatment: bordered panels, bordered metric groups, outlined badges, boxed filter controls, and large dashed empty containers. Because `Panel`, `Metric`, `Badge`, `Section`, and `PageHeader` appear on nearly every route, their styling makes otherwise appropriate route layouts feel like repeated cards.

The audit found 141 `Panel`, 102 `Badge`, 36 `Metric`, and 61 `Section` references across the primary screen modules. Several routes already use the correct information structure but still inherit excessive outlines and nested surfaces.

## Repeated anti-patterns

- `Panel` always creates a bordered rounded surface, even when it only groups list rows.
- Metrics appear as equal-weight cells inside another outlined container.
- Static metadata is frequently rendered through `Badge`, giving status and ordinary descriptors equal prominence.
- Page headers repeat kicker, title, description, and several equal-weight buttons on every screen.
- Grid helpers encourage three-card catalogs for integrations, presets, context packs, outputs, and next steps.
- Empty states create another large dashed rounded box instead of occupying the workspace naturally.
- The global inspector remains open without a meaningful selection.
- Top-bar utilities have identical visual weight and no overflow grouping.
- Many route actions are technically functional but visually compete with the primary task.
- Fixed card padding and large section gaps reduce usable density at 1024×700.

## Shared component inventory

| Area | Current components | Audit result | V2 direction |
| --- | --- | --- | --- |
| Shell | `ClyAppShell`, `Titlebar`, `Sidebar`, `Inspector`, `ActivityDrawer` | Correct architecture; hierarchy and empty-inspector behavior need work | Calm titlebar, automatic contextual inspector, quieter drawer and navigation |
| Content framing | `PageHeader`, `Section`, `Panel` | Over-applied card and heading pattern | Compact workspace/pane headers, borderless grouping, dividers only between meaningful regions |
| Status and metadata | `Badge`, ad hoc muted spans | Too many pills and inconsistent metadata | Dot-led status indicator and inline metadata |
| Collections | `cly-list-row`, `cly-table`, grids | Tables/lists exist but are wrapped as cards | Continuous lists/tables with selection rails and sticky headers |
| Workflows | `Dialog`, popovers, command palette | Functional; dialog and popover styling is visually heavy | Focused sheets/dialogs and compact menus |
| States | `EmptyState`, `LoadingState`, `ErrorState` | Large bordered boxes and blocking spinner | Integrated empty states, skeleton rows, contextual errors |
| Navigation | sidebar groups and rows | Good grouping; selected state and counts can be quieter | Native list hierarchy, count text, focus and collapsed tooltips |

## Route audit and migration matrix

| Route | Current layout / navigation | Information type and primary task | Current problems | V2 replacement pattern | Shared components / interaction changes | Accessibility | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Overview | Header, metric card, two direction cards, two-column summaries | Project orientation and next action | Equal metrics and nested panels dilute the research question and risks | One dominant project brief, compact summary strip, activity timeline, integrity list, small graph preview | Workspace header, inline metrics, list rows, timeline | Heading order, status text, keyboard-linked rows | Planned |
| Agent Sessions | Overview rows and Chat/workbench split | Manage sessions and work with Orchestrator | Already purpose-built; must stay visually distinct during global refactor | Preserve compact rows, transcript, draggable workbench, contextual status | Existing Agent Sessions V2 components, quieter shared controls | Accessible tabs, split separator, labeled composer | Preserve/refine |
| Context | Header, list panel, pack card grid, budget cards | Select, order, and inspect context | Correct split concept but packs/budget/list are separately boxed | Three-pane information manager with continuous list, outline-like packs, sticky budget summary | Split pane, outline rows, inline toggles, preview pane | Toggle names, selection semantics, keyboard ordering | Planned |
| Research Graph | Header, canvas inside panel, tools panel, table/evidence modes | Explore research relationships | Canvas loses dominance inside surrounding panels | Edge-to-edge canvas with floating toolbar and optional outline/inspector | Canvas surface, floating toolbar, contextual inspector | Labeled nodes, keyboard focus, non-color states | Planned |
| Experiments | Header, metrics, experiment/run tables, comparison cards, timeline | Compare experiments and inspect runs | Tables are correct; metric and comparison cards compete | Dense table-first split detail with compact comparison strip and run timeline | Data table, filter bar, pane header, timeline | Sort state, row selection, table labels | Planned |
| Sources | Header, metric strip, source table, action section | Find, preview, and link sources | Correct table is separated from actions by card framing | Searchable source list/table with preview inspector and quiet actions | Data table, search/filter bar, inspector sections | Row focus, search labels, action availability | Planned |
| Literature | Matrix plus card grids, timeline and bundle panels | Compare literature and assemble evidence | Matrix is strong; alternate views revert to card grids | Resizable matrix as default, thematic/chronological list variants, bundle split | Dense table, column controls, timeline, split pane | Sticky headers, table navigation, visible selection | Planned |
| Notebooks | List/detail overview with nested sections | Audit notebooks and inspect cells/issues | Split view exists but selected detail contains many bordered sections | Notebook outline and audit columns with continuous selected-detail report | Split pane, outline, disclosure rows, issue list | Outline semantics, issue status text | Planned |
| Code Linker | Settings-style two-pane list/detail | Trace code to research purpose and risks | Good split concept but reuses settings/card sections | File outline + read-only research-purpose detail + relationship/risk lists | Outline view, pane header, inspector section | Tree labels, selected file state, keyboard focus | Planned |
| Claims | Board/table/detail modes | Evaluate claim strength and evidence | Board cards contain nested badges and metadata boxes | Compact board items, dense table, evidence split detail | Board lane, data table, evidence chain | Status text, column headings, keyboard actions | Planned |
| Provenance | Gallery card grid, table, lineage chain | Trace artifact generation and failures | Gallery defaults to repetitive cards; lineage is the better primary model | Lineage/list default with artifact selection and broken-chain emphasis | Lineage chain, artifact list, preview inspector | Ordered flow text, severity labels | Planned |
| Reproducibility | Metric card, overview columns, finding panels, coverage cards | Understand audit status and fix blockers | Repeated finding/coverage cards obscure report hierarchy | Audit report with score summary, grouped checklist, disclosure findings, history comparison | Report header, checklist rows, risk indicator, disclosures | Expandable keyboard rows, severity text | Planned |
| Decisions | Timeline plus action section | Review research decisions over time | Timeline is appropriate but each detail/action is over-framed | Dominant chronological timeline with compact evidence/outcome detail | Timeline, inline metadata, contextual actions | Ordered chronology, status text | Preserve/refine |
| Next Steps | Three-column recommendation card grid | Prioritize research work | Card grid makes comparison and priority scanning difficult | Ranked roadmap/task list with impact, effort, dependency and agent columns | Prioritized list/table, progress/status indicators | Row headings, sortable priority, clear actions | Planned |
| Integrations | Three-card catalog and connection-mode card grids | Inspect and configure providers | Catalog cards are repetitive and capabilities become pills | Grouped compact provider rows with status, capabilities, last sync, setup action | Grouped list, disclosure row, status indicator | Provider/status labels, disabled reason | Planned |
| Models & Agents | Preset cards, topology, control cards | Choose models and configure agent plans | Preset/control card grids obscure hierarchy | Provider/model table, preset list, selected configuration pane, topology | Table/list split, topology, permission rows | Explicit context/permission labels | Planned |
| Settings | Category sidebar and form panels | Change desktop preferences | Best structural fit, but individual settings and groups remain boxed | Native preferences list with form rows and subtle group dividers | Preferences navigation, form row, toggle, disclosure | Labels, descriptions, focus order | Planned |

## Menus, overlays, and controls

- Primary buttons are appropriate for create/save/start actions only.
- Secondary bordered buttons should be reserved for explicit reversible actions.
- Low-priority controls become quiet/icon actions with tooltips.
- Status badges become compact dot-led labels without permanent pill outlines.
- Toolbars retain search, filtering, view mode, and one primary action; other actions move to menus.
- Popovers and command menus keep compact rows, separators, and shortcut labels.
- Dialogs remain for focused creation/editing; inspector and popover actions should not become dialogs.

## Responsive and performance risks

- At 1024×700, three-column grids, wide metric strips, and open inspectors compete for width.
- Matrix/table routes require horizontal containment and priority-column hiding.
- Large fixtures are generated at the required sizes, but DOM-heavy card grids are less efficient than rows/tables. V2 should cap rendered preview subsets and keep large collections inside scroll containers.
- Graph fixtures already reach 2,000 nodes/5,000 edges; canvas rendering must remain the dominant, clipped surface.

## Accessibility priorities

- Collapse the inspector when no selected entity exists.
- Preserve visible focus on all row-like buttons and table rows.
- Keep status text alongside color indicators.
- Use semantic tables, ordered timelines, headings, and labeled regions.
- Ensure split separators and disclosure rows are keyboard operable.
- Retain reduced-motion behavior and sufficient contrast for secondary text.

## Post-migration outcome

The audit matrix above records the pre-implementation disposition. Every listed route was migrated in the V2 pass; the completed status, replaced components, and test coverage are tracked in `UI_MIGRATION_PLAN.md`. The measured shared anti-pattern counts remain here as the baseline that motivated the refactor.
