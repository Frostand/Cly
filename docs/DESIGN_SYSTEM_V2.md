# Cly design system V2

## Intent

V2 makes Cly feel like one desktop research workspace instead of a dashboard made from nested cards. It preserves the existing Electron, React, TypeScript, route, fixture, and service architecture. The implementation is the `v2` cascade layer in `src/features/cly/cly.css` plus the primitives in `src/features/cly/components/design-system.tsx`.

## Surface model

Only five semantic levels are used:

1. `--cly-bg`: application chrome and the outer frame.
2. `--cly-workspace`: the continuous primary workspace.
3. `--cly-raised`: menus, popovers, sheets, dialogs, and floating tools.
4. `--cly-selected`: selected rows, tabs, and navigation.
5. warning/approval surfaces: contextual callouts that require attention.

`Panel` is now borderless grouping by default. `workspace`, `raised`, and `selected` variants are explicit. Dividers communicate structure; rounded outlines no longer wrap every group.

## Tokens

- Spacing: `--cly-space-1` through `--cly-space-5` (4, 8, 12, 16, 24 px).
- Controls: `--cly-control-height` 28 px and `--cly-icon-size` 14 px.
- Rows: `--cly-row-height` 34 px and `--cly-table-row-height` 38 px.
- Surfaces: background, workspace, raised, selected, divider, hover.
- Motion: `--cly-motion-fast` and `--cly-motion-panel`; reduced motion removes nonessential transitions.
- Focus: `--cly-focus-ring` is used consistently instead of route-specific focus styling.
- Typography: compact desktop scale, strong heading hierarchy, muted metadata, monospace only for paths, ids, measurements, and shortcuts.

Dark and light themes map the semantic roles independently. Route components do not own theme-specific colors.

## Shared primitives

| Primitive | Purpose |
| --- | --- |
| `WorkspaceHeader` | Route identity, short context, metadata, and primary actions |
| `PaneHeader` | Local list/detail or inspector section heading |
| `Toolbar` / `SearchField` | Named control groups and searchable collections |
| `SplitPane` | Keyboard-resizable list/detail workspaces |
| `InlineMetadata` | Quiet descriptors without badge chrome |
| `StatusIndicator` / `RiskIndicator` | Dot plus text; status never relies on color alone |
| `ProgressIndicator` | Labeled, clamped progress with ARIA values |
| `DisclosureRow` | Native keyboard-operable expandable report row |
| `OutlineView` | Tree/outline container for code and notebook structure |
| `SkeletonRows` | Non-blocking loading state |
| `VirtualizedList` | Fixed-row windowing for performance fixtures |

Existing `PageHeader`, `Badge`, and `LoadingState` delegate to V2 behavior so every route benefits without a disruptive rewrite. `Badge` now renders as a dot-led text status instead of a permanent outlined pill.

## Component rules

- Cards are reserved for a genuinely self-contained object or preview.
- Tables are used for repeated comparable attributes.
- Lists are used for scanning and selection.
- Timelines represent history and decisions.
- Split panes represent list/detail work.
- Graph routes give the canvas the dominant surface.
- Inspectors contain contextual details only after selection.
- One primary button is allowed in a local action group; secondary actions are quiet or placed in overflow.
- Empty and error states live in the workspace flow, not in large dashed containers.

## States

Interactive rows expose hover, focus-visible, selected, disabled, and unavailable states. Disabled or unavailable actions retain an explanation in nearby text or a triggered honest prototype message. Loading uses skeleton rows. Errors use a left-bar callout and recovery action where one exists.

## Extending V2

Use semantic tokens and an existing layout primitive first. Add a token only when it expresses a reusable role, not a one-route measurement. Add route-scoped CSS under `.cly-route-*` only for information architecture unique to that route.
