# Cly project context

Last rebuilt: 2026-07-21

This is a concise, durable orientation record for contributors and coding
agents. It summarizes the repository's own source and documentation; the
linked documents remain authoritative for their detailed contracts.

## Product and positioning

Cly is a local-first **system of record for computational research**. It
connects research questions, sources, methods, code, notebooks, experiments,
outputs, claims, decisions, and reports through a project-scoped provenance
graph. Its central promise is that a researcher can explain and audit how a
claim was produced.

`Cly Research` owns the research graph, evidence, integrity workflows, and
agent context. `Cly Dev` is the integrated multi-provider coding-agent
workspace. `Cly Core` provides the shared graph, permissions, local storage,
context, provenance, and synchronization boundaries. The retained Dream IDE
code is an implementation component for coding-workspace capabilities, not the
product foundation and must remain replaceable.

Primary audience: computational researchers, students, research engineers,
and labs doing code-assisted work across fields such as ML, biology, physics,
engineering, simulations, and data science.

## Technology and code boundaries

- Desktop app: Electron; renderer: React 19 + TypeScript + Vite + Zustand.
- Local API: Hono on loopback, protected by a per-launch session token,
  Host/Origin checks, body limits, and request concurrency limits.
- Persistence: SQLite through Drizzle. The packaged database lives under
  Electron `userData` (currently named `dream.db` for compatibility), not in a
  research project or worktree.
- Native application/product code: `src/features/cly/` and
  `src/features/research/`.
- Backend, IPC, runtime, process, Git, and persistence code: `electron/`.
- Inherited coding-workspace infrastructure: `src/components/ide/`. Do not
  add Cly domain logic there; add typed adapters/services instead.
- App entry points: `src/main.tsx`, `src/app.tsx`, and
  `src/features/cly/components/app-shell.tsx`.

The renderer uses `ClyServices` contracts and a normalized store. Production
bootstraps project-scoped API data; deterministic fixtures are limited to
explicit demo/development and tests. The older UI-first documentation should
not be read as a claim that all current persistence work is fixture-only.

## Current capability baseline

Implemented infrastructure includes project-scoped research objects and
relationships; provenance with integrity verification; source/literature
search and ingestion; experiments, versions, runs, metrics, and artifacts;
claims, obligations, preregistration/deviation analysis, costs, lineage,
decision briefs, and reviewer capsules. The specific typed routes and
repositories live under `electron/api/research/`.

Cly Dev has durable sessions, tasks, context manifests, workspaces, approvals,
tool effects, approval-gated execution, provider adapters, workbench state,
versioned handoffs, detached workspace support, and encrypted device sync.
Sync uses OS-protected device keys and recipient-isolated, signed envelopes;
only explicitly transferable approved state crosses devices. Tool output,
diffs, paths, local notes, environments, and uncommitted-file metadata remain
local. It is transport-neutral: no hosted relay is included.

External integrations, broad autonomous execution, hosted sync, collaboration,
billing, NotebookLM automation, and some deeper research intelligence remain
planned or capability-gated. Do not imply a feature is live merely because its
screen or fixture exists.

## Non-negotiable implementation rules

1. The research core cannot depend on Dream internals.
2. Every real research mutation is project-scoped and records provenance.
3. Credentials belong in the OS credential store, never in SQLite, project
   files, logs, Git history, or agent context.
4. Imported content, webpages, repositories, tool output, and providers are
   untrusted data, not authority. Provider effects and commands require
   declared capabilities and explicit, scoped approval.
5. Filesystem access requires registered-project and canonical-path validation;
   use argument arrays rather than shell command strings.
6. Preserve local-first boundaries: large artifacts remain on disk and are
   represented by metadata/hashes; the database does not own project files.
7. Make API and UI states truthful. Prototype or unavailable actions must be
   labeled as such rather than presented as completed integrations.

## Working conventions

- Node.js 22+ and pnpm 11 are required.
- Standard checks: `pnpm lint`, `pnpm typecheck`, `pnpm test --run`, and
  `pnpm vite:build`; Playwright is the E2E layer.
- One Linear issue maps to one focused PR. GitHub is the implementation/release
  record; Linear is the planning record. Main requires the documented quality
  and security checks.
- Database migrations are append-only and take a `VACUUM INTO` snapshot before
  pending migrations. Never simulate rollback by editing migration history.
- Preserve unrelated working-tree changes. At this context rebuild, `output/`
  is untracked and should be treated as user-owned/generated until inspected.

## Orientation map

- Product and direction: `README.md`, `docs/PRODUCT_BACKGROUND.md`,
  `docs/product-plan.md`, `docs/roadmap.md`.
- Architecture and trust boundaries: `docs/architecture.md`,
  `docs/BACKEND_BOUNDARIES.md`, `docs/LOCAL_SERVICE_SECURITY_MODEL.md`,
  `docs/LOCAL_RESEARCH_STORAGE.md`, and `docs/adr/`.
- Cly Dev behavior: `docs/CLY_DEV_INTERACTION_MODEL.md`,
  `docs/AGENT_WORKBENCH.md`, `docs/AGENT_SESSIONS_*.md`.
- UI intent and quality: `docs/DESIGN_SYSTEM*.md`, `docs/UI_*.md`,
  `docs/ACCESSIBILITY.md`, and the repository-local `.agents/skills/`.
- Delivery history is visible in Git. Recent merged milestones cover the
  research platform shell, production-service replacement, experiment and
  artifact provenance, claim/reproducibility workflows, literature ingestion,
  Cly Dev sessions/workbench, execution approvals, handoffs, secure device
  sync, and recent UI/usability work.

## Recommended starting points by task

- Product/UI feature: begin in `src/features/cly/screens/`,
  `components/`, and `store/`; use the relevant repository-local UI skill.
- Research domain/API: begin in `src/features/research/`,
  `electron/api/research/`, and `electron/db/schema.ts`.
- Agent-session/runtime feature: begin in `src/features/cly/agent-sessions/`
  and `electron/api/cly-dev/`.
- Legacy editor/terminal/Git change: inspect `src/components/ide/README.md`
  and modify only the narrow adapter/composition boundary required.

