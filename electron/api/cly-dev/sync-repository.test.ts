// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../persisted-state.js";
import {
  deviceFingerprint,
  encryptSyncEnvelope,
  generateDeviceKeyMaterial,
} from "./sync-crypto.js";
import { createClyDevSyncRepository } from "./sync-repository.js";

const databasePaths: string[] = [];

function setup() {
  const databasePath = path.join(
    mkdtempSync(path.join(tmpdir(), "cly-dev-sync-")),
    "state.sqlite",
  );
  databasePaths.push(databasePath);
  const db = getStateDatabase(databasePath);
  db.prepare(
    `INSERT INTO projects
      (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
     VALUES ('project-a', '/tmp/a', '/tmp/a', 'A', 'open', 0, '{}', ?, ?)`,
  ).run("2026-07-16T12:00:00.000Z", "2026-07-16T12:00:00.000Z");
  return { databasePath, db, repository: createClyDevSyncRepository({ db }) };
}

function registerPair(
  repository: ReturnType<typeof createClyDevSyncRepository>,
) {
  const local = generateDeviceKeyMaterial({ deviceId: "device-a" });
  const peer = generateDeviceKeyMaterial({ deviceId: "device-b" });
  repository.ensureLocalDevice({
    id: "device-a",
    name: "Research Mac",
    privateKeyRef: "vault-local-1",
    publicBundle: local.publicBundle,
  });
  repository.registerDevice({
    id: "device-b",
    name: "Lab workstation",
    publicBundle: peer.publicBundle,
  });
  repository.verifyDevice("device-b", deviceFingerprint(peer.publicBundle));
  return { local, peer };
}

function envelope(
  local: ReturnType<typeof generateDeviceKeyMaterial>,
  peer: ReturnType<typeof generateDeviceKeyMaterial>,
  patch: Record<string, unknown> = {},
) {
  return encryptSyncEnvelope({
    sender: local,
    recipients: [peer.publicBundle],
    metadata: {
      envelopeId: "envelope-1",
      projectId: "project-a",
      recordKind: "session-event",
      recordId: "session-1",
      revision: 1,
      baseRevision: 0,
      createdAt: "2026-07-16T12:00:00.000Z",
      ...patch,
    },
    payload: { body: "ciphertext only in repository" },
  });
}

afterEach(() => closePersistedStateDatabase());

