---
name: cly-visual-polish
description: Run screenshot-driven visual and usability iteration on Cly's real Electron app, including route captures, responsive matrices, issue recording, before/after comparison, and regression verification.
---

# Cly visual polish

## Required loop

1. Confirm `npx` and dependencies are available.
2. Launch the real Electron app, not only Vite browser mode.
3. Capture the requested route at 1024×700, 1280×800, 1440×900, and 1728×1117.
4. Record concrete issues using `references/review-checklist.md` with severity and screenshot path.
5. Fix high-severity usability, clipping, hierarchy, and interaction problems first.
6. Relaunch and recapture into a new iteration directory.
7. Compare old/new captures and repeat until no high-severity issue remains.
8. Run lint, typecheck, unit, Electron E2E, and packaging checks.

## Commands

Run scripts from the repository root:

```bash
node .agents/skills/cly-visual-polish/scripts/capture-route.mjs overview 1440 900 toolkit-after
node scripts/ui-review/run-electron-review.mjs toolkit-after
node .agents/skills/cly-visual-polish/scripts/generate-review-index.mjs artifacts/ui-review/toolkit-after
```

Never approve a visual change from source inspection alone. Preserve scientific content and verify keyboard focus after layout changes.
