# Cly manual review

## Launch and control method

The app was launched as the real Electron application with Playwright’s `_electron.launch`, targeting `electron/main.js`. Electron started its actual renderer and API servers. The runner obtained the first `BrowserWindow`, changed native window bounds, interacted through accessible locators, typed into controls, and captured the rendered desktop window.

```bash
node scripts/ui-review/run-electron-review.mjs iteration-1
node scripts/ui-review/run-electron-review.mjs iteration-2
node scripts/ui-review/run-electron-review.mjs iteration-3
node scripts/ui-review/run-electron-review.mjs final
```

## Workflows exercised in Electron

- Switched from Neural surrogate reliability to Cell morphology atlas and back.
- Navigated all 17 primary routes.
- Collapsed/expanded the sidebar, opened command/search surfaces, inspector, activity drawer, project switcher, overflow menu, and dialogs.
- Opened Agent Sessions, typed and sent a message, switched Tests/Agents/Live Files/Code Diff, returned to Overview, switched sessions, and exercised approval state.
- Included Raman et al. 2025, pinned it, changed raw/summary representation, opened Item actions, compressed it, switched Agent preview/Composer, and applied Claim Audit pack.
- Selected a source, opened Link to claim, selected a claim, experiment, provenance artifact, reproducibility finding, accepted a next step, created a decision, and selected the linked graph node.
- Changed an agent model, opened GitHub setup, changed the theme, reloaded Electron, verified persistence, and restored dark theme.

## Resolutions

The review runner captured Overview, Sources, Research Graph, and Agent Sessions at 1024×700, 1280×800, 1440×900, and 1728×1117. All routes were captured at 1440×900. Shell/menu/dialog/inspector/activity and key workflow states were captured separately.

## Accessibility findings

- Shared dialogs now close with Escape, trap focus, focus the first form field, use unique title ids, and restore prior focus.
- Active tabs expose `aria-selected`; mode buttons expose pressed state.
- Session and titlebar menus are keyboard dismissible; session actions use menu-item semantics.
- Split panes retain named separators and current/min/max ARIA values.
- Status remains text-backed rather than color-only.
- The Electron regression test validates accessible navigation, workbench tabs, and the composer from an ARIA snapshot.

## Performance observations

No visible lag was observed during route switching, native resize, sidebar toggling, inspector opening, context selection, workbench tab switching, or chat input. The 500-recommendation fixture remains virtualized. No backend optimization was performed.

## Final verification

```bash
pnpm lint
pnpm typecheck
pnpm test -- --run
pnpm test:e2e
pnpm package:dir
```

The final run passed 43 Vitest tests and 12 Playwright tests, including the real-Electron review. The macOS arm64 directory package compiled and signed successfully. Notarization was skipped because local notarization options were not configured.

## Remaining issues

- macOS Electron screenshot composition can briefly omit titlebar content immediately after navigation; the review harness waits 180 ms before capture. Live interaction was unaffected.
- Literature’s wide matrix intentionally requires internal horizontal scrolling at narrow widths.
- Production-sized source/experiment tables may eventually need a reusable virtual table rather than the current bounded rendering window.