describe("Cly Dev sync repository", () => {
  it("requires fingerprint verification and excludes revoked devices", () => {
    const { repository } = setup();
    const local = generateDeviceKeyMaterial({ deviceId: "device-a" });
    const peer = generateDeviceKeyMaterial({ deviceId: "device-b" });
    repository.ensureLocalDevice({
      id: "device-a",
      name: "Research Mac",
      privateKeyRef: "vault-1",
      publicBundle: local.publicBundle,
    });
    const pending = repository.registerDevice({
      id: "device-b",
      name: "Lab workstation",
      publicBundle: peer.publicBundle,
    });

    expect(pending.trustState).toBe("pending");
    expect(() => repository.verifyDevice("device-b", "WRONG")).toThrow(
      /fingerprint/i,
    );
    expect(
      repository.verifyDevice("device-b", deviceFingerprint(peer.publicBundle))
        .trustState,
    ).toBe("trusted");
    expect(repository.listTrustedRecipients()).toHaveLength(1);

    repository.revokeDevice("device-b", "Lost device");
    expect(repository.listTrustedRecipients()).toEqual([]);
    expect(repository.listDevices()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "device-b", trustState: "revoked" }),
      ]),
    );
    expect(JSON.stringify(repository.listDevices())).not.toContain("vault-1");
  });

  it("rejects malformed or algorithm-swapped device public keys", () => {
    const { repository } = setup();
    const valid = generateDeviceKeyMaterial({ deviceId: "device-b" });

    expect(() =>
      repository.registerDevice({
        id: "device-b",
        name: "Malformed device",
        publicBundle: {
          ...valid.publicBundle,
          encryptionKey: "x".repeat(64),
        },
      }),
    ).toThrow(/X25519/i);
    expect(() =>
      repository.registerDevice({
        id: "device-b",
        name: "Swapped algorithms",
        publicBundle: {
          ...valid.publicBundle,
          encryptionKey: valid.publicBundle.signingKey,
          signingKey: valid.publicBundle.encryptionKey,
        },
      }),
    ).toThrow(/X25519|Ed25519/i);
  });

  it("accepts a newer peer key version only after verifying its fingerprint", () => {
    const { repository } = setup();
    const { peer } = registerPair(repository);
    const rotated = generateDeviceKeyMaterial({
      deviceId: peer.publicBundle.deviceId,
      keyVersion: 3,
    });

    expect(() =>
      repository.rotatePeerDevice("device-b", {
        publicBundle: rotated.publicBundle,
        fingerprint: "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111",
      }),
    ).toThrow(/fingerprint/i);

    expect(
      repository.rotatePeerDevice("device-b", {
        publicBundle: rotated.publicBundle,
        fingerprint: deviceFingerprint(rotated.publicBundle),
      }),
    ).toMatchObject({
      id: "device-b",
      keyVersion: 3,
      fingerprint: deviceFingerprint(rotated.publicBundle),
      trustState: "trusted",
    });
    expect(repository.getDeviceKey("device-b", 1).keyState).toBe("retired");
    expect(() => repository.getDeviceKey("device-b", 2)).toThrow(/not found/i);
    expect(repository.getDeviceKey("device-b", 3).keyState).toBe("active");
  });

  it("queues ciphertext idempotently, bounds export batches, retries, and acknowledges", () => {
    const { repository } = setup();
    const { local, peer } = registerPair(repository);
    const encrypted = envelope(local, peer);

    const first = repository.queueEnvelope("project-a", "device-b", encrypted);
    const duplicate = repository.queueEnvelope(
      "project-a",
      "device-b",
      encrypted,
    );
    expect(duplicate.id).toBe(first.id);
    expect(JSON.stringify(first)).not.toContain(
      "ciphertext only in repository",
    );

    const tooSmall = repository.listOutboxBatch("project-a", "device-b", {
      maxRecords: 10,
      maxBytes: 10,
    });
    expect(tooSmall.items).toEqual([]);
    expect(tooSmall.quotaBlocked).toBe(1);

    const batch = repository.listOutboxBatch("project-a", "device-b", {
      maxRecords: 10,
      maxBytes: 100_000,
    });
    expect(batch.items).toHaveLength(1);
    expect(batch.items[0].envelope).toEqual(encrypted);

    repository.recordAttempt(first.id, {
      errorCode: "connection_lost",
      retryable: true,
    });
    expect(repository.getOutboxItem(first.id)).toMatchObject({
      attemptCount: 1,
      status: "pending",
      lastErrorCode: "connection_lost",
    });
    repository.acknowledge("project-a", "device-b", [
      encrypted.metadata.envelopeId,
    ]);
    expect(repository.getOutboxItem(first.id).status).toBe("acked");
  });

  it("stops a byte-limited batch before the first envelope that does not fit", () => {
    const { db, repository } = setup();
    const { local, peer } = registerPair(repository);
    const large = repository.queueEnvelope(
      "project-a",
      "device-b",
      envelope(local, peer, {
        envelopeId: "large-envelope",
        recordId: `session-1:${"large".repeat(80)}`,
      }),
    );
    const small = repository.queueEnvelope(
      "project-a",
      "device-b",
      envelope(local, peer, {
        envelopeId: "small-envelope",
        recordId: "session-1:small",
      }),
    );
    db.prepare(
      "UPDATE cly_dev_sync_outbox SET id = ?, created_at = ? WHERE id = ?",
    ).run("z-first-envelope", "2026-07-16T12:00:00.000Z", large.id);
    db.prepare(
      "UPDATE cly_dev_sync_outbox SET id = ?, created_at = ? WHERE id = ?",
    ).run("a-second-envelope", "2026-07-16T12:00:00.000Z", small.id);
    expect(small.byteSize).toBeLessThan(large.byteSize);

    const batch = repository.listOutboxBatch("project-a", "device-b", {
      maxRecords: 10,
      maxBytes: large.byteSize - 1,
    });

    expect(batch.items).toEqual([]);
    expect(batch.quotaBlocked).toBe(1);
    expect(batch.hasMore).toBe(true);
  });

  it("detects concurrent revisions and resolves them explicitly", () => {
    const { repository } = setup();
    const { local, peer } = registerPair(repository);
    const first = envelope(local, peer);
    const concurrent = envelope(local, peer, {
      envelopeId: "envelope-2",
      revision: 2,
      baseRevision: 0,
    });

    expect(
      repository.acceptIncomingEnvelope("project-a", "device-b", first),
    ).toMatchObject({ status: "applied" });
    const result = repository.acceptIncomingEnvelope(
      "project-a",
      "device-b",
      concurrent,
    );
    expect(result.status).toBe("conflict");
    const conflict = repository.listConflicts("project-a")[0];
    expect(conflict).toMatchObject({
      localRevision: 1,
      incomingRevision: 2,
      state: "pending",
    });

    repository.resolveConflict("project-a", conflict.id, "use_incoming");
    expect(repository.listConflicts("project-a")[0].state).toBe("use_incoming");
    expect(
      repository.getHead("project-a", "session-event", "session-1"),
    ).toMatchObject({ revision: 2, envelopeId: "envelope-2" });
  });

  it("keeps encrypted queue, trust, and content-free audit state after reopen", () => {
    const { databasePath, repository } = setup();
    const { local, peer } = registerPair(repository);
    repository.queueEnvelope("project-a", "device-b", envelope(local, peer));
    closePersistedStateDatabase();

    const reopened = createClyDevSyncRepository({
      db: getStateDatabase(databasePath),
    });
    expect(reopened.listTrustedRecipients()).toHaveLength(1);
    expect(reopened.getStatus("project-a").pendingChanges).toBe(1);
    const audit = reopened.listAuditEvents(100);
    expect(audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toContain(
      "ciphertext only in repository",
    );
    expect(() =>
      reopened.recordAudit("sync.bad", {
        content: "must not be logged",
      }),
    ).toThrow(/content/i);
  });
});
