# Cly Dev Runtime and Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a provider-neutral, approval-gated Cly Dev execution runtime and a versioned, persisted handoff protocol that can recreate actionable task state across providers and machines.

**Architecture:** Add two independent backend seams under `electron/api/cly-dev`: a runtime package that converts provider streams into durable session events while gating every tool effect, and a handoff package that derives a transferable snapshot from durable session state, validates/redacts/hashes it, persists exports/imports, negotiates versions, and reports staleness. Both packages use dependency injection so contract tests run deterministically without credentials, processes, or network access.

**Tech Stack:** Node.js ESM, Zod 4, SQLite/Drizzle migrations, Vitest, existing Cly Dev session repository and action-policy conventions.

## Global Constraints

- Every operation is project-scoped and fails closed when project, provider, capability, permission, approval, or version information is absent or unknown.
- No local credentials, terminals, processes, datasets, caches, absolute machine paths, environment values, or provider authentication material may enter a transferable handoff or provider context envelope.
- Provider context preview bytes and egress bytes must be byte-identical and protected by the same SHA-256 digest.
- Every request, provider event, tool call, approval, result, usage record, cancellation/recovery transition, and failure must be appendable to the existing durable Cly Dev session event model.
- Tool side effects must be idempotent by stable tool-call key; cancellation, retry, and resume must never execute an already-completed effect twice.
- Handoffs use an explicit integer schema version, canonical JSON integrity hashing, strict validation, safe unsupported-version errors, and migration fixtures.
- Tests must not require real credentials, external network access, or a mutable user repository.
- Parallel file ownership: Task 1 owns `electron/api/cly-dev/runtime/**`; Task 2 owns `electron/api/cly-dev/handoff/**` plus handoff-specific migration/schema registration files. Neither task edits the other task's owned directory.

---

### Task 1: CLY-76 provider execution and approval-gated tool runtime

**Files:**
- Create: `electron/api/cly-dev/runtime/provider-contract.js`
- Create: `electron/api/cly-dev/runtime/mock-provider.js`
- Create: `electron/api/cly-dev/runtime/production-provider.js`
- Create: `electron/api/cly-dev/runtime/approval-gate.js`
- Create: `electron/api/cly-dev/runtime/execution-runtime.js`
- Create: `electron/api/cly-dev/runtime/provider-contract.test.ts`
- Create: `electron/api/cly-dev/runtime/execution-runtime.test.ts`

**Interfaces:**
- Consumes: durable event appender compatible with `createClyDevSessionRepository().appendEvent(projectId, sessionId, event)`, `buildOutboundContext(projectId, sessionId)`, an abort signal, project policy, and an injected side-effect executor.
- Produces: `createClyDevProviderAdapter(definition)`, `createDeterministicMockProvider(script)`, `createProductionClyDevProvider(options)`, `createApprovalGate(options)`, and `createClyDevExecutionRuntime(options)`.

- [ ] **Step 1: Write provider-independent contract tests**

  Cover authentication status, model/capability discovery, deterministic streaming order, text/reasoning/tool-call/tool-result/usage/error terminal events, normalized absence/authentication/rate-limit/budget/cancellation errors, and cancellation. Run `pnpm vitest run electron/api/cly-dev/runtime/provider-contract.test.ts`; expect failure because runtime modules do not exist.

- [ ] **Step 2: Define the provider contract and deterministic mock**

  The adapter definition must expose the following stable surface (additional private helpers are allowed):

  ```js
  {
    id,
    async getAuthentication(),
    async listModels(),
    async getCapabilities(),
    async *stream(request, { signal }),
    async cancel(requestId),
    normalizeError(error)
  }
  ```

  Stream events must be discriminated by `type`; terminal outcomes are exactly one of `completed`, `failed`, or `canceled`. The mock accepts a scripted event array and never reads credentials, files, or network.

- [ ] **Step 3: Implement the production provider seam**

  Wrap an injected installed provider runner (the first production adapter should target the existing signed-in OpenAI/Codex execution path) behind the same contract. Capability discovery must state whether intercept-before-effect tool calls are supported; when it is false the runtime may only allow plan/read-only execution and must reject effectful tools before starting provider work.

- [ ] **Step 4: Write approval and durable execution tests**

  Cover exact preview/egress equality, permission categories for file write, command, network, secret, Git, experiment, and research-record changes; pending/approved/rejected/expired/mismatched approvals; durable event ordering; partial tool failure; cancel; retry/resume; provider absence; expired auth; rate limit; budget exhaustion; and idempotent tool effects. Run `pnpm vitest run electron/api/cly-dev/runtime/execution-runtime.test.ts`; expect failure before implementation.

- [ ] **Step 5: Implement the approval gate and runtime**

  `createApprovalGate` must classify every requested tool effect into a known category, enforce project/session/tool/arguments/context-hash/expiry scope, and return a typed allow/deny/pending decision. Unknown tools or categories deny. `createClyDevExecutionRuntime` must append request and context records before provider egress, append every provider/tool/approval/usage/failure event in order, execute a tool only after an allow decision, save the completed result under its stable tool-call key, and consult that result before retry/resume.

- [ ] **Step 6: Verify Task 1**

  Run `pnpm vitest run electron/api/cly-dev/runtime electron/api/cly-dev electron/api/agents`; expect all tests to pass with no unhandled rejections or warnings. Run `pnpm biome check electron/api/cly-dev/runtime`; expect a clean result.

