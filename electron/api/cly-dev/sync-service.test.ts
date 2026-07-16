// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../persisted-state.js";
import { createMemoryDeviceKeyVault } from "./device-key-vault.js";
import { createClyDevSessionRepository } from "./session-repository.js";
import { encryptSyncEnvelope } from "./sync-crypto.js";
import { createClyDevSyncRepository } from "./sync-repository.js";
import { createClyDevSyncService } from "./sync-service.js";

const openedPaths: string[] = [];
const databases: DatabaseSync[] = [];

function setup(
  label: string,
  options: Partial<Parameters<typeof createClyDevSyncService>[0]> = {},
) {
  const databasePath = path.join(
    mkdtempSync(path.join(tmpdir(), `cly-sync-${label}-`)),
    "state.sqlite",
  );
  openedPaths.push(databasePath);
  getStateDatabase(databasePath);
  closePersistedStateDatabase();
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  databases.push(db);
  db.prepare(
    `INSERT INTO projects
      (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
     VALUES ('project-a', ?, ?, ?, 'open', 0, '{}', ?, ?)`,
  ).run(
    `/tmp/${label}`,
    `/tmp/${label}`,
    label,
    "2026-07-16T12:00:00.000Z",
    "2026-07-16T12:00:00.000Z",
  );
  const syncRepository = createClyDevSyncRepository({ db });
  const sessionRepository = createClyDevSessionRepository({ db });
  const service = createClyDevSyncService({
    repository: syncRepository,
    sessionRepository,
    keyVault: createMemoryDeviceKeyVault(),
    now: () => "2026-07-16T12:00:00.000Z",
    ...options,
  });
  return { databasePath, db, syncRepository, sessionRepository, service };
}

function seedSession(
  repository: ReturnType<typeof createClyDevSessionRepository>,
) {
  const aggregate = repository.createSessionAggregate("project-a", {
    workspace: {
      schemaVersion: 1,
      idempotencyKey: "workspace-key",
      id: "workspace-1",
      name: "Main",
      repository: { id: "repo-1" },
      worktree: { id: "worktree-1", branch: "main" },
      machine: { id: "machine-a", platform: "darwin" },
      localOnly: { repositoryPath: "/tmp/a", worktreePath: "/tmp/a" },
    },
    contextManifest: {
      schemaVersion: 1,
      idempotencyKey: "context-key",
      id: "context-1",
      localOnly: {
        absolutePaths: ["/tmp/a/private"],
        environmentVariableNames: ["SECRET_TOKEN"],
        notes: ["local note"],
        uncommittedFilePaths: ["private.txt"],
      },
      transferable: { summary: "Approved context", entries: [] },
    },
    task: {
      schemaVersion: 1,
      idempotencyKey: "task-key",
      id: "task-1",
      title: "Task",
      objective: "Continue on another device",
      researchObjectIds: [],
    },
    session: {
      schemaVersion: 1,
      idempotencyKey: "session-key",
      id: "session-1",
      title: "Session",
      provider: { id: "openai", model: "gpt-5" },
      commit: { sha: "a".repeat(40) },
      state: "running",
    },
  });
  const base = {
    schemaVersion: 1 as const,
    payloadVersion: 1 as const,
    occurredAt: "2026-07-16T12:00:00.000Z",
    actor: { kind: "user" as const, id: "local-user" },
  };
  repository.appendEvent("project-a", aggregate.session.id, {
    ...base,
    idempotencyKey: "local-message",
    type: "message.recorded",
    transferability: "local-only",
    payload: { role: "user", body: "Never sync this message" },
  });
  repository.appendEvent("project-a", aggregate.session.id, {
    ...base,
    idempotencyKey: "shared-message",
    type: "message.recorded",
    transferability: "transferable",
    payload: { role: "user", body: "Approved handoff message" },
  });
  repository.appendEvent("project-a", aggregate.session.id, {
    ...base,
    idempotencyKey: "shared-context",
    type: "context.manifest.recorded",
    transferability: "transferable",
    payload: { manifestId: "context-1" },
  });
  return aggregate;
}

