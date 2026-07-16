# Cly Agent Configuration and Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver enforceable, project-scoped agent configuration and inspectable, revisioned context controls for CLY-42 and CLY-59.

**Architecture:** Cly Core owns durable configuration, scheduling, budgets, context revisions, and immutable transmission manifests. The renderer consumes typed project services and never grants itself permissions or changes an approved revision in place. Runtime contracts remain provider-neutral and deterministic mock implementations provide CI coverage.

**Tech Stack:** Electron, Hono, SQLite/Drizzle migrations, TypeScript/JavaScript, React, Zustand, Vitest, Playwright.

## Global Constraints

- Use deterministic local/mock fixtures; do not require paid APIs in CI.
- Concurrent agents cannot exceed configured budgets or bypass approval gates.
- Human-approved memory cannot be silently overwritten by inferred memory.
- Provider transmission warnings respect project privacy rules.
- All records and mutations are project-scoped and auditable.
- Reserve migration `0013_agent_configuration.sql` for CLY-42 and `0014_agent_context.sql` for CLY-59.
- Do not weaken the Cly-owned approval boundary with provider auto-accept settings.

---

### Task 1: CLY-42 — Enforceable agent/provider configuration

**Files:**
- Create: `electron/drizzle/0013_agent_configuration.sql`
- Create: `electron/api/agents/configuration-schema.js`
- Create: `electron/api/agents/configuration-repository.js`
- Create: `electron/api/agents/configuration-routes.js`
- Create: `electron/api/agents/scheduler.js`
- Create: `electron/api/agents/mock-provider.js`
- Create: `electron/api/agents/configuration-repository.test.ts`
- Create: `electron/api/agents/scheduler.test.ts`
- Modify: `electron/db/schema.ts`
- Modify: `electron/api/app.js`
- Modify: `src/features/cly/domain/types.ts`
- Modify: `src/features/cly/agent-sessions/types.ts`
- Modify: `src/features/cly/services/interfaces.ts`
- Modify: `src/features/cly/services/api-client.ts`
- Modify: `src/features/cly/services/project-services.ts`
- Modify: `src/features/cly/screens/system.tsx`
- Modify: `src/features/cly/agent-sessions/shared.tsx`
- Modify: `src/features/cly/store/cly-store.ts`
- Modify: `docs/cly-v1-capabilities.json`

**Interfaces:**
- Consumes: project identity from the existing project repository; provider/model catalogs from existing provider routes; approval binding concepts from `electron/api/tool-approvals.js`.
- Produces: `AgentConfiguration`, project-scoped CRUD, `AgentScheduler.run(configuration, provider, signal)`, and durable configuration hydration for CLY-59 and CLY-76.

- [ ] **Step 1: Add failing contract and repository tests**

Define the shared contract with numeric, enforceable values:

```ts
export type ReasoningLevel = "low" | "medium" | "high";

export interface AgentResourceBudget {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostMinorUnits: number;
  maxRuntimeMs: number;
}

export interface AgentRoleConfiguration {
  id: string;
  role: AgentRole;
  instanceCount: number;
  maxParallel: number;
  provider: string;
  model: string;
  reasoningLevel: ReasoningLevel;
  budget: AgentResourceBudget;
  allowedTools: string[];
  allowedContextSources: string[];
  allowedFileGlobs: string[];
  permissions: AgentPermissions;
  approvalCheckpoints: string[];
  fallbackModel?: string;
}

export interface AgentConfiguration {
  id: string;
  projectId: string;
  name: string;
  maxParallel: number;
  maxTotalBudget: AgentResourceBudget;
  partialFailurePolicy: "continue" | "cancel_remaining";
  roles: AgentRoleConfiguration[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}
```

Repository tests must prove project isolation, round-trip of every field, optimistic revision conflict, invalid `instanceCount < 1`, invalid `maxParallel > instanceCount`, and aggregate role parallelism above global maximum.

- [ ] **Step 2: Run repository tests to verify RED**

Run: `pnpm vitest run electron/api/agents/configuration-repository.test.ts`

Expected: FAIL because migration, schema validator, and repository do not exist.

- [ ] **Step 3: Implement migration, validator, and repository**

Create project-owned configuration and role tables with foreign keys, JSON columns for allowlists/permissions/checkpoints, integer budget columns, uniqueness on `(project_id, name)`, and a monotonic revision. Validate all writes before opening the transaction. Updates must use `WHERE id = ? AND project_id = ? AND revision = ?` and increment the revision atomically.

Repository surface:

