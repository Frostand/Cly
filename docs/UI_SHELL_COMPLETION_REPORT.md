# Cly UI Shell Completion Report

Completion date: 2026-07-11.

## Outcome

The default Dream IDE renderer has been extended into a coherent, fixture-backed Cly research cockpit. Electron/React/TypeScript, windowing, preload IPC, process, Git, persistence, component, test, and packaging infrastructure remain in the repository. The main bundle no longer imports the heavy IDE composition.

## Dream components retained

- Electron lifecycle, macOS hidden-inset window, renderer server, updater boundary, secure external navigation, theme IPC, preload bridge, and packaging.
- Zustand, SQLite/Drizzle, Hono API, terminal/process sessions, Git routes, browser sessions, editor detection, chat/provider adapters, diff/file components, shadcn-style primitives, Tailwind, lucide-react, Vitest, RTL, and Playwright.

## Dream components replaced or hidden

- Replaced: main renderer composition, title/project-tab header, application menus, workspace navigation, settings presentation.
- Hidden from default shell: chat columns/history, file explorer, changes, browser, raw terminal, project status bar.
- Retained behind the UI for Phase 2 adapters rather than deleted.

## Architecture

- `src/features/cly/domain`: shared types and deterministic UI logic.
- `src/features/cly/fixtures`: coherent normalized fixture repository plus acceptance-size generator.
- `src/features/cly/services`: typed future backend contracts and mock implementations.
- `src/features/cly/store`: shared session state and cross-feature mutations.
- `src/features/cly/components`: shell, navigation, command palette, inspector, activity drawer, design primitives.
- `src/features/cly/screens`: all research, integrity, agent, integration, and settings workspaces.

## Navigation

- Workspace: Overview, Agent Sessions, Context.
- Research: Research Graph, Experiments, Sources, Literature, Notebooks, Code Linker, Claims.
- Integrity: Provenance, Reproducibility, Decisions, Next Steps.
- System: Integrations, Models & Agents, Settings.

## Screens and interactions

Implemented Research Overview, Context Composer, NotebookLM companion, Agent Sessions, Models & Agents topology editor, provider modes, Experiment Manager, Research Object Graph, Source Manager, Literature Matrix, Notebook Scanner, Code Linker, Claim Audit Board, Provenance, Reproducibility Auditor, Integrations, Next-Step Planner, Decision Log, settings, project/fixture switching, native menus, command palette, shortcuts, contextual inspector, Activity drawer, dialogs, toasts, empty/loading/error/offline/large/risk states, and light/dark themes.

## Mock data and services

The active fixture links claims, sources, experiments, runs, notebooks, code, artifacts, audits, decisions, context, agent sessions, reports, and graph edges by stable ID. Large mode generates 1,000 sources, 500 claims, 500 experiments, 1,000 runs, 100 notebooks, 2,000 graph nodes, 5,000 edges, 500 artifacts, and 500 decisions.

Services: Project, Context, Agent, Experiment, Source, Notebook, Claim, Research Graph, Reproducibility, Integration, Planner, and Decision.

## Tests and commands run

```bash
pnpm lint
pnpm typecheck
pnpm test --run
pnpm vite:build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm package:dir
codesign --verify --deep --strict --verbose=2 release/mac-arm64/Cly.app
```

Results: 6 Vitest files / 22 tests passed; 4 Playwright suites passed; renderer production build passed; headed Chrome visual QA reported zero console errors/warnings; packaged app passed strict code-signature verification.

## Packaged app

`release/mac-arm64/Cly.app` is an arm64 development app, version 0.5.0, bundle ID `ai.cly.cly`. It is 805 MB because Dream's future backend/provider dependencies remain packaged. The local build is signed with the available Apple Development identity and is not notarized. Local development packages omit updater configuration unless `CLY_UPDATE_FEED_URL` is explicitly supplied; CI fails closed without that variable.

## Known limitations and uncertainty

- Research domain data is fixture-backed and resets on reload; only selected UI preferences use browser storage.
- No real source/code/notebook scanners, notebook or experiment execution, agent calls, OAuth, sync, or secret storage are active.
- Graph layout is a deterministic prototype with bounded rendering and zoom; it is not a production force-directed/canvas renderer and does not yet implement full pointer panning.
- Large tables use bounded rendering windows plus search rather than a production virtualized grid with arbitrary row scrolling.
- Literature cells demonstrate editing visually but do not persist across reload.
- Existing Dream localization is retained but the new Cly shell is currently English-only.
- The package emitted a non-blocking `author is missed` warning from electron-builder.
- Only arm64 macOS packaging was performed locally; DMG/ZIP notarization, Windows, and Linux installers were not produced in this run.

## Phase 2 recommendation

Implement project-scoped relational persistence first, then source import, claim/evidence relationships, static notebook/code scanners, experiment/run manifests, artifact provenance, deterministic reproducibility rules, graph-backed Context Composer, local signed-in CLI agent routing, planning/orchestration, and finally official external integrations.
