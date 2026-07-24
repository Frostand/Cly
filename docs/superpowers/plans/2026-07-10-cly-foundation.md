# Cly Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish Cly as a safely branded, independently released research IDE with enforceable quality controls, documented architecture, and a tested local research-object vertical slice.

**Architecture:** Preserve Dream's Electron/React shell and Git/agent infrastructure while isolating Cly-owned research capabilities behind typed domain and persistence modules. Use the existing local SQLite/Drizzle stack and API-server boundary; avoid a second database technology or broad upstream rewrites.

**Tech Stack:** Electron 41, React 19, TypeScript 6, Vite 8, Drizzle ORM, SQLite, Hono, Vitest, React Testing Library, Playwright, GitHub Actions.

## Global Constraints

- Product name is `Cly`; package and executable identifiers use lowercase `cly` where required.
- Preserve Dream IDE's MIT license as a scoped third-party notice and explicitly attribute `dreamide/dream` as the upstream foundation; do not license Cly's original code under it.
- Never publish to Dream's release repository or contact Dream's update feed from Cly builds.
- Keep `origin` as `Frostand/Cly` and `upstream` as `dreamide/dream`.
- Keep research data local-first; provider secrets must not be stored in SQLite or project files.
- Prefer additive extension points over invasive changes to Dream-owned core modules.

---

### Task 1: Product identity, release isolation, and project documentation

**Files:**
- Modify: `package.json`
- Modify: `electron/main.js`
- Modify: `electron/preload.js`
- Modify: `scripts/prepare-electron-dev-app.mjs`
- Replace: `README.md`
- Create: `docs/product-plan.md`
- Create: `docs/architecture.md`
- Create: `docs/roadmap.md`
- Create: `docs/upstream-sync.md`
- Create: `docs/adr/README.md`
- Create: `docs/adr/0001-local-first-relational-graph.md`
- Create: `NOTICE.md`

**Interfaces:**
- Produces: Cly application metadata, isolated release coordinates, documented product and architecture boundaries.

- [ ] Update package metadata to `cly`, `Cly`, `ai.cly.cly`, `Frostand/Cly`, and remove Dream update-feed defaults.
- [ ] Replace user-visible shell identifiers where they affect application identity, storage paths, or update behavior.
- [ ] Preserve `LICENSE`; add `NOTICE.md` with Dream attribution and upstream URL.
- [ ] Copy the approved product plan verbatim into `docs/product-plan.md`.
- [ ] Write architecture, roadmap, ADR, and upstream-sync documentation with exact build and merge commands.
- [ ] Run `pnpm lint`, `pnpm typecheck`, and `pnpm vite:build`; expect exit code 0.
- [ ] Commit as `chore: establish Cly product foundation`.

### Task 2: Repository governance, security policy, and baseline CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `.github/workflows/package-installers.yml`
- Create: `.github/dependabot.yml`
- Create: `.github/CODEOWNERS`
- Create: `.github/pull_request_template.md`
- Create: `.github/ISSUE_TEMPLATE/feature.yml`
- Create: `.github/ISSUE_TEMPLATE/bug.yml`
- Create: `.github/ISSUE_TEMPLATE/research-risk.yml`
- Create: `.github/ISSUE_TEMPLATE/architecture-decision.yml`
- Create: `SECURITY.md`
- Modify: `.gitignore`

**Interfaces:**
- Produces: required `quality` CI job, controlled packaging workflow, dependency updates, review ownership, and reporting policy.

- [ ] Add CI using Corepack/pnpm with frozen lockfile, lint, typecheck, unit tests, and renderer build.
- [ ] Ensure packaging publishes only to `Frostand/Cly` and runs by explicit dispatch or Cly tags.
- [ ] Configure weekly Dependabot updates for pnpm and GitHub Actions.
- [ ] Add CODEOWNERS and structured contribution templates.
- [ ] Add security rules for secrets, IPC, imported content, command approval, datasets, and disclosure.
- [ ] Extend ignores for research data, local artifacts, credentials, and environment files without hiding example configuration.
- [ ] Validate YAML and run the complete local quality suite.
- [ ] Commit as `ci: add Cly quality and governance controls`.

