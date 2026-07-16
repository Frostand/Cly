# Git-backed Cly Dev Cross-device Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resume a durable Cly Dev task on a paired second machine from Git plus a restricted, conflict-safe handoff envelope without transferring uncommitted source files.

**Architecture:** A provider-neutral handoff service publishes compare-and-swap envelopes containing only transferable session events and approved research context. A Git readiness inspector independently verifies the destination repository, remote, commit, branch/worktree, submodules, tools, permissions, and authentication before the service imports any state or allows execution.

**Tech Stack:** Node.js, SQLite-backed Cly Dev repositories, Zod, Git CLI, Hono routes, React, Vitest, Playwright Electron.

## Global Constraints

- Fetch source code through Git by default; never silently transfer uncommitted files.
- Restricted context and local-only manifest fields never enter a handoff envelope.
- Repository or environment mismatch blocks execution with actionable recovery guidance.
- Concurrent writers produce an explicit compare-and-swap conflict; never last-write-wins.
- A missing or revoked device and failed provider authentication fail closed.

---

### Task 1: Versioned handoff envelope and conflict-safe transport

**Files:**
- Create: `electron/api/cly-dev/handoff-schema.js`
- Create: `electron/api/cly-dev/handoff-service.js`
- Create: `electron/api/cly-dev/handoff-service.test.ts`

**Interfaces:**
- Consumes: `createClyDevSessionRepository`, its outbound context envelope, session snapshot, and ordered transferable events.
- Produces: `createClyDevHandoffService({ repository, transport, inspectDestination, now, id })`, `createMemoryHandoffTransport()`, and version-1 `ClyDevHandoffEnvelope` validation.

- [ ] **Step 1: Write failing envelope and conflict tests**

Test that `publish(projectId, sessionId, { expectedRevision })` omits local paths, environment names, notes, uncommitted paths, and local-only events; preserves conversation/plan/approval/diff-test/research metadata carried by transferable events; and returns `handoff-conflict` when the transport head differs from `expectedRevision`. Test revoked-device, offline, and authentication failures as named results.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `pnpm vitest run electron/api/cly-dev/handoff-service.test.ts`

Expected: FAIL because the handoff modules do not exist.

- [ ] **Step 3: Implement the schema and service**

Use this envelope boundary:

```js
{
  schemaVersion: 1,
  handoffId,
  projectId,
  sessionId,
  revision,
  previousRevision,
  sourceMachine: { id, platform },
  repository: { id, remoteUrl },
  worktree: { id, branch, baseRef },
  commit: { sha },
  task: { id, title, objective, researchObjectIds },
  session: { id, title, provider, state, createdAt, updatedAt },
  context: outboundContext.preview,
  events: transferableEvents,
  createdAt
}
```

Validate the complete object with strict Zod objects, deep-scan the serialized envelope for prohibited keys, and publish with `transport.compareAndSwap(handoffId, expectedRevision, envelope)`. `resume` must return a readiness result before it creates a destination aggregate.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `pnpm vitest run electron/api/cly-dev/handoff-service.test.ts`

Expected: PASS for safe publish, conflict, offline, revoked-device, and provider-authentication cases.

### Task 2: Git and environment readiness inspection

**Files:**
- Create: `electron/api/cly-dev/git-resume.js`
- Create: `electron/api/cly-dev/git-resume.test.ts`

**Interfaces:**
- Consumes: destination path and envelope repository/worktree/commit identity.
- Produces: `inspectGitResumeDestination(input, { runGit, pathExists, toolResolver })` returning `{ status, blocking, checks, actions }`.

- [ ] **Step 1: Write failing Git matrix tests**

Create temporary repositories and assert `ready`, `missing-repository`, `remote-mismatch`, `commit-missing`, `divergent-branch`, `uncommitted-work`, `submodule-mismatch`, `tool-missing`, `permission-denied`, and `offline` results. Every blocked result must expose only applicable actions from `fetch`, `clone`, `create-branch`, `create-worktree`, `inspect-changes`, `defer`, and `return-to-source`.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `pnpm vitest run electron/api/cly-dev/git-resume.test.ts`

Expected: FAIL because `git-resume.js` does not exist.

