# Cly Dev Durable Runtime and Cross-Device Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixture-backed Cly Dev with durable sessions, real approval-gated execution and workbench tools, versioned handoffs, encrypted device sync, and safe Git-backed cross-machine resume.

**Architecture:** An append-only project-scoped session repository is the local source of truth. Provider execution, tools, handoffs, sync, and resume are separate services that append idempotent events and consume immutable allowlisted manifests. Source moves through Git; synchronization transports only encrypted versioned handoff records.

**Tech Stack:** Electron/Hono, SQLite/Drizzle, Node crypto and OS credential abstraction, provider adapters, Git fixed-argv services, React, Vitest, Playwright Electron E2E.

## Global Constraints

- All records are project-scoped, append-safe, idempotent, versioned, and auditable.
- No tool action bypasses configured approval policy.
- Context preview shows exactly what leaves the device.
- Restricted/local-only fields are absent from handoff and sync records by construction.
- Source code moves through Git by default; uncommitted files are never silently synchronized.
- Deterministic mocks cover CI; paid provider access is never required.
- Reserve migrations: `0015_cly_dev_sessions.sql`, `0016_cly_dev_runtime.sql`, `0017_cly_dev_handoffs.sql`, `0018_cly_dev_devices.sql`.
- Execution order: CLY-75; CLY-76 and CLY-79 after CLY-42/59; CLY-77 after CLY-76; CLY-80 after CLY-79; CLY-81 last.

---

### Task 1: CLY-75 — Durable local session and event model

**Files:**
- Create: `electron/drizzle/0015_cly_dev_sessions.sql`
- Create: `electron/api/cly-dev/session-schema.js`
- Create: `electron/api/cly-dev/session-repository.js`
- Create: `electron/api/cly-dev/session-routes.js`
- Create: `electron/api/cly-dev/session-repository.test.ts`
- Create: `src/features/cly/agent-sessions/production-services.ts`
- Create: `src/features/cly/agent-sessions/production-services.test.ts`
- Modify: `electron/db/schema.ts`
- Modify: `electron/api/app.js`
- Modify: `electron/persisted-state.js`
- Modify: `electron/persisted-state.test.ts`
- Modify: `src/features/cly/agent-sessions/types.ts`
- Modify: `src/features/cly/agent-sessions/index.tsx`
- Modify: `src/features/cly/store/cly-store.ts`
- Modify: `src/features/cly/services/api-client.ts`
- Modify: `docs/cly-v1-capabilities.json`

**Interfaces:**
- Consumes: project/repository/worktree/machine/provider/research-object identities.
- Produces: `ClyDevSessionRepository`, ordered/idempotent event append, recovery snapshots, durable approvals/context/tool/test/diff/cost event payloads for every later task.

- [ ] **Step 1: Write RED tests for ordering, idempotency, isolation, and recovery**

```ts
export type ClyDevSessionState = "queued" | "running" | "awaiting_approval" | "completed" | "canceled" | "failed" | "interrupted" | "resumable";

export interface ClyDevEventInput {
  idempotencyKey: string;
  type: string;
  occurredAt: string;
  actor: { kind: "user" | "agent" | "tool" | "system"; id: string };
  payload: Record<string, unknown>;
}
```

Tests use two repository instances against the same SQLite file and assert unique `(session_id, sequence)`, unique `(session_id, idempotency_key)`, duplicate returns the existing event, concurrent appends preserve order, cross-project reads fail, approvals retain state after reopen, and startup converts `running` to `interrupted` then exposes `resumable` without reviving processes.

- [ ] **Step 2: Run RED tests**

Run: `pnpm vitest run electron/api/cly-dev/session-repository.test.ts`

- [ ] **Step 3: Implement migration and transactional repository**

Create workspaces, tasks, sessions, session events, projections, and durable approvals. Event append allocates the next sequence inside `BEGIN IMMEDIATE`, checks idempotency first, inserts once, and updates the projection in the same transaction.

```js
export function createClyDevSessionRepository({ db, now }) {
  return {
    createWorkspace(projectId, input),
    createTask(projectId, workspaceId, input),
    createSession(projectId, taskId, input),
    appendEvent(projectId, sessionId, event),
    listEvents(projectId, sessionId, afterSequence = 0),
    getSnapshot(projectId, sessionId),
    recoverInterruptedSessions(projectId),
  };
}
```

- [ ] **Step 4: Add routes and production renderer adapter**

Expose create/list/get/events/append/recover endpoints. Replace the production read-only preview with API hydration and mutation services while retaining fixtures only behind an explicit test/demo adapter unavailable in production mode.

- [ ] **Step 5: Verify and commit CLY-75**

