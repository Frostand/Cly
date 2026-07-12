# Cly accessibility

## Implemented baseline

- Every primary route has one level-one heading and a consistent heading order.
- Sidebar, toolbar, search, dialog, table, tree, timeline, inspector, and progress regions have meaningful names.
- Status and risk include readable text; color is supplementary.
- Focus-visible uses a shared high-contrast ring.
- Buttons and icon-only controls have accessible names.
- Native buttons, inputs, selects, details/summary, lists, and tables are preferred over simulated roles.
- Split-pane separators are focusable and expose orientation, limits, current value, and arrow-key controls.
- Loading uses a named status region and skeleton rows.
- The inspector no longer creates an empty landmark when there is no selection.
- Reduced-motion preferences remove nonessential movement.

## Keyboard contract

Tab reaches every visible action in visual order. Enter/Space activate native controls. Arrow keys resize a focused split. Escape closes transient overlays or clears selection. Command-palette and shell shortcuts remain documented in Settings.

## Tables and large collections

Tables retain semantic headers, row labels, and sort state. Scroll containers do not replace table semantics. Virtualized recommendations use a named list, semantic list items, stable keys, and visible text for priority, status, impact, effort, and urgency.

## Contrast and scaling

Text roles use theme tokens rather than route colors. Muted text is reserved for metadata and never carries the only explanation. Layouts tolerate browser text scaling through flexible grid tracks, wrapping actions, scroll containment, and 1024 px responsive rules.

## Verification

Component tests cover progress ARIA values, labeled search, native disclosure, split separators, status text, and virtual-list semantics. Playwright exercises keyboard commands, inspector selection, sidebar/activity controls, and every route at narrow and large desktop sizes.

## Remaining manual checks

Before production release, run VoiceOver through data tables, command search, graph nodes, the Agent Sessions transcript/workbench, and each create dialog. Perform WCAG contrast measurement against the production icon and font rendering on both macOS themes.
