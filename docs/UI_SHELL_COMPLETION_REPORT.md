# Cly UI Shell Completion Report

Completion date: 2026-07-11.

## Outcome

The Cly research cockpit is a complete, fixture-backed UI shell with all primary research and integrity workspaces, desktop menus, keyboard navigation, and responsive visual fixtures. The coding workspace is provided by Dream IDE as an implementation component. The research core — types, services, store, and screens — is in `src/features/cly/` and is independent of editor internals.

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

## Infrastructure

The coding workspace (editor, terminal, git, notebooks) uses Dream IDE infrastructure:

- Electron lifecycle, macOS hidden-inset window, renderer server, updater, theme IPC, preload bridge, and packaging.
- Zustand, SQLite/Drizzle, Hono API, terminal/process sessions, Git routes, browser sessions, editor detection, chat/provider adapters.
- shadcn-style primitives, Tailwind, lucide-react, Vitest, RTL, and Playwright.

The research core does not depend on Dream internals. It communicates through typed service interfaces (`src/features/cly/services/interfaces.ts`).

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

## Known limitations

- Research domain data is fixture-backed and resets on reload; only selected UI preferences use browser storage.
- No real source/code/notebook scanners, notebook or experiment execution, agent calls, OAuth, sync, or secret storage are active.
- Graph layout is a deterministic prototype with bounded rendering and zoom.
- Large tables use bounded rendering windows plus search rather than a production virtualized grid.
- Literature cells demonstrate editing visually but do not persist across reload.
- The prototype is currently English-only.
- Only arm64 macOS packaging was performed locally.

## Phase 2 recommendation

Implement project-scoped relational persistence first, then source import, claim/evidence relationships, static notebook/code scanners, experiment/run manifests, artifact provenance, deterministic reproducibility rules, graph-backed Context Composer, local signed-in CLI agent routing, planning/orchestration, VS Code extension, and finally official external integrations.