```bash
pnpm vitest run electron/api/cly-dev/session-repository.test.ts electron/persisted-state.test.ts src/features/cly/agent-sessions/production-services.test.ts
pnpm typecheck && pnpm lint && pnpm capabilities:check
git add electron src/features/cly docs/cly-v1-capabilities.json
git commit -m "Complete CLY-75 durable Cly Dev sessions"
```

---

### Task 2: CLY-76 — Real provider execution and approval-gated tool runtime

**Files:**
- Create: `electron/drizzle/0016_cly_dev_runtime.sql`
- Create: `electron/api/cly-dev/provider-contract.js`
- Create: `electron/api/cly-dev/research-agent-service.js`
- Create: `electron/api/cly-dev/approval-policy.js`
- Create: `electron/api/cly-dev/context-manifest.js`
- Create: `electron/api/cly-dev/providers/mock-provider.js`
- Create: `electron/api/cly-dev/providers/codex-app-server.js`
- Create: `electron/api/cly-dev/runtime-routes.js`
- Create: `electron/api/cly-dev/provider-contract.test.ts`
- Modify: `electron/db/schema.ts`
- Modify: `electron/api/app.js`
- Modify: `electron/api/tool-approvals.js`
- Modify: `electron/api/chat-routes.js`
- Modify: `docs/cly-v1-capabilities.json`

**Interfaces:**
- Consumes: CLY-42 scheduler/budgets, CLY-59 persisted context manifest/hash, CLY-75 append/recovery repository.
- Produces: provider-neutral run lifecycle and idempotent approval-gated action execution for CLY-77/81.

- [ ] **Step 1: Write one contract suite for mock and real-adapter harness**

```ts
export interface ClyDevProviderAdapter {
  discoverCapabilities(): Promise<ProviderCapabilities>;
  authenticate(): Promise<AuthState>;
  execute(request: ProviderRunRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>;
  cancel(runId: string): Promise<void>;
}

export interface ResearchAgentService {
  prepareRun(input: PrepareRunInput): Promise<PreparedRun>;
  requestAction(runId: string, action: ToolAction): Promise<ActionDecision>;
  recordEvent(runId: string, event: ProviderEvent): Promise<void>;
  completeRun(runId: string, result: RunResult): Promise<void>;
}
```

Cover authentication absence/expiry, capabilities, streaming, usage, rate limit, budget exhaustion, cancel/retry/resume, partial tool failure, approval denial/expiry, cancellation after approval before action, and side effect completed before response without duplication.

- [ ] **Step 2: Implement exact outbound manifest and fail-closed approval policy**

The server loads the persisted CLY-59 manifest and verifies its SHA-256 before provider execution. Bind approval to `{projectId, runId, actionType, actionHash, contextHash, expiresAt}`. Classify file write, command/process, network, secret, Git, experiment, and research-record effects. Provider auto-accept cannot lower Cly policy.

- [ ] **Step 3: Implement deterministic mock and one production adapter**

Normalize the existing Codex app-server stream into contract events. Persist request, response event, tool request, approval, tool result, usage, cancellation, and failure via CLY-75. Record a side-effect idempotency key before execution and return a prior result on retry.

- [ ] **Step 4: Verify and commit CLY-76**

```bash
pnpm vitest run electron/api/cly-dev/provider-contract.test.ts electron/api/tool-approvals.test.ts electron/api/chat/provider-cancellation.test.ts
pnpm typecheck && pnpm lint && pnpm capabilities:check
git add electron docs/cly-v1-capabilities.json
git commit -m "Complete CLY-76 provider and tool runtime"
```

---

### Task 3: CLY-77 — Live files, diffs, terminal, tests, and logs

**Files:**
- Create: `electron/api/cly-dev/workbench-service.js`
- Create: `electron/api/cly-dev/workbench-routes.js`
- Create: `electron/api/cly-dev/file-observer.js`
- Create: `electron/api/cly-dev/test-runner.js`
- Create: `electron/api/cly-dev/workbench-service.test.ts`
- Modify: `electron/api/app.js`
- Modify: `electron/process-sessions.js`
- Modify: `electron/process-sessions.test.ts`
- Modify: `src/features/cly/agent-sessions/production-services.ts`
- Modify: `src/features/cly/agent-sessions/workbench.tsx`
- Modify: `docs/cly-v1-capabilities.json`

**Interfaces:**
- Consumes: CLY-75 durable events, CLY-76 approval/action grants, registered project roots, existing internal Git/file/process primitives.
- Produces: session-linked live file/diff/process/test/log identities for CLY-78 and durable resume metadata for CLY-81.

- [ ] **Step 1: Write service RED tests**

```ts
export interface WorkbenchCommandRequest {
  projectId: string;
  sessionId: string;
  runId: string;
  approvalGrantId: string;
  argv: string[];
  relativeCwd: string;
  maxOutputBytes: number;
}
```

