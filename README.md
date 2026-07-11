# Cly

Cly is a local-first, AI-native research operating system that connects scientific sources, code, experiments, artifacts, and claims in one auditable workspace.

Cly is built on the open-source [Dream IDE](https://github.com/dreamide/dream). Dream supplies the Electron workspace, multi-agent chat, terminal, Git, file navigation, and browser foundation. Cly adds a structured research-object graph, provenance, source and claim management, experiment tracking, and reproducibility workflows.

## Status

Cly now includes a complete UI/UX research-cockpit shell with shared fixtures,
mock service boundaries, all primary research and integrity workspaces, desktop
menus, keyboard navigation, automated workflows, and responsive visual
fixtures. Real research persistence, scanners, model execution, external
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
- [Phase 2 backend plan](docs/PHASE_2_BACKEND_PLAN.md)
- [Roadmap](docs/roadmap.md)
- [Upstream synchronization](docs/upstream-sync.md)
- [Architecture decisions](docs/adr/README.md)

## Upstream and license

Cly preserves Dream's Git history and MIT license. `origin` is the private Cly repository; `upstream` is the public Dream repository. See [NOTICE.md](NOTICE.md) for attribution and [LICENSE](LICENSE) for license terms.
