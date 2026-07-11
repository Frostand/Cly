# UI Testing

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm test --run
pnpm test:e2e
pnpm vite:build
```

Install the matching Playwright browser once with `pnpm exec playwright install chromium`.

## Coverage

Unit tests cover context budget/category totals, filtering/sorting, next-step prioritization, store navigation/selection/shell state, fixture switching, cross-feature mutation, graph relationships, decision supersession, and acceptance-size fixture generation.

Component tests render the real shell and verify every major destination plus command palette, context controls, source table, literature matrix, notebook list, claim board, experiment list, provenance gallery, audit findings, integration cards, and decision timeline.

E2E tests cover launch, all destinations, claim creation/linking, NotebookLM bundle state, notebook import/scan, experiment comparison, graph evidence trace, Context Composer, agent preset save, audit run, next-step acceptance, decision creation, sidebar/inspector/activity controls, keyboard shortcuts, and command execution.

## Visual fixtures

The E2E suite writes regression-aid screenshots to `output/playwright/` for 1024×700, 1280×800, 1440×900, 1728×1117, graph, literature matrix, collapsed sidebar, inspector, and Activity drawer states. Pixel-perfect comparison is intentionally not the sole assertion strategy.

## Manual QA

Playwright CLI was used in headed Chrome for semantic snapshots and visual review of Overview, Context, and Research Graph. The console was checked after local font removal and reported zero errors/warnings.