Cover project isolation, symlink/path escape, external file change provenance, binary/1MB safeguards, bounded/truncated output, failed/canceled command, durable exit/log/test result, repository change outside Cly, and restart retaining results while marking live processes interrupted.

- [ ] **Step 2: Implement project/session boundary and durable process sink**

Resolve roots from project ID, never renderer paths. Use explicit argv adapters instead of arbitrary `shell:true`. Require the bound CLY-76 grant. Append start/output/truncated/exit/cancel/test/diff/external-change events through CLY-75.

- [ ] **Step 3: Replace fixture workbench services**

File, diff, terminal, test, and log controls call production routes and show stale/unavailable/unsupported/disconnected/binary/large-output states truthfully. Remove simulated production records and selectors.

- [ ] **Step 4: Verify and commit CLY-77**

```bash
pnpm vitest run electron/api/cly-dev/workbench-service.test.ts electron/process-sessions.test.ts electron/api/project-git/files.test.ts
pnpm playwright test tests/e2e/agent-sessions.spec.ts
pnpm typecheck && pnpm lint && pnpm capabilities:check
git add electron src/features/cly/agent-sessions docs/cly-v1-capabilities.json
git commit -m "Complete CLY-77 live Cly Dev workbench"
```

---

### Task 4: CLY-79 — Versioned handoff and sync protocol

**Files:**
- Create: `electron/drizzle/0017_cly_dev_handoffs.sql`
- Create: `electron/api/cly-dev/handoff-schema.js`
- Create: `electron/api/cly-dev/handoff-service.js`
- Create: `electron/api/cly-dev/handoff-routes.js`
- Create: `electron/api/cly-dev/handoff-service.test.ts`
- Create: `electron/api/cly-dev/fixtures/handoff/v0.json`
- Create: `electron/api/cly-dev/fixtures/handoff/v1.json`
- Modify: `electron/db/schema.ts`
- Modify: `electron/api/app.js`
- Modify: `src/features/cly/screens/platform-workspaces.tsx`

**Interfaces:**
- Consumes: CLY-59 context identities/privacy, CLY-75 session snapshots/events.
- Produces: allowlisted `ClyDevHandoffV1`, canonical SHA-256 integrity, redaction report, negotiation/migration, staleness/conflict report for CLY-80/81.

- [ ] **Step 1: Write golden RED tests**

```ts
export interface ClyDevHandoffV1 {
  schemaVersion: 1;
  handoffId: string;
  revision: number;
  project: { id: string; researchRevision: string };
  repository: { remoteFingerprint: string; branch: string; worktreeKind: "repository" | "linked"; commit: string };
  task: { goal: string; plan: unknown[]; progress: unknown[]; decisions: unknown[]; openQuestions: string[]; remainingWork: string[] };
  messages: unknown[];
  context: { manifestHash: string; entries: unknown[] };
  approvals: unknown[];
  permissions: unknown[];
  diffs: unknown[];
  tests: unknown[];
  failures: unknown[];
  costs: unknown[];
  researchImpact: unknown[];
  providerCapabilities: string[];
}
```

Round-trip actionable state, v0→v1 migration, canonical hash corruption, unsupported future version, restricted/local field rejection, redaction, provider capability downgrade, and Git/research/context staleness.

- [ ] **Step 2: Implement allowlist construction and negotiation**

Construct the DTO field-by-field; never serialize database rows wholesale. Absolute machine paths, credentials, secrets, terminal/process IDs, datasets, caches, raw file bodies, and uncommitted patches have no schema field. Verify integrity before migration/import and return explicit upgrade/export paths for unsupported versions.

- [ ] **Step 3: Implement export/import/preview UI**

Replace the static toast with synchronized/local-only preview, redaction list, integrity/version status, staleness/conflict explanation, and safe import decision.

- [ ] **Step 4: Verify and commit CLY-79**

```bash
pnpm vitest run electron/api/cly-dev/handoff-service.test.ts
pnpm typecheck && pnpm lint
git add electron src/features/cly/screens/platform-workspaces.tsx
git commit -m "Complete CLY-79 versioned Cly Dev handoffs"
```

---

### Task 5: CLY-80 — Encrypted device and chat/context synchronization

**Files:**
- Create: `electron/drizzle/0018_cly_dev_devices.sql`
- Create: `electron/api/cly-dev/credential-store.js`
- Create: `electron/api/cly-dev/device-repository.js`
- Create: `electron/api/cly-dev/sync-crypto.js`
- Create: `electron/api/cly-dev/sync-engine.js`
- Create: `electron/api/cly-dev/sync-transport.js`
- Create: `electron/api/cly-dev/sync-routes.js`
- Create: `electron/api/cly-dev/sync-engine.test.ts`
- Modify: `electron/db/schema.ts`
- Modify: `electron/api/app.js`
- Modify: `src/features/cly/screens/platform-workspaces.tsx`

