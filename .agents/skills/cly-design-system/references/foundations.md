# Cly foundations

| Area | Contract |
|---|---|
| Spacing | 4, 8, 12, 16, 24px via `--cly-space-*` |
| Typography | 8–10px metadata, 10–12px body/control, 13–18px headings; concise line lengths |
| Surfaces | workspace → surface → raised; add a nested surface only for interaction or hierarchy |
| Borders | 1px dividers; accent borders indicate selection or active work only |
| Radii | 5px controls, 8px groups, 12px dialogs; avoid rounded-card walls |
| Focus | `--cly-focus-ring`, never remove without replacement |
| Controls | 28px standard height; icon buttons require labels or tooltips |
| Tables | 38px rows, sticky header, sortable headers, compact badges only for state |
| Sidebar | 224px expanded, icon rail when collapsed, stable grouping |
| Inspector | 280–340px, selection-driven, collapsible, no empty shell |
| Split panes | 280px practical minimum, 5px keyboard separator, persisted sizes |
| Motion | 120ms controls, 180ms panels, no looping decoration |
| Terminal | SF Mono/Cascadia, xterm renderer, fake PTY streams in tests |

Approved imports:

- `src/features/cly/components/primitives.tsx`
- `src/features/cly/components/design-system.tsx`
- `src/features/cly/components/toolkit.tsx`
- `lucide-react`
- `motion/react` through shared motion helpers