```js
export function createAgentConfigurationRepository({ db }) {
  return {
    list(projectId),
    get(projectId, configurationId),
    create(projectId, input),
    update(projectId, configurationId, expectedRevision, input),
    remove(projectId, configurationId, expectedRevision),
  };
}
```

- [ ] **Step 4: Add scheduler RED tests**

Use a deterministic provider event script:

```js
const provider = createMockAgentProvider({
  scripts: {
    "implementation-1": [{ type: "usage", inputTokens: 20, outputTokens: 10, costMinorUnits: 3 }],
    "implementation-2": [{ type: "error", code: "PARTIAL_FAILURE" }],
  },
});
```

Tests must assert global and per-role caps, queued and active cancellation, partial failure under both policies, aggregate token/cost/runtime exhaustion, and that an action requiring approval remains blocked until a bound approval result is supplied.

- [ ] **Step 5: Run scheduler tests to verify RED**

Run: `pnpm vitest run electron/api/agents/scheduler.test.ts`

Expected: FAIL because scheduler and mock provider do not exist.

- [ ] **Step 6: Implement scheduler and deterministic mock provider**

The scheduler owns a single aggregate ledger and launches a role only when both semaphores and remaining budgets permit it:

```js
export function createAgentScheduler({ now = Date.now, requestApproval }) {
  return {
    async run(configuration, provider, signal) {
      // Return ordered worker results plus aggregate usage.
      // Abort queued and active workers on signal or exhausted budget.
      // Never execute an approval-gated action before requestApproval resolves approved.
    },
  };
}
```

Emit explicit `queued`, `started`, `usage`, `awaiting_approval`, `completed`, `failed`, `canceled`, and `budget_exhausted` events. Account usage before deciding whether another worker can start. Preserve partial results.

- [ ] **Step 7: Add routes and typed renderer services**

Register project-scoped endpoints:

```text
GET    /projects/:projectId/agent-configurations
POST   /projects/:projectId/agent-configurations
PUT    /projects/:projectId/agent-configurations/:configurationId
DELETE /projects/:projectId/agent-configurations/:configurationId
POST   /projects/:projectId/agent-configurations/:configurationId/estimate
```

The estimate response is `{ inputTokens, outputTokens, costMinorUnits, runtimeMs, inaccessibleContext, inaccessibleTools, reasons }`. Renderer services must accept project IDs, return typed configurations, and surface revision conflicts without local overwrite.

- [ ] **Step 8: Upgrade configuration UI and production hydration**

Add role instance count, role/global parallel caps, reasoning, numeric token/cost/runtime budgets, tools, context/file access, permissions, approval checkpoints, fallback, and partial failure policy. Show the estimate and explicit inaccessible-context/tool reasons before save. Remove the fixture-only disclaimer when production services are available. Production hydration must no longer clear configurations.

- [ ] **Step 9: Verify CLY-42**

Run:

```bash
pnpm vitest run electron/api/agents src/features/cly/agent-sessions src/features/cly/components/app-shell.test.tsx
pnpm typecheck
pnpm lint
pnpm capabilities:check
```

Expected: all pass with no new warnings. Mark `agents.configure` implemented only when the production route and renderer path are covered.

- [ ] **Step 10: Commit CLY-42**

```bash
git add electron/drizzle/0013_agent_configuration.sql electron/api/agents electron/db/schema.ts electron/api/app.js src/features/cly docs/cly-v1-capabilities.json
git commit -m "Complete CLY-42 agent configuration and budgets"
```

---

### Task 2: CLY-59 — Inspectable revisioned memory and context

**Files:**
- Create: `electron/drizzle/0014_agent_context.sql`
- Create: `electron/api/research/context-schema.js`
- Create: `electron/api/research/context-repository.js`
- Create: `electron/api/research/context-routes.js`
- Create: `electron/api/research/context-repository.test.ts`
- Create: `electron/api/research/context-routes.test.ts`
- Create: `src/features/cly/domain/agent-context.ts`
- Create: `src/features/cly/screens/context.test.tsx`
- Modify: `electron/db/schema.ts`
- Modify: `electron/api/research/routes.js`
- Modify: `electron/api/chat-routes.js`
- Modify: `src/features/cly/domain/types.ts`
- Modify: `src/features/cly/services/interfaces.ts`
- Modify: `src/features/cly/services/api-client.ts`
- Modify: `src/features/cly/services/project-services.ts`
- Modify: `src/features/cly/store/cly-store.ts`
- Modify: `src/features/cly/screens/context.tsx`
- Modify: `docs/cly-v1-capabilities.json`

