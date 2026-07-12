# Visual System V4

Visual System V4 keeps Cly a dense local research cockpit while making state legible before prose is read.

## Hierarchy and visual budget

Every route has one dominant structure: conversation, graph, matrix, table, timeline, lineage, or prioritized list. A route may add one supporting summary above the fold. Supporting visuals must answer a concrete question and use fixture or repository data.

Surface levels remain: workspace, secondary panel, raised overlay, selected surface, and semantic warning/approval/error. Prefer spacing, alignment, and a divider before adding another border.

## Typography and spacing

- 16–18px route titles; 12–15px object titles; 10–12px content; 8–10px metadata.
- Long research prose keeps a readable line length and is never forced into a badge.
- Use the existing 4, 8, 12, 16, and 24px spacing tokens.
- Uppercase is reserved for short route/section context, not ordinary labels.

## Color and status

Purple marks selection, focus, the active route, active delegation, and primary progress. Success, warning, danger, uncertainty, stale, and broken states use their semantic colors and always include text, shape, or an accessible summary.

## Shared visual components

`src/features/cly/components/visuals.tsx` provides:

- `VisualMetric` and `Sparkline`
- `ResearchLifecycle`
- `TokenBudgetBar`
- `EvidenceStrength`
- `ExecutionStrip`
- `RiskDistribution`
- `RelationshipChain`
- `ClyMotionProvider` and `RouteTransition`

Visuals use SVG or CSS rather than a chart dependency. They expose textual alternatives and do not imply scientific certainty beyond the source data.

## Responsive behavior

At narrower desktop widths, later summary metrics and relationship-chain steps may collapse while the primary workspace remains visible. Inspectors become overlays, toolbar actions condense, tables retain their primary columns, and no route becomes mobile-like.
