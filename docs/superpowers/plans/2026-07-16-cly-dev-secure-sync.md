# Cly Dev Secure Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register trusted devices and exchange approved Cly Dev chat, context, approval, and handoff records as end-to-end encrypted, resumable sync envelopes.

**Architecture:** SQLite remains the local source of truth. A main-process-only device vault holds X25519 and Ed25519 private keys through Electron `safeStorage`; SQLite stores public device records and ciphertext envelopes only. A relay-neutral sync service stages approved event projections, encrypts once per trusted recipient, verifies/decrypts incoming envelopes, detects divergent revisions, and exposes status/preview data through the existing loopback API.

**Tech Stack:** Node crypto (X25519, Ed25519, HKDF-SHA256, AES-256-GCM), Electron safeStorage, SQLite/Drizzle migrations, Hono, Zod, React, TypeScript, Vitest.

## Global Constraints

- Private device keys never enter SQLite, renderer state, logs, or API responses.
- Local-only event fields and absolute paths never enter an outbound envelope.
- Revoked devices cannot receive newly staged envelopes or import new state.
- Queue, retry, acknowledgement, conflict, and audit metadata contain no synchronized plaintext.
- All routes remain behind the existing loopback Host/Origin/session-token boundary.

---

### Task 1: Cryptographic device and envelope protocol

**Files:**
- Create: `electron/api/cly-dev/sync-crypto.js`
- Test: `electron/api/cly-dev/sync-crypto.test.ts`

**Interfaces:**
- Produces: `generateDeviceKeyMaterial()`, `deviceFingerprint(publicBundle)`, `encryptSyncEnvelope(input)`, `decryptSyncEnvelope(input)`, and `verifySyncEnvelope(input)`.
- Envelope metadata is authenticated associated data; payload bytes are AES-256-GCM ciphertext; each recipient receives an X25519/HKDF-wrapped content key; the complete envelope is Ed25519-signed.

- [ ] **Step 1: Write failing round-trip, tamper, wrong-recipient, and rotation tests**

```ts
const sender = generateDeviceKeyMaterial();
const receiver = generateDeviceKeyMaterial();
const envelope = encryptSyncEnvelope({ sender, recipients: [receiver.publicBundle], payload: { body: "secret" }, metadata });
expect(decryptSyncEnvelope({ envelope, recipient: receiver, sender: sender.publicBundle })).toEqual({ body: "secret" });
expect(() => decryptSyncEnvelope({ envelope: tampered(envelope), recipient: receiver, sender: sender.publicBundle })).toThrow(/signature|authentication/i);
```

- [ ] **Step 2: Run `pnpm vitest run electron/api/cly-dev/sync-crypto.test.ts` and verify the missing-module failure**
- [ ] **Step 3: Implement canonical serialization, key generation, fingerprinting, wrapping, signing, verification, and decryption**
- [ ] **Step 4: Re-run the focused test and verify all crypto protocol cases pass**

### Task 2: Durable registration, queue, acknowledgement, and conflict storage

**Files:**
- Create: `electron/drizzle/0016_cly_dev_secure_sync.sql`
- Modify: `electron/drizzle/meta/_journal.json`
- Modify: `electron/db/schema.ts`
- Create: `electron/api/cly-dev/sync-schema.js`
- Create: `electron/api/cly-dev/sync-repository.js`
- Test: `electron/api/cly-dev/sync-repository.test.ts`

**Interfaces:**
- Produces: `createClyDevSyncRepository({ db, now })` with device registration/trust/rotation/revocation, encrypted outbox/inbox, cursors, retry/ack, conflict resolution, and content-free audit methods.
- Consumes: signed envelope metadata from Task 1; no private key or plaintext payload is persisted.

- [ ] **Step 1: Add failing tests for registration verification, revocation, idempotent queueing, retry, quota, acknowledgement, concurrent revisions, and reopen durability**
- [ ] **Step 2: Run `pnpm vitest run electron/api/cly-dev/sync-repository.test.ts` and verify schema/repository failures**
- [ ] **Step 3: Add the migration, Drizzle schema, strict Zod request schemas, and transactional repository**
- [ ] **Step 4: Re-run repository and schema tests and verify all durable-state cases pass**

