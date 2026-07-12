# Local Repository Observation Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Associate a registered Cly project with its local Git repository and turn bounded, metadata-only repository scans into reviewable provenance events.

**Architecture:** Add a focused repository-observation adapter beside the existing research repository. The adapter resolves a project ID through persisted project registration, canonicalizes the stored root, runs only a fixed read-only Git command set, and appends project-scoped provenance through the repository; HTTP routes accept project IDs and bounded pagination only, never absolute paths, SQL, or commands.

**Tech Stack:** Electron main-process Node.js, Hono, `node:fs`, `node:child_process`, SQLite (`node:sqlite`), Zod, Vitest.

## Global Constraints

- Cly must remain connected to research work without becoming an IDE fork.
- Remote compute orchestration and unrestricted filesystem/command access are non-goals.
- Service APIs must not expose arbitrary SQL or arbitrary filesystem access.
- Repository observation is metadata-only and rooted at a registered, canonical project directory.
- Observed events contain project-relative paths and Git metadata, never file contents or credentials.

---

### Task 1: Project-scoped provenance repository

**Files:**
- Modify: `electron/api/research/repository.js`
- Modify: `electron/api/research/repository.test.ts`

**Interfaces:**
- Consumes: existing `projects` and `provenance_events` SQLite tables.
- Produces: `getProject(projectId)`, `appendProvenance(input)`, and `listProvenance(projectId, { limit })` repository methods.

- [x] **Step 1: Write failing repository tests**

Add tests that fetch a registered project, append a `repository.change.observed` event with `actorType: "system"`, list it newest-first, enforce the requested limit, and reject an unknown project.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run electron/api/research/repository.test.ts`
Expected: FAIL because the three methods are not defined.

- [x] **Step 3: Implement validated repository methods**

Add Zod schemas for provenance append inputs and bounded list options. Map database rows to `{ id, projectId, objectId, action, actorType, actorId, metadata, createdAt }`, and keep SQL statements fixed and parameterized.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run electron/api/research/repository.test.ts`
Expected: PASS.

### Task 2: Fixed Git observation adapter and HTTP contract

**Files:**
- Create: `electron/api/research/repository-observer.js`
- Create: `electron/api/research/repository-observer.test.ts`
- Modify: `electron/api/research/routes.js`
- Modify: `electron/local-service-smoke.test.ts`

**Interfaces:**
- Consumes: `getProject(projectId)` and `appendProvenance(input)` from Task 1.
- Produces: `createRepositoryObserver(repository, options).scan(projectId)`, `POST /api/projects/:projectId/repository-observations`, and `GET /api/projects/:projectId/provenance?limit=100`.

- [x] **Step 1: Write failing adapter tests**

Create a temporary Git repository, register its canonical path, modify a tracked file and add an untracked file, then assert that `scan(projectId)` returns project-relative status records and appends project-owned provenance. Add rejection cases for a non-canonical registered path, a project root that is not the Git top level, and bounded Git output.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run electron/api/research/repository-observer.test.ts`
Expected: FAIL because the observer module does not exist.

- [x] **Step 3: Implement the minimal bounded adapter**

Resolve only the stored project root with `realpath`, require it to equal the Git top-level path, and execute fixed `git` argument arrays with hooks, pagers, optional locks, and credential prompts disabled. Parse porcelain `-z` status into `{ path, indexStatus, worktreeStatus, originalPath? }`, reject absolute/escaping paths, cap output, and append one aggregate scan event plus one event per observed change.

- [x] **Step 4: Add narrow routes and smoke coverage**

Register a bodyless scan endpoint and a provenance listing endpoint whose only caller-controlled query is a Zod-coerced integer limit from 1 through 500. Extend the local-service smoke test to scan a registered temporary repository and retrieve the resulting reviewable events after restart.

- [x] **Step 5: Run focused tests**

Run: `pnpm vitest run electron/api/research/repository.test.ts electron/api/research/repository-observer.test.ts electron/local-service-smoke.test.ts`
Expected: PASS.

### Task 3: Local-service boundary documentation and full verification

**Files:**
- Create: `docs/LOCAL_SERVICE_BOUNDARY.md`
- Modify: `docs/BACKEND_BOUNDARIES.md`
- Modify: `docs/LOCAL_SERVICE_SECURITY_MODEL.md`

**Interfaces:**
- Consumes: the implemented observation/provenance contract from Tasks 1 and 2.
- Produces: an architectural boundary covering project identity, filesystem/Git observation, experiment/run capture, artifact indexing, context retrieval, permission-gated execution, provenance, and prohibited API shapes.

- [x] **Step 1: Document ownership and API allowlist**

Define each service capability, its project-scoping rule, allowed inputs and outputs, permission class, persistence owner, and provenance action family. State explicitly that the service has no arbitrary path, command, environment, credential, or SQL endpoint and distinguish compatibility IDE routes from the research-service boundary.

- [x] **Step 2: Document lifecycle and local-data limits**

Describe project registration, canonical-root revalidation, observation sessions, run/artifact/context identity, approvals, shutdown, retention/export/delete behavior, and the boundary between SQLite metadata and filesystem content.

- [x] **Step 3: Link the security and backend documents**

Point the existing boundary and security model at the normative service contract, and mark the implemented repository observation slice versus future permission-gated capabilities.

- [x] **Step 4: Run complete verification**

Run: `pnpm typecheck && pnpm vitest run electron/api/research/repository.test.ts electron/api/research/repository-observer.test.ts electron/local-service-smoke.test.ts && pnpm biome check electron/api/research/repository.js electron/api/research/repository.test.ts electron/api/research/repository-observer.js electron/api/research/repository-observer.test.ts electron/api/research/routes.js electron/local-service-smoke.test.ts docs/LOCAL_SERVICE_BOUNDARY.md docs/BACKEND_BOUNDARIES.md docs/LOCAL_SERVICE_SECURITY_MODEL.md`
Expected: all commands PASS.
