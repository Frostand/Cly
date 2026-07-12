# Cly interaction patterns

## Selection and inspection

Rows, nodes, claims, findings, sources, and artifacts select an object. Selection opens the contextual inspector where appropriate; clearing selection closes it. The global inspector is not used inside Agent Sessions because the workbench owns that space.

## Navigation and commands

- Sidebar rows are the canonical primary-route navigation.
- `Cmd+K` opens command search and supports keyboard execution.
- Route shortcuts, project switching, activity, inspector, and sidebar shortcuts remain available.
- Overflow menus contain infrequent application actions; route toolbars contain only actions relevant to the current task.

## Collection controls

Search, filters, sorting, and view modes appear in a compact toolbar immediately above the collection they affect. Tables expose sort state. Filters retain a visible label or accessible name. Result counts update in the same local region.

## Disclosure and progressive detail

Use disclosure rows for findings, report evidence, or advanced settings. Use inspectors for durable contextual detail, popovers for lightweight configuration, dialogs for focused creation/editing, and the activity drawer for temporary global history.

## Feedback

Fixture-backed actions update state where implemented and show a concise toast. Prototype-only actions describe what would happen instead of silently failing. Unavailable integration states include a reason. Loading shows skeleton rows; errors remain contextual and recoverable.

## Destructive and consequential actions

Destructive actions use a named confirmation path. Approval and risk states use text plus icon or dot. Primary buttons are reserved for save, create, start, accept, or configure actions; routine navigation and reveal actions remain quiet.

## Resize and responsive behavior

Split separators accept Left/Right arrow input and expose min, max, and current values. The application is desktop-first at 1024 px and above. Narrow states reduce secondary metadata, stack complex regions, or collapse the sidebar without hiding primary actions.