### Task 3: Test infrastructure and smoke coverage

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/lib/cly/identity.ts`
- Create: `src/lib/cly/identity.test.ts`
- Create: `playwright.config.ts`
- Create: `tests/e2e/app-smoke.spec.ts`

**Interfaces:**
- Produces: `pnpm test`, `pnpm test:watch`, and `pnpm test:e2e` commands; reusable Cly identity constants.

- [ ] Add Vitest, jsdom, React Testing Library, jest-dom, user-event, and Playwright test dependencies.
- [ ] Write a failing identity test asserting name, app ID, and repository coordinates.
- [ ] Implement frozen identity constants and make the unit test pass.
- [ ] Add a Playwright smoke test against the renderer dev server that verifies the Cly shell loads.
- [ ] Run `pnpm test --run`; expect all tests to pass.
- [ ] Run `pnpm lint`, `pnpm typecheck`, and `pnpm vite:build`; expect exit code 0.
- [ ] Commit as `test: establish Cly test infrastructure`.

### Task 4: Phase 0 technical assessment

**Files:**
- Create: `docs/phase-0/technical-assessment.md`
- Create: `docs/phase-0/extension-points.md`
- Create: `docs/phase-0/security-assessment.md`
- Create: `docs/phase-0/build-and-packaging.md`
- Create: `docs/phase-0/forking-and-upgrades.md`

**Interfaces:**
- Produces: evidence-linked `reuse / extend / replace` decisions for later implementation.

- [ ] Inspect Electron main/preload/renderer boundaries, API routes, DB schema, agent adapters, Git/terminal services, updater, packaging, and test coverage.
- [ ] Record concrete file references and current risks; do not claim unsupported extension APIs.
- [ ] Classify each major subsystem as reuse unchanged, extend behind an interface, or replace.
- [ ] Document Dream IDE's scoped MIT obligations, Cly's proprietary ownership, upstream release strategy, and packaging commands.
- [ ] Run a link/path scan over the reports and commit as `docs: complete Dream phase zero assessment`.

### Task 5: Research domain primitives and relational graph

**Files:**
- Modify: `electron/db/schema.ts`
- Create: `src/features/research/domain/research-object.ts`
- Create: `src/features/research/domain/relationship.ts`
- Create: `src/features/research/domain/provenance-event.ts`
- Create: `src/features/research/domain/research-types.ts`
- Create: `src/features/research/domain/research-domain.test.ts`
- Create: `electron/api/research/repository.ts`
- Create: `electron/api/research/repository.test.ts`
- Create: `electron/drizzle/0001_research_graph.sql`

**Interfaces:**
- Produces: `ResearchObject`, `Relationship`, `ProvenanceEvent`, `Artifact`, `Source`, `Claim`, `Experiment`, and `Run`; repository create/list/link operations.

- [ ] Write failing domain tests for valid object creation, typed payloads, relationship direction, and provenance timestamps.
- [ ] Implement discriminated TypeScript domain types and Zod validation.
- [ ] Add relational tables with project-scoped IDs, timestamps, indexes, and cascading relationship cleanup.
- [ ] Write failing repository tests using an isolated temporary SQLite database.
- [ ] Implement create/list/link repository operations and make tests pass.
- [ ] Run all unit, lint, typecheck, and build checks.
- [ ] Commit as `feat: add local research object graph`.

### Task 6: Source-to-claim vertical slice

**Files:**
- Create: `electron/api/research/routes.js`
- Modify: `electron/api-server.js`
- Create: `src/features/research/api/research-client.ts`
- Create: `src/features/research/components/research-panel.tsx`
- Create: `src/features/research/components/research-panel.test.tsx`
- Modify: `src/components/ide/workspace/side-nav.tsx`
- Modify: `src/components/ide/workspace/right-panel.tsx`

**Interfaces:**
- Consumes: repository create/list/link operations from Task 5.
- Produces: create-source, create-claim, link-evidence, and list-project-research HTTP endpoints and a persistent Research panel.

- [ ] Write failing route tests for schema validation, project isolation, and source-to-claim links.
- [ ] Implement narrowly scoped Hono routes that never accept arbitrary SQL or filesystem paths.
- [ ] Write a failing React test that creates a source, creates a claim, links them, and renders the evidence relation.
- [ ] Implement the typed client and accessible Research panel with explicit empty, loading, error, and success states.
- [ ] Wire the panel into the existing workspace navigation without restructuring unrelated Dream panels.
- [ ] Run unit tests, lint, typecheck, renderer build, and the smoke test.
- [ ] Commit as `feat: add source to claim research workflow`.

### Task 7: GitHub settings and Phase 0 issue set

**Files:**
- No local files.

**Interfaces:**
- Produces: protected `main`, enabled security features, and actionable Phase 0 GitHub issues.

- [ ] Push `codex/cly-foundation` before enabling required checks.
- [ ] Enable vulnerability alerts, automated security fixes, secret scanning where the account supports it, and private vulnerability reporting.
- [ ] Protect `main`: require pull requests, one approval, `quality` status check, conversation resolution, linear history, no force pushes, and no deletion.
- [ ] Create scoped issues for editor/extension architecture, persistence, agent providers, Git/terminal/IPC, updater/release, and build/test assessment follow-ups.
- [ ] Verify settings through the GitHub API and record unsupported plan-dependent controls.

### Task 8: Final verification and publication

**Files:**
- Modify: `docs/superpowers/plans/2026-07-10-cly-foundation.md` (mark completed steps)

**Interfaces:**
- Produces: a reviewable remote branch with a clean worktree and reproducible checks.

- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test --run`, `pnpm vite:build`, and the smoke test.
- [ ] Inspect `git diff origin/main...HEAD`, generated files, release coordinates, and all remaining `dreamide` references.
- [ ] Confirm remaining Dream references are attribution, upstream-sync, migration compatibility, or third-party provider identifiers.
- [ ] Push the feature branch and open a draft pull request with validation results and known limitations.