### Task 3: OS-backed key vault and sync orchestration

**Files:**
- Create: `electron/api/cly-dev/device-key-vault.js`
- Create: `electron/api/cly-dev/sync-service.js`
- Test: `electron/api/cly-dev/sync-service.test.ts`
- Modify: `electron/api/cly-dev/session-schema.js`
- Modify: `electron/api/cly-dev/session-repository.js`

**Interfaces:**
- Produces: `createClyDevSyncService({ repository, keyVault })` with `ensureLocalDevice`, `registerDevice`, `verifyDevice`, `rotateKeys`, `revokeDevice`, `preview`, `stage`, `exportBatch`, `importBatch`, `acknowledge`, and `resolveConflict`.
- Key vault contract: asynchronous `status()`, `get(ref)`, `put(ref, value)`, and `delete(ref)`; production uses Electron `safeStorage`, tests use `createMemoryDeviceKeyVault()`.

- [ ] **Step 1: Add failing two-device exchange tests for approved-field filtering, offline resume, expired key, corruption, quota, partial batch retry, revocation, and explicit conflict resolution**
- [ ] **Step 2: Run the focused service test and verify missing orchestration failures**
- [ ] **Step 3: Implement the safeStorage vault, transferable chat/handoff event schemas, envelope staging/import, cursor/retry rules, and conflict flow**
- [ ] **Step 4: Re-run service and existing session tests; verify local-only behavior remains unchanged**

### Task 4: Project-scoped sync API

**Files:**
- Create: `electron/api/cly-dev/sync-routes.js`
- Test: `electron/api/cly-dev/sync-routes.test.ts`
- Modify: `electron/api/app.js`

**Interfaces:**
- Produces authenticated project-scoped routes under `/api/projects/:projectId/cly-dev/sync/*` and device-management routes under `/api/cly-dev/devices/*`.
- Responses expose public keys, fingerprints, counts, timestamps, states, and ciphertext bundles only; never private keys or decrypted record bodies.

- [ ] **Step 1: Add failing route tests for validation, project isolation, status, pairing, stage/export/import/ack, revoke, and conflict resolution**
- [ ] **Step 2: Run focused route tests and verify 404/registration failures**
- [ ] **Step 3: Register strict Hono routes with bounded batches and normalized errors**
- [ ] **Step 4: Re-run route and API boundary tests and verify session-token/size controls still apply**

### Task 5: User-visible device and sync state

**Files:**
- Modify: `src/features/cly/agent-sessions/types.ts`
- Modify: `src/features/cly/services/api-client.ts`
- Create: `src/features/cly/agent-sessions/device-sync-panel.tsx`
- Test: `src/features/cly/agent-sessions/device-sync-panel.test.tsx`
- Modify: `src/features/cly/agent-sessions/index.tsx`
- Modify: `src/features/cly/cly.css`

**Interfaces:**
- Consumes: Task 4 status, device, staging, revocation, and conflict APIs.
- Produces: accessible sync preview with last sync, pending, local-only, policy-blocked, trusted/revoked devices, pairing verification, retry/error state, and explicit conflict choices.

- [ ] **Step 1: Add failing populated, empty, loading, error, pairing, revocation, and conflict UI tests**
- [ ] **Step 2: Run the focused component test and verify the missing panel failure**
- [ ] **Step 3: Implement the compact continuous-section panel using Cly primitives and tokenized responsive styles**
- [ ] **Step 4: Re-run component tests, typecheck, and production build**

### Task 6: Acceptance verification and documentation

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/LOCAL_SERVICE_SECURITY_MODEL.md`
- Modify: `README.md`

**Interfaces:**
- Documents: device trust boundary, relay threat model, approved synchronized fields, key rotation/revocation semantics, retry/conflict behavior, and remaining transport deployment responsibility.

- [ ] **Step 1: Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm vite:build`**
- [ ] **Step 2: Fix only regressions caused by this work and rerun the affected commands**
- [ ] **Step 3: Verify packaged production code contains no sync fixture records and audit rows contain no plaintext content**