### Task 2: CLY-79 versioned handoff and sync protocol

**Files:**
- Create: `electron/api/cly-dev/handoff/handoff-schema.js`
- Create: `electron/api/cly-dev/handoff/canonical-json.js`
- Create: `electron/api/cly-dev/handoff/handoff-service.js`
- Create: `electron/api/cly-dev/handoff/handoff-repository.js`
- Create: `electron/api/cly-dev/handoff/fixtures/*.json`
- Create: `electron/api/cly-dev/handoff/handoff-schema.test.ts`
- Create: `electron/api/cly-dev/handoff/handoff-service.test.ts`
- Modify only if persistence requires it: `electron/db/schema.ts`
- Create only if persistence requires it: `electron/drizzle/0016_cly_dev_handoffs.sql`
- Modify only if persistence requires it: `electron/drizzle/meta/_journal.json`

**Interfaces:**
- Consumes: existing Cly Dev workspace/task/session/context manifest/event/approval records, a current repository/research-state inspector, and SQLite.
- Produces: `clyDevHandoffEnvelopeSchema`, `canonicalJson(value)`, `hashHandoffPayload(value)`, `createClyDevHandoffService(options)`, and `createClyDevHandoffRepository({ db, now })`.

- [ ] **Step 1: Write schema and golden-fixture tests**

  Cover valid v1 records for messages, summaries, goal, plan, progress, decisions, open questions, remaining work, context manifest, repository identity, branch/worktree/commit, relevant files/symbols, approvals, permissions, constraints, diffs, tests, failures, costs, and research impact. Cover corruption, hash mismatch, restricted/local-only keys at any depth, unsupported future version, supported older-version migration, provider capability differences, and deterministic canonical JSON. Run `pnpm vitest run electron/api/cly-dev/handoff/handoff-schema.test.ts`; expect failure because handoff modules do not exist.

- [ ] **Step 2: Define the strict v1 envelope and canonical hashing**

  The exported envelope has this outer shape:

  ```js
  {
    protocol: "cly.dev.handoff",
    schemaVersion: 1,
    minimumReaderVersion: 1,
    exportedAt,
    payload,
    integrity: { algorithm: "sha256", canonicalization: "cly-json-v1", digest }
  }
  ```

  `payload` is structured task state, not an opaque conversation. Schemas are strict. A recursive restricted-key check rejects credential/token/secret values, terminal/process/cache/dataset fields, absolute paths, environment values, and raw provider configuration by construction. Hash only the canonical payload bytes and verify before migration/import.

- [ ] **Step 3: Write round-trip, staleness, conflict, and persistence tests**

  Export from a durable aggregate, import it, and assert the same actionable task state without raw conversation. Cover raw-conversation-disabled export, redaction, duplicate import idempotency, database reopen, changed commit/file/object hashes, changed research object versions, provider capability conflict, and explanations with safe recovery actions. Run `pnpm vitest run electron/api/cly-dev/handoff/handoff-service.test.ts`; expect failure before implementation.

- [ ] **Step 4: Implement export/import, version negotiation, migrations, and staleness detection**

  `createClyDevHandoffService` must expose `exportHandoff`, `inspectImport`, and `importHandoff`. `inspectImport` verifies protocol, reader compatibility, hash, schema/migration, redaction invariants, repository state, research state, and provider capabilities before persistence; it returns structured `compatible`, `stale`, and `conflicts` results with explanations. `importHandoff` refuses corrupt/unsupported/conflicted data, persists an idempotent import, and preserves enough structured state to resume even when raw messages are excluded.

- [ ] **Step 5: Implement durable handoff persistence**

  Persist project-scoped exports/imports, protocol/schema versions, canonical payload JSON, integrity digest, source repository/research fingerprints, inspection outcome, and timestamps. Do not persist local-only material. Enforce project isolation and uniqueness for import idempotency/integrity identity.

- [ ] **Step 6: Verify Task 2**

  Run `pnpm vitest run electron/api/cly-dev/handoff electron/api/cly-dev electron/db/schema.test.ts`; expect all tests and golden fixtures to pass. Run `pnpm biome check electron/api/cly-dev/handoff electron/db/schema.ts`; expect a clean result.

### CLY-79 production integration evidence

- Strict import authority: `importHandoff` always re-inspects the exact project/envelope; forged-compatible and different-envelope regressions are covered.
- Strict source research: production export uses a dedicated source inspector and refuses missing, duplicate, unversioned, or unhashed referenced objects.
- Restart-safe materialization: imports append idempotent structured summary/plan/progress/decision/remaining-work events and expose an exact project/session reverse link for the complete actionable payload, including open questions. Historical approvals remain evidence only and are not recreated.
- Upgrade path: immutable `0016_cly_dev_handoffs.sql` is restored byte-for-byte; additive `0018_cly_dev_handoff_materialization.sql` preserves already-recorded handoffs and adds the materialized-session reverse index after runtime migration `0017`.
- API authority: `createApiApp` registers handoff routes with distinct `clyDevHandoff` dependencies behind the existing Host/Origin/session-token/body/concurrency guards.
- Verification on 2026-07-16: focused integration set `108/108`; full Vitest suite `541/541`; `pnpm typecheck` passed; full Biome `490` files passed.
