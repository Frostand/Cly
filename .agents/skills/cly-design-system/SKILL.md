---
name: cly-design-system
description: Apply Cly's research-cockpit design system when creating or changing Cly screens, shared components, layouts, data tables, inspectors, Agent Sessions, terminal surfaces, responsive behavior, and visual tokens in this repository.
---

# Cly design system

Treat Cly as a local-first research cockpit, not an IDE clone or admin dashboard.

## Workflow

1. Read `src/features/cly/cly.css`, `components/design-system.tsx`, `components/primitives.tsx`, and `components/toolkit.tsx` before adding UI primitives.
2. Select the route pattern from `../cly-route-review/references/route-patterns.md`.
3. Reuse Cly components before importing a third-party primitive directly.
4. Keep feature code independent of toolkit details when a shared wrapper exists.
5. Test populated, empty, loading, error, large-fixture, narrow, and keyboard states.
6. Use `$cly-visual-polish` after implementation.

## Rules

- Use the spacing, typography, surface, control, icon, table, and motion tokens in `references/foundations.md`.
- Use purple for selection, focus, and primary actions—not decoration.
- Prefer continuous workspaces, rows, dividers, split panes, tables, timelines, and graphs over nested cards.
- Keep inspectors contextual, useful, and collapsible. Never reserve a large empty inspector.
- Use Lucide at 14px by default, 16px in navigation, and 22–28px in empty states.
- Keep buttons at three levels: primary, default, ghost. Use danger only for destructive actions.
- Use dense 36–38px data rows, sticky headers, keyboard-selectable rows, and visible sorting state.
- Use `ClySplitPane` for major resizable layouts and persist stable route-specific IDs.
- Use xterm for terminal output and monospace only for commands, paths, hashes, and code.
- Respect reduced motion, visible focus, accessible names, and 4.5:1 text contrast.

## Anti-patterns

- Do not render everything as cards.
- Do not put static metadata in pills.
- Do not add explanatory text when layout can explain the feature.
- Do not invent colors or spacing values.
- Do not create nested surfaces without a structural reason.
- Do not use purple on every icon, border, or badge.
- Do not create a generic dashboard grid for every route.
