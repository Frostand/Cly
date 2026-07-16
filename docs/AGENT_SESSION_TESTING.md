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
# Cross-device Cly Dev resume

`tests/e2e/cly-dev-cross-device.spec.ts` creates two isolated SQLite stores and two Git clones. It verifies transferable conversation, plan, diff/test, remaining-work, and research context across a compare-and-swap handoff; destination Git readiness; absence of uncommitted source files; concurrent publication conflicts; and the updated return trip to the source machine.

The failure matrix for missing repositories, remote mismatch, uncommitted work, missing commits, divergent branches, submodule mismatch, missing tools, permissions, offline transport, revoked devices, and provider authentication is covered by the focused `electron/api/cly-dev` suites.
