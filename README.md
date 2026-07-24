# Cly

**Cly is a connected platform for computational research and development.**

**Cly Research** is the system of record for computational research. **Cly Dev** is a local-first, multi-provider coding-agent workspace. **Cly Core** connects both applications through one research graph, context system, permission boundary, and provenance history.

Together they connect papers, objectives, code, experiments, outputs, and claims in one auditable workspace while preserving development context across agents, devices, and machines.

## What Cly answers

- What is the project trying to prove?
- Which evidence supports or contradicts each claim?
- Which code, notebook, data, environment, and run produced a result?
- Which decisions changed the project direction, and why?
- Which artifacts are stale, manually edited, or irreproducible?
- What should happen next?

## Architecture

```
Shared Cly Core (graph, context, permissions, sync, provenance)
    ├── Cly Research (objectives, evidence, experiments, claims, audits)
    └── Cly Dev (sessions, repositories, machines, tests, pull requests)
            ↓
External tools (VS Code, Jupyter, GitHub, Linear, model providers)
```

The coding workspace is currently powered by Dream IDE as an implementation component. The research core — graph, sources, claims, provenance, memory, and agent orchestration — is independent of the editor and will remain so.

## Status

Cly Free Beta includes a two-application Research/Dev shell, objective planning,
reviewer-capsule workflows, a local-first development command center, desktop
menus, keyboard navigation, automated workflows, and responsive research and
integrity workspaces. Project-scoped local services now persist core claim,
source, experiment, relationship, context, agent-configuration, and agent-session
workflows. A fresh local project can also import a numeric CSV/TSV dataset, run
deterministic cross-validated binary classification or regression, save metrics
and coefficients, generate a bounded result claim, audit the evidence trail,
recover it after restart, and export a project backup. The checked-in
[capability inventory](docs/cly-v1-capabilities.json)
is the release boundary; the UI labels unfinished routes as Preview and disables
unavailable mutations with an explanation. Agent Sessions includes durable local session events plus secure
device registration and end-to-end encrypted, resumable synchronization of
explicitly approved chat, context, and handoff records. Pairing requires
fingerprint verification; OS-protected device keys, rotation, revocation,
offline queues, acknowledgements, and explicit conflict resolution are built
into the local service. The sync protocol is transport-neutral and does not
yet ship with a hosted relay. The Overview and Orchestrator Chat workspace also
includes deterministic delegated-agent fixtures and a Browser, Terminal, Code
Diff, Agents, and Live Files preview. Notebook/code scanning, agent execution,
external integration configuration, planner mutations, and decision creation are
not included in the free beta.

The free beta is local-first and free of billing code, but it is not approved
for sensitive or regulated data. Export a project backup before testing. Local
beta testers can run Cly from source or use the unpacked development package;
public macOS distribution, signing, and notarization are a separate release
track.

## Ownership

Cly is proprietary software and is not distributed under an open-source
license. Copyright © 2026 Cly. All rights reserved. No permission is granted to
copy, modify, distribute, sublicense, or sell Cly's original source code.

Third-party components retain their own licenses. Cly includes code derived
from MIT-licensed Dream IDE; the attribution and license for that inherited
material are preserved in [NOTICE.md](NOTICE.md) and
[licenses/DREAM_IDE-MIT.txt](licenses/DREAM_IDE-MIT.txt).

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
pnpm capabilities:check
pnpm licenses:check
```

Professor demo:

```bash
pnpm demo
pnpm demo:video
```

See the [LDL-C blank-to-result walkthrough](docs/LDL_DISCORDANCE_DEMO.md).
For an independent beta run with a tester-supplied dataset, use the
[local beta testing guide](docs/BETA_TESTING.md).

## Documentation

### Product
- [Product plan](docs/product-plan.md)
- [Product background](docs/PRODUCT_BACKGROUND.md)
- [Roadmap](docs/roadmap.md)

### Architecture and design
- [Architecture](docs/architecture.md)
- [Domain model](docs/DOMAIN_MODEL.md)
- [Backend boundaries](docs/BACKEND_BOUNDARIES.md)
- [Local service security model](docs/LOCAL_SERVICE_SECURITY_MODEL.md)
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