**Interfaces:**
- Consumes: CLY-42 role IDs and allowed context/file sources; existing research object/source/conversation identities; project privacy obligations.
- Produces: revisioned context items, ordered packs, immutable outbound manifests, scoped provider warnings, and an exact manifest hash for CLY-76 and CLY-79.

- [ ] **Step 1: Add failing repository invariant tests**

Define explicit origin and lifecycle types:

```ts
export type ContextOriginClass = "approved_fact" | "inferred_fact" | "source_passage" | "file" | "conversation" | "graph_object";
export type VerificationState = "unverified" | "verified" | "stale" | "conflicted";

export interface AgentContextRevision {
  id: string;
  itemId: string;
  revision: number;
  originClass: ContextOriginClass;
  content: string;
  confidence: number | null;
  evidenceRefs: string[];
  lastCheckedAt: string | null;
  producerProcess: string;
  producerModel: string | null;
  verificationState: VerificationState;
  createdAt: string;
}

export interface ContextManifestEntry {
  kind: ContextOriginClass;
  referenceId: string;
  revisionId: string;
  representation: "raw" | "summary";
  tokenEstimate: number;
  selectionReason: string;
  sensitivity: "standard" | "restricted" | "local_only";
}
```

Tests must prove approved revisions are immutable, inferred revisions become proposals, locks reject mutation/deletion, delete/restore are auditable, stale/conflicted states persist, ordered pack entries round-trip, and cross-project references fail.

- [ ] **Step 2: Run repository tests to verify RED**

Run: `pnpm vitest run electron/api/research/context-repository.test.ts`

Expected: FAIL because migration and repository do not exist.

- [ ] **Step 3: Implement revisioned storage and lifecycle events**

Create item, revision, pack, pack-entry, manifest, manifest-entry, and audit-event tables. Store an approved revision pointer on the item; never update revision content. All state changes append an audit event containing actor, process/model, timestamp, and before/after revision IDs.

Repository surface:

```js
export function createContextRepository({ db, now = () => new Date().toISOString() }) {
  return {
    listItems(projectId),
    proposeRevision(projectId, itemId, input),
    approveRevision(projectId, itemId, revisionId, actor),
    setLifecycle(projectId, itemId, action, actor),
    savePack(projectId, input),
    previewManifest(projectId, input),
    persistManifest(projectId, input),
  };
}
```

- [ ] **Step 4: Add immutable manifest and privacy RED tests**

Assert canonical ordering, SHA-256 changes for any entry/representation/destination change, local-only entries are absent from provider payload by construction, restricted entries require a bound approval, and obligation warnings use exactly the selected research object IDs rather than an empty whole-project list.

- [ ] **Step 5: Implement manifest preview and scoped warnings**

Return:

```ts
export interface ContextManifestPreview {
  canonicalPayload: string;
  sha256: string;
  totalTokens: number;
  entries: ContextManifestEntry[];
  excluded: Array<{ referenceId: string; reason: string }>;
  privacyWarnings: Array<{ code: string; message: string; referenceIds: string[] }>;
}
```

The persisted manifest stores the exact canonical payload hash and destination provider/model. Provider execution must consume the persisted manifest, not regenerate a broader prompt from renderer input.

- [ ] **Step 6: Add routes, services, and renderer tests**

Expose project-scoped list/propose/approve/pin/lock/delete/restore/pack/preview/persist routes. Renderer tests must cover selection reasons, token total, stale/conflict badges, privacy warning, pin/lock/delete/restore actions, and a visible proposal when inference differs from approved memory.

- [ ] **Step 7: Upgrade production Context screen and hydration**

Replace toast-only actions with service calls. Separate approved facts, inferred facts, stale context, passages, files, conversations, and graph objects. Display origin, confidence, evidence, last checked time, process/model, verification, reason, token estimate, and transmission status. Production hydration must no longer clear context items or packs.

- [ ] **Step 8: Verify CLY-59**

Run:

```bash
pnpm vitest run electron/api/research/context-repository.test.ts electron/api/research/context-routes.test.ts src/features/cly/screens/context.test.tsx
pnpm vitest run electron/api/chat src/features/cly/services
pnpm typecheck
pnpm lint
pnpm capabilities:check
```

Expected: all pass; `context.edit` is marked implemented only after the production path and overwrite/privacy invariants pass.

- [ ] **Step 9: Commit CLY-59**

```bash
git add electron/drizzle/0014_agent_context.sql electron/api/research electron/api/chat-routes.js electron/db/schema.ts src/features/cly docs/cly-v1-capabilities.json
git commit -m "Complete CLY-59 inspectable context controls"
```
