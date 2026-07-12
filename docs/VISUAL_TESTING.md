# Cly visual testing

## Commands

```bash
pnpm test -- --run
pnpm exec playwright test tests/e2e/visual-system.spec.ts
pnpm test:e2e
```

The visual-system suite writes deterministic screenshots to `output/playwright/visual-v2/`. It disables animations for capture and checks document-level horizontal overflow before each route image.

## Coverage

- All 17 primary routes at 1728×1117 and 1024×700.
- Empty state for every data-backed route.
- Error state for Overview, Agent Sessions, Reproducibility, and Integrations.
- Claims with inspector closed and open.
- Next Steps with the 500-item large fixture and an assertion that fewer than 30 rows are mounted.
- Existing responsive Overview, Graph, Literature, shell drawer, and Agent Sessions workbench fixtures.

The current run generates 56 V2 route images plus the existing shell and Agent Sessions captures.

## What reviewers should inspect

- Nested or unnecessary outlines.
- Equal-weight actions and excessive status pills.
- Broken divider rhythm or inconsistent typography.
- Clipped table columns, route headers, menus, or inspector content.
- Empty workspace regions that do not serve the dominant task.
- Incorrect selected/focus/disabled/error state.
- Inspector width reserved without a selection.
- Canvas or table content expanding the document horizontally.

## Updating images

Run the visual suite after an intentional UI change and review the changed PNGs at full size. Do not accept a screenshot solely because the test completed: compare hierarchy, density, wrapping, and available workspace at both sizes. Keep fixture mode deterministic and avoid time- or network-derived content.