- [ ] **Step 3: Implement read-only inspection**

Run `rev-parse`, `remote get-url`, `status --porcelain=v2`, `cat-file -e <sha>^{commit}`, `branch --show-current`, `merge-base --is-ancestor`, and `submodule status --recursive` through an injected Git runner. Inspection never fetches, clones, switches, cleans, resets, or copies files. Normalize SSH/HTTPS GitHub remotes before comparison and keep raw command errors out of user-facing guidance.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `pnpm vitest run electron/api/cly-dev/git-resume.test.ts`

Expected: PASS for the complete readiness matrix.

### Task 3: Import, routes, and renderer recovery guidance

**Files:**
- Modify: `electron/api/cly-dev/session-repository.js`
- Create: `electron/api/cly-dev/handoff-routes.js`
- Modify: `electron/api/app.js`
- Modify: `src/features/cly/services/api-client.ts`
- Modify: `src/features/cly/agent-sessions/types.ts`
- Create: `src/features/cly/agent-sessions/resume-task-dialog.tsx`
- Modify: `src/features/cly/agent-sessions/index.tsx`
- Test: `electron/api/cly-dev/handoff-routes.test.ts`
- Test: `src/features/cly/agent-sessions/agent-sessions-components.test.tsx`

**Interfaces:**
- Consumes: handoff service readiness and the existing session aggregate/event APIs.
- Produces: pair, list, publish, inspect, and resume API methods plus an accessible recovery dialog.

- [ ] **Step 1: Write failing route and UI tests**

Assert authenticated routes return 409 for handoff conflict, 412 for repository/environment mismatch, 401 for failed provider authentication, 403 for revoked device, and 503 for offline transport. The dialog must show repository, remote, commit, branch/worktree, source machine, restricted-context notice, every failed check, and only the server-provided safe actions.

- [ ] **Step 2: Implement atomic destination import**

Add `importHandoff(projectId, envelope, destination)` to the session repository. In one `BEGIN IMMEDIATE` transaction, create destination-local workspace paths, preserve task/session/event IDs and idempotency keys, retain only transferable context, and reject an existing session whose handoff revision/head differs. Do not write source-machine paths or synthesize approval results.

- [ ] **Step 3: Implement routes and recovery UI**

Register `/api/cly-dev/devices/pair`, `/api/cly-dev/handoffs`, `/api/cly-dev/handoffs/:handoffId/inspect`, and `/api/cly-dev/handoffs/:handoffId/resume`. Use `Dialog`, `StatusIndicator`, continuous check rows, and one primary Resume action only when `blocking === false`; return focus to the originating session row when closed.

- [ ] **Step 4: Verify route and component coverage**

Run:

```bash
pnpm vitest run electron/api/cly-dev/handoff-routes.test.ts src/features/cly/agent-sessions/agent-sessions-components.test.tsx
pnpm typecheck
```

Expected: PASS with accessible error/recovery states and no execution path from a blocked readiness result.

### Task 4: Two-machine end-to-end matrix

**Files:**
- Create: `tests/e2e/cly-dev-cross-device.spec.ts`
- Modify: `docs/AGENT_SESSION_TESTING.md`

**Interfaces:**
- Consumes: two isolated SQLite user-data roots, two temporary Git clones, and the deterministic memory transport fixture.
- Produces: automated evidence for normal resume and every CLY-81 failure mode.

- [ ] **Step 1: Implement the two-machine scenario**

Create a bare remote plus machine-A and machine-B clones. Start a task on A, append transferable conversation/plan/context/approval/diff-test events, commit and push, publish the handoff, resume on B, append continued work, publish from B, and verify A observes the updated revision. Assert no uncommitted A-only file exists in B.

- [ ] **Step 2: Add the failure matrix**

Cover missing repository, divergent branch, offline transport, revoked destination device, failed provider authentication, uncommitted source work, and concurrent A/B compare-and-swap publication. Each must remain blocked until an explicit safe action changes external state.

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm vitest run electron/api/cly-dev
pnpm playwright test tests/e2e/cly-dev-cross-device.spec.ts
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all checks pass; the normal scenario resumes without restating completed work, and every unsafe case fails closed.
