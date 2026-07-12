# Electron UI review runner

Launches the real Cly Electron main process, controls its first `BrowserWindow`
with Playwright, exercises representative interactions, and writes screenshots
and route density metrics by iteration.

```bash
node scripts/ui-review/run-electron-review.mjs iteration-1
```

Artifacts are written to `artifacts/ui-review/<iteration>/`.