**Interfaces:**
- Consumes: CLY-79 canonical allowlisted handoff envelopes.
- Produces: trusted/revoked devices, authenticated encrypted envelopes, durable outbox/inbox/acks/conflicts, audit-safe sync status for CLY-81.

- [ ] **Step 1: Write two-device RED tests**

Use deterministic in-memory credential stores and transport. Cover approved-field exchange, plaintext canary absent from relay and SQLite ciphertext records, device verification, rotation/expiry, revocation blocking new fetch, offline queue/retry/ack, resumable chunks, corruption, quota, partial failure, and explicit conflict for concurrent plan/context/approval/task changes.

- [ ] **Step 2: Implement crypto and key custody**

Private keys live only in the credential-store abstraction backed by the OS in production. SQLite stores public device identity, trust/revocation, key epochs, ciphertext, routing metadata, acknowledgements, conflicts, and non-content audit events. Use authenticated envelope encryption with associated data binding device IDs, key epoch, handoff ID, revision, and chunk identity.

- [ ] **Step 3: Implement sync engine and status UI**

Sync only the CLY-79 envelope. Use monotonic revisions, idempotency keys, durable outbox/inbox, explicit acks, backoff, offline state, and reviewable conflicts. UI shows last sync, pending/local-only/policy-blocked items, device trust, and actionable errors without content in audit logs.

- [ ] **Step 4: Verify and commit CLY-80**

```bash
pnpm vitest run electron/api/cly-dev/sync-engine.test.ts
pnpm typecheck && pnpm lint
git add electron src/features/cly/screens/platform-workspaces.tsx
git commit -m "Complete CLY-80 encrypted device sync"
```

---

### Task 6: CLY-81 — Safe Git-backed second-machine resume

**Files:**
- Create: `electron/api/cly-dev/repository-resume-service.js`
- Create: `electron/api/cly-dev/resume-routes.js`
- Create: `electron/api/cly-dev/repository-resume-service.test.ts`
- Create: `tests/e2e/cly-dev-cross-device.spec.ts`
- Modify: `electron/api/app.js`
- Modify: `src/features/cly/screens/platform-workspaces.tsx`

**Interfaces:**
- Consumes: CLY-76 provider/auth/runtime, CLY-77 workbench metadata, CLY-80 decrypted verified handoff and conflicts, fixed-argv Git core.
- Produces: repository/environment verification, safe recovery choices, and end-to-end A→B→A resume.

- [ ] **Step 1: Write RED tests for repository/environment classification**

```ts
export type ResumeAction = "fetch" | "create_branch" | "create_worktree" | "inspect_changes" | "defer" | "return_to_source_machine";

export interface ResumeAssessment {
  ready: boolean;
  mismatches: Array<{ code: string; message: string; blocking: boolean }>;
  actions: ResumeAction[];
}
```

Cover missing repo, explicit clone, remote fingerprint mismatch, missing commit, divergent branch, dirty worktree, submodule mismatch, missing tool, permission/environment difference, provider auth failure, revoked device, offline handoff, concurrent revision conflict, and proof that no file body/uncommitted patch is transported.

- [ ] **Step 2: Implement fixed Git resume coordinator**

Flow: decrypt/verify handoff; locate registered repository or explicit user-approved clone; verify canonical remote, full commit, branch/worktree, submodules, cleanliness, tools, permissions, environment, provider capability/auth; return safe actions; execute only a selected action through fixed argv and existing approval policy.

- [ ] **Step 3: Add cross-device E2E**

Use a temporary bare remote, two user-data databases/credential stores, deterministic transport, and mock provider. Cover normal machine A commit/push/handoff → machine B fetch/resume/continue/push → A updated state, plus missing repo, divergent branch, offline edits, revoked device, failed provider auth, and simultaneous edits producing conflict rather than last-write-wins.

- [ ] **Step 4: Run integrated verification**

```bash
pnpm vitest run electron/api/cly-dev
pnpm typecheck
pnpm lint
pnpm capabilities:check
pnpm test
pnpm playwright test tests/e2e/agent-sessions.spec.ts tests/e2e/cly-dev-windows.spec.ts tests/e2e/cly-dev-cross-device.spec.ts
pnpm package:dir
```

- [ ] **Step 5: Commit CLY-81**

```bash
git add electron src/features/cly/screens/platform-workspaces.tsx tests/e2e/cly-dev-cross-device.spec.ts
git commit -m "Complete CLY-81 cross-machine task resume"
```