afterEach(() => {
  closePersistedStateDatabase();
  for (const database of databases.splice(0)) database.close();
});

describe("Cly Dev sync service", () => {
  it("exchanges only approved chat and context fields between verified devices", async () => {
    const a = setup("device-a");
    const b = setup("device-b");
    const localA = await a.service.ensureLocalDevice("Research Mac");
    const localB = await b.service.ensureLocalDevice("Lab workstation");
    await a.service.registerDevice({
      id: localB.id,
      name: localB.name,
      publicBundle: localB.publicBundle,
    });
    await b.service.registerDevice({
      id: localA.id,
      name: localA.name,
      publicBundle: localA.publicBundle,
    });
    await a.service.verifyDevice(localB.id, localB.fingerprint);
    await b.service.verifyDevice(localA.id, localA.fingerprint);
    seedSession(a.sessionRepository);

    const preview = await a.service.preview("project-a");
    expect(preview).toMatchObject({
      approvedChanges: 2,
      localOnlyItems: 1,
      trustedDeviceCount: 1,
    });
    const staged = await a.service.stage("project-a");
    expect(staged.queued).toBe(2);
    const batch = await a.service.exportBatch("project-a", localB.id, {
      maxRecords: 10,
      maxBytes: 200_000,
    });
    expect(JSON.stringify(batch)).not.toContain("Approved handoff message");
    expect(JSON.stringify(batch)).not.toContain("Never sync this message");
    expect(JSON.stringify(batch)).not.toContain("SECRET_TOKEN");

    const imported = await b.service.importBatch(
      "project-a",
      batch.items.map((item) => item.envelope),
    );
    expect(imported.applied).toBe(2);
    const records = await Promise.all(
      batch.items.map((item) =>
        b.service.readAppliedRecord("project-a", item.envelopeId),
      ),
    );
    expect(JSON.stringify(records)).toContain("Approved handoff message");
    expect(JSON.stringify(records)).toContain("Approved context");
    expect(JSON.stringify(records)).not.toContain("Never sync this message");
    expect(JSON.stringify(records)).not.toContain("/tmp/a/private");
  });

  it("isolates every durable envelope to its intended recipient", async () => {
    const a = setup("sender");
    const b = setup("recipient-b");
    const c = setup("recipient-c");
    const localB = await b.service.ensureLocalDevice("Lab workstation");
    const localC = await c.service.ensureLocalDevice("Travel Mac");
    await a.service.registerAndVerifyDevice(localB, localB.fingerprint);
    await a.service.registerAndVerifyDevice(localC, localC.fingerprint);
    seedSession(a.sessionRepository);

    await expect(a.service.stage("project-a")).resolves.toMatchObject({
      queued: 4,
    });
    const batch = await a.service.exportBatch("project-a", localB.id, {
      maxRecords: 10,
      maxBytes: 200_000,
    });

    expect(batch.items).toHaveLength(2);
    expect(
      batch.items.every(
        (item) =>
          item.envelope.recipients.length === 1 &&
          item.envelope.recipients[0].deviceId === localB.id,
      ),
    ).toBe(true);
    expect(JSON.stringify(batch)).not.toContain(localC.id);
  });

  it("does not re-encrypt records already present in the durable outbox", async () => {
    let encryptions = 0;
    const sender = setup("idempotent-sender", {
      encryptEnvelope(input) {
        encryptions += 1;
        return encryptSyncEnvelope(input);
      },
    });
    const recipient = setup("idempotent-recipient");
    const localRecipient = await recipient.service.ensureLocalDevice("Lab Mac");
    await sender.service.registerAndVerifyDevice(
      localRecipient,
      localRecipient.fingerprint,
    );
    seedSession(sender.sessionRepository);

    await expect(sender.service.stage("project-a")).resolves.toMatchObject({
      queued: 2,
    });
    expect(encryptions).toBe(2);
    await expect(sender.service.stage("project-a")).resolves.toMatchObject({
      queued: 0,
    });
    expect(encryptions).toBe(2);
  });

  it("returns partial failures for corrupted payloads and resumes valid envelopes", async () => {
    const a = setup("device-a");
    const b = setup("device-b");
    const localA = await a.service.ensureLocalDevice("Research Mac");
    const localB = await b.service.ensureLocalDevice("Lab workstation");
    await a.service.registerAndVerifyDevice(localB, localB.fingerprint);
    await b.service.registerAndVerifyDevice(localA, localA.fingerprint);
    seedSession(a.sessionRepository);
    await a.service.stage("project-a");
    const batch = await a.service.exportBatch("project-a", localB.id, {
      maxRecords: 10,
      maxBytes: 200_000,
    });
    const corrupted = structuredClone(batch.items[0].envelope);
    corrupted.signature = `${corrupted.signature.slice(0, -2)}AA`;
    const expiredKey = structuredClone(batch.items[0].envelope);
    expiredKey.metadata.envelopeId = "expired-key-envelope";
    expiredKey.sender.keyVersion += 99;

    const result = await b.service.importBatch("project-a", [
      corrupted,
      expiredKey,
      batch.items[1].envelope,
    ]);
    expect(result).toMatchObject({ applied: 1, failed: 2 });
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "failed",
          errorCode: "corrupted_payload",
        }),
        expect.objectContaining({ status: "failed", errorCode: "expired_key" }),
        expect.objectContaining({ status: "applied" }),
      ]),
    );
  });

  it("paginates long sessions and rejects over-quota imports", async () => {
    const device = setup("long-session");
    const aggregate = seedSession(device.sessionRepository);
    for (let index = 0; index < 501; index += 1) {
      device.sessionRepository.appendEvent("project-a", aggregate.session.id, {
        schemaVersion: 1,
        payloadVersion: 1,
        idempotencyKey: `paged-message-${index}`,
        type: "message.recorded",
        transferability: "transferable",
        occurredAt: "2026-07-16T12:00:00.000Z",
        actor: { kind: "user", id: "local-user" },
        payload: { role: "user", body: `Approved message ${index}` },
      });
    }

    await expect(device.service.preview("project-a")).resolves.toMatchObject({
      approvedChanges: 503,
      localOnlyItems: 1,
    });
    await expect(
      device.service.importBatch(
        "project-a",
        Array.from({ length: 501 }, () => ({})),
      ),
    ).rejects.toThrow(/too many/i);
  });

  it("rotates local keys and blocks all new delivery to a revoked device", async () => {
    const a = setup("device-a");
    const b = setup("device-b");
    const localA = await a.service.ensureLocalDevice("Research Mac");
    const localB = await b.service.ensureLocalDevice("Lab workstation");
    await a.service.registerAndVerifyDevice(localB, localB.fingerprint);
    seedSession(a.sessionRepository);
    await expect(a.service.stage("project-a")).resolves.toMatchObject({
      queued: 2,
    });
    const rotated = await a.service.rotateLocalKeys();
    expect(rotated.keyVersion).toBe(localA.keyVersion + 1);
    expect(rotated.fingerprint).not.toBe(localA.fingerprint);
    expect(a.syncRepository.getStatus("project-a").pendingChanges).toBe(0);
    await expect(a.service.stage("project-a")).resolves.toMatchObject({
      queued: 2,
    });
    const restaged = await a.service.exportBatch("project-a", localB.id, {
      maxRecords: 10,
      maxBytes: 200_000,
    });
    expect(
      restaged.items.every(
        (item) => item.envelope.sender.keyVersion === rotated.keyVersion,
      ),
    ).toBe(true);

    await a.service.revokeDevice(localB.id, "Device was lost");
    const preview = await a.service.preview("project-a");
    expect(preview).toMatchObject({ trustedDeviceCount: 0, policyBlocked: 2 });
    await expect(a.service.stage("project-a")).resolves.toMatchObject({
      queued: 0,
      policyBlocked: 2,
    });
  });
});
