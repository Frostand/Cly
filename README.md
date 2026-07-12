# Cly

Cly is a local-first, AI-native research operating system that connects scientific sources, code, experiments, artifacts, and claims in one auditable workspace.

Cly is built on the open-source [Dream IDE](https://github.com/dreamide/dream). Dream supplies the Electron workspace, multi-agent chat, terminal, Git, file navigation, and browser foundation. Cly adds a structured research-object graph, provenance, source and claim management, experiment tracking, and reproducibility workflows.

## Status

Cly now includes a complete UI/UX research-cockpit shell with shared fixtures,
mock service boundaries, all primary research and integrity workspaces, desktop
menus, keyboard navigation, automated workflows, and responsive visual
fixtures. Agent Sessions includes a complete two-mode Overview and Orchestrator
Chat workspace with full delegated-agent fixtures and a Browser, Terminal,
Code Diff, Agents, and Live Files workbench. Real research persistence,
scanners, model execution, external
integrations, and orchestration remain Phase 2 work. Do not use the current
fixture-backed build as a source of truth for production research data.

## Development

Requirements: Node.js 22 or newer and pnpm 11. Agent CLIs are optional during
the UI prototype phase.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Quality checks:

```bash
pnpm lint
pnpm typecheck
pnpm test --run
pnpm vite:build
```

## Documentation

- [Product plan](docs/product-plan.md)
- [Architecture](docs/architecture.md)
- [Dream UI audit](docs/DREAM_UI_AUDIT.md)
- [Information architecture](docs/INFORMATION_ARCHITECTURE.md)
- [UI map](docs/UI_MAP.md)
- [Feature matrix](docs/FEATURE_MATRIX.md)
- [UI testing](docs/UI_TESTING.md)
- [UI visual audit](docs/UI_VISUAL_AUDIT.md)
- [Design system V2](docs/DESIGN_SYSTEM_V2.md)
- [Application shell V2](docs/APP_SHELL_V2.md)
- [Route layout patterns](docs/ROUTE_LAYOUT_PATTERNS.md)
- [Interaction patterns](docs/INTERACTION_PATTERNS.md)
- [Accessibility](docs/ACCESSIBILITY.md)
- [Visual testing](docs/VISUAL_TESTING.md)
- [UI migration plan](docs/UI_MIGRATION_PLAN.md)
- [UI visual refactor report](docs/UI_VISUAL_REFACTOR_COMPLETION_REPORT.md)
- [UI polish iteration log](docs/UI_POLISH_ITERATION_LOG.md)
- [UI manual review](docs/UI_MANUAL_REVIEW.md)
- [UI copy guide](docs/UI_COPY_GUIDE.md)
- [Agent Sessions redesign](docs/AGENT_SESSIONS_REDESIGN.md)
- [Agent Sessions completion report](docs/AGENT_SESSIONS_COMPLETION_REPORT.md)
- [Phase 2 backend plan](docs/PHASE_2_BACKEND_PLAN.md)
- [Roadmap](docs/roadmap.md)
- [Upstream synchronization](docs/upstream-sync.md)
- [Architecture decisions](docs/adr/README.md)

## Upstream and license

Cly preserves Dream's Git history and MIT license. `origin` is the private Cly repository; `upstream` is the public Dream repository. See [NOTICE.md](NOTICE.md) for attribution and [LICENSE](LICENSE) for license terms.
