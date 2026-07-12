---
name: cly-accessibility-review
description: Audit and improve Cly accessibility across keyboard traversal, focus, menus, dialogs, tabs, tables, split panes, graphs, status metadata, contrast, reduced motion, and Electron screen-reader behavior.
---

# Cly accessibility review

1. Launch Electron and run `scripts/run-a11y.mjs` on the target route.
2. Traverse the workflow using Tab, Shift+Tab, arrows, Enter, Space, Escape, and documented shortcuts.
3. Verify visible focus, stable focus restoration, accessible names, and no keyboard traps.
4. Check dialogs, menus, tabs, tables, split separators, graph controls, status labels, and live regions against `references/checklist.md`.
5. Fix serious and critical axe findings; document justified exceptions.
6. Re-run Electron E2E and reduced-motion checks.

Do not infer accessibility from ARIA alone. Exercise the actual interaction.
