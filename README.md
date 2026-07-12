# Cly

**Cly is the system of record for computational research.**

It connects papers, code, experiments, outputs, and claims in one auditable workspace. Researchers plan objectives, manage sources and literature, track experiments, record claims and evidence, and audit reproducibility — all with AI agents working alongside them.

Cly is a standalone research platform, not an IDE. It includes an integrated coding environment for computational work and integrates with external editors (VS Code, Cursor, Jupyter) through extensions and APIs.

## What Cly answers

- What is the project trying to prove?
- Which evidence supports or contradicts each claim?
- Which code, notebook, data, environment, and run produced a result?
- Which decisions changed the project direction, and why?
- Which artifacts are stale, manually edited, or irreproducible?
- What should happen next?

## Architecture

```
Cly Core (research graph, sources, claims, provenance, agents)
    ↓
Cly Desktop App (dashboard, literature, experiments, audits)
    ↓
Coding Workspace (editor, terminal, git, notebooks)
    ↓
External Integrations (VS Code, Jupyter, GitHub, CLI)
```

The coding workspace is currently powered by Dream IDE as an implementation component. The research core — graph, sources, claims, provenance, memory, and agent orchestration — is independent of the editor and will remain so.

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

Requirements: Node.js 22 or newer and pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm approve-builds     # approve electron, node-pty, esbuild, sharp builds
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

### Product
- [Product plan](docs/product-plan.md)
- [Product background](docs/PRODUCT_BACKGROUND.md)
- [Roadmap](docs/roadmap.md)

### Architecture and design
- [Architecture](docs/architecture.md)
- [Domain model](docs/DOMAIN_MODEL.md)
- [Backend boundaries](docs/BACKEND_BOUNDARIES.md)
- [Design system](docs/DESIGN_SYSTEM.md)

### UI
- [UI shell completion report](docs/UI_SHELL_COMPLETION_REPORT.md)
- [UI map](docs/UI_MAP.md)
- [Feature matrix](docs/FEATURE_MATRIX.md)
- [Information architecture](docs/INFORMATION_ARCHITECTURE.md)
- [Interaction specification](docs/INTERACTION_SPEC.md)
- [Keyboard shortcuts](docs/KEYBOARD_SHORTCUTS.md)
- [Fixture states](docs/FIXTURE_STATES.md)
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

### Planning
- [Phase 2 backend plan](docs/PHASE_2_BACKEND_PLAN.md)
- [Architecture decisions](docs/adr/README.md)

### Infrastructure
- [Dream UI audit](docs/DREAM_UI_AUDIT.md) (current implementation component)
- [Phase 0 assessment](docs/phase-0/)
- [Delivery workflow](docs/DELIVERY_WORKFLOW.md)

## License

MIT. See [LICENSE](LICENSE) for terms and [NOTICE.md](NOTICE.md) for attribution.
