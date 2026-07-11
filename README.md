# Cly

Cly is a local-first research workspace that connects scientific sources, code, experiments, artifacts, decisions, and claims in one auditable system of record.

Cly owns the research process; researchers keep working in VS Code, Cursor, Jupyter, terminals, and GitHub. Cly integrates with those tools, but does not include or maintain an IDE.

## Status

Cly is in an architecture-transition phase. This repository now contains the standalone research-core contracts and product plan; the local service and external integrations will be built on those boundaries. It is not ready for production research data.

## Development

Requirements: Node.js 22 or newer and pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm test
```

Quality checks:

```bash
pnpm typecheck
pnpm test
```

## Documentation

- [Product plan](docs/product-plan.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Product plan](docs/product-plan.md)
- [Architecture decisions](docs/adr/README.md)

## License and historical attribution

Cly preserves applicable third-party notices and license obligations. The project is independently directed and is not maintained as an upstream IDE fork. See [NOTICE.md](NOTICE.md) and [LICENSE](LICENSE).
