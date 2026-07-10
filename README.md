# Cly

Cly is a local-first, AI-native research operating system that connects scientific sources, code, experiments, artifacts, and claims in one auditable workspace.

Cly is built on the open-source [Dream IDE](https://github.com/dreamide/dream). Dream supplies the Electron workspace, multi-agent chat, terminal, Git, file navigation, and browser foundation. Cly adds a structured research-object graph, provenance, source and claim management, experiment tracking, and reproducibility workflows.

## Status

Cly is in foundation development. The current branch retains Dream's working IDE while product identity, safety controls, architecture boundaries, and the first research workflow are established. It is not ready for production research data.

## Development

Requirements: Node.js 22 or newer, pnpm 11, and at least one supported agent CLI (Codex, Claude Code, OpenCode, or Cursor Agent).

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
- [Roadmap](docs/roadmap.md)
- [Upstream synchronization](docs/upstream-sync.md)
- [Architecture decisions](docs/adr/README.md)

## Upstream and license

Cly preserves Dream's Git history and MIT license. `origin` is the private Cly repository; `upstream` is the public Dream repository. See [NOTICE.md](NOTICE.md) for attribution and [LICENSE](LICENSE) for license terms.

