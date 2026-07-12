# Cly visual regression review

## Artifact layout

```text
artifacts/ui-review/
  iteration-1/
  iteration-2/
  iteration-3/
  final/
```

Each directory contains route screenshots, shell/menu/dialog/inspector states, representative responsive screenshots, and `review-data.json` with visible-character, button, panel, console, and overflow measurements.

## Automated review

```bash
node scripts/ui-review/run-electron-review.mjs final
pnpm exec playwright test tests/e2e/ui-review/electron-review.spec.ts
```

The Electron test navigates every route at 1024×700, asserts no document-level overflow, verifies menu Escape behavior, types into Agent Chat, opens Live Files, and checks the accessibility snapshot.

## Human review checklist

- Purpose and primary action are clear within three seconds.
- Secondary details do not overpower the primary object.
- No empty inspector reserves space.
- No table label or action is clipped.
- Menus and dialogs dismiss predictably.
- Route descriptions are task-oriented and concise.
- Selected route/object/tab state is obvious.
- Boxes and pills are used only for meaningful state or containment.
- 1024 px remains usable without document overflow.

## Baseline policy

Do not update `final/` blindly. Run the Electron workflow, inspect every changed route at full size, compare it with the prior iteration, and record intentional differences in `UI_POLISH_ITERATION_LOG.md`. Browser-only images remain useful for CI, but Electron captures are the visual source of truth for desktop polish.
