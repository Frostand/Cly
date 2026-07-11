# Cly

Cly is a local-first research workspace that connects scientific sources, code, experiments, artifacts, decisions, and claims in one auditable system of record.

Cly owns the research process; researchers may use its built-in code workspace or keep working in VS Code, Cursor, Jupyter, terminals, and GitHub. Code editing is an integrated capability—not Cly's product identity.

## Status

Cly is in an architecture-transition phase. The current desktop shell and code-workspace components are transitional implementation assets while the standalone research core, local service, and external integrations are established. It is not ready for production research data.

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
- [Product plan](docs/product-plan.md)
- [Architecture decisions](docs/adr/README.md)

## License and historical attribution

Cly preserves applicable third-party notices and license obligations. The project is independently directed and is not maintained as an upstream IDE fork. See [NOTICE.md](NOTICE.md) and [LICENSE](LICENSE).
