# Playwright Electron

Use the real Electron harness for desktop behavior:

```bash
pnpm test:e2e
node scripts/ui-review/run-electron-review.mjs final
node .agents/skills/cly-visual-polish/scripts/capture-responsive-matrix.mjs graph final
```

The harness prepares the renderer, launches `electron/main.js`, obtains the first window, resizes the native BrowserWindow, exercises routes and Agent workflows, checks accessibility structure, and captures screenshots under `artifacts/ui-review/`.

Browser-mode tests remain useful for fast fixture coverage but cannot replace Electron menu, native sizing, and packaged-renderer checks.
