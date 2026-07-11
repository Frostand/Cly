# Agent Session testing

## Automated coverage

`agent-sessions-store.test.ts` covers default/fallback mode, persisted mode/selection/filter/sort, creation, model/reasoning configuration, drafts, transcripts, tab lifecycle, layout persistence, agent updates, approvals, and background-safe mode transitions.

`agent-sessions-components.test.tsx` covers Overview rows, mode transition, new-session flow, visible composer text, Cmd/Ctrl+Enter sending, fixture streaming, Browser, Terminal, Diff, Agents, Live Files, steering, configuration, and approval actions.

`tests/e2e/agent-sessions.spec.ts` executes the complete fixture workflow and captures visual cases at 1024×700, 1280×800, 1440×900, and 1728×1117.

## Commands

```bash
pnpm lint
pnpm typecheck
pnpm test --run
pnpm test:e2e
pnpm package:dir
```

Generated images are under `output/playwright/` and are intentional visual-regression artifacts.
