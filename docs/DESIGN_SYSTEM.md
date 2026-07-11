# Cly Design System

## Principles

- Dark-first, calm, compact, desktop-native.
- Hierarchy comes from type, spacing, and surface changes rather than heavy card grids.
- Borders and color are restrained; color never carries status alone.
- Tables and linked evidence remain information-dense.

## Tokens

The Cly token layer is in `src/features/cly/cly.css` and defines background, surface, raised surface, hover, sidebar, border, text, muted text, accent, info, success, warning, danger, shadows, radii, and mono typography for both dark and light themes.

Spacing uses a compact 4–8–12–16–24–32 rhythm. Primary radii are 5, 8, and 12 px. Focus uses a two-pixel accent outline. Reduced-motion media queries minimize transitions.

## Components

Shared primitives include buttons, badges, page/section headers, metrics, segmented controls, search, dialogs, toggles, panels, empty/loading/error states, lists, dense tables, timelines, progress, callouts, context rows, topology nodes, graph nodes/edges, evidence chains, inspector, activity drawer, popovers, and toasts.

Research compositions include claim cards, experiment/run tables, artifact previews, source rows, notebook outlines, context packs/budget, reproducibility findings, integration cards, decision timeline, and agent topology.

## Status semantics

| Tone | Examples |
|---|---|
| Neutral | planned, optional, manual metadata |
| Info | medium, suggested, queued, reading |
| Success | connected, verified, strong, ready, canonical |
| Warning | weak, running, stale, partial, needs review |
| Danger | unsupported, failed, broken, blocking, invalidated |

Every badge contains text and a dot; findings also display severity and disposition text.

## Accessibility

Semantic headings, tables, field labels, switches, dialogs, navigation landmarks, keyboard focus, status live regions, reduced motion, and non-color status labels are required. Stable `data-testid` values are reserved for shell controls and sidebar destinations.
