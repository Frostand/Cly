import { createHash, randomUUID } from "node:crypto";
import { canonicalJson, deviceFingerprint } from "./sync-crypto.js";
import {
  deviceKeyRotationSchema,
  deviceRegistrationSchema,
  syncBatchOptionsSchema,
  syncEnvelopeSchema,
} from "./sync-schema.js";

const json = (value) => JSON.stringify(value);
const parse = (value, fallback = {}) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
const transaction = (db, operation) => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const forbiddenAuditKey =
  /(?:body|content|message|payload|plaintext|ciphertext|envelope|secret|private.?key)/i;
function assertSafeAuditMetadata(value, path = "metadata") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertSafeAuditMetadata(entry, `${path}[${index}]`);
    });
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenAuditKey.test(key)) {
      throw new Error(
        `Audit metadata must not contain content field ${path}.${key}.`,
      );
    }
    assertSafeAuditMetadata(child, `${path}.${key}`);
  }
}

const deviceFromRow = (row) => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  trustState: row.trust_state,
  fingerprint: row.fingerprint,
  keyVersion: row.current_key_version,
  publicBundle: {
    deviceId: row.id,
    keyVersion: row.current_key_version,
    encryptionKey: row.encryption_public_key,
    signingKey: row.signing_public_key,
  },
  registeredAt: row.registered_at,
  verifiedAt: row.verified_at,
  revokedAt: row.revoked_at,
  revocationReason: row.revocation_reason,
  lastSeenAt: row.last_seen_at,
});

const outboxFromRow = (row) => ({
  id: row.id,
  projectId: row.project_id,
  recipientDeviceId: row.recipient_device_id,
  recipientKeyVersion: row.recipient_key_version,
  envelopeId: row.envelope_id,
  recordKind: row.record_kind,
  recordId: row.record_id,
  revision: row.revision,
  baseRevision: row.base_revision,
  envelope: parse(row.envelope_json),
  envelopeSha256: row.envelope_sha256,
  byteSize: row.byte_size,
  status: row.status,
  attemptCount: row.attempt_count,
  nextAttemptAt: row.next_attempt_at,
  lastErrorCode: row.last_error_code,
  createdAt: row.created_at,
  ackedAt: row.acked_at,
});

const conflictFromRow = (row) => ({
  id: row.id,
  projectId: row.project_id,
  recordKind: row.record_kind,
  recordId: row.record_id,
  localRevision: row.local_revision,
  incomingRevision: row.incoming_revision,
  localEnvelopeId: row.local_envelope_id,
  incomingEnvelopeId: row.incoming_envelope_id,
  state: row.state,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
});

export function createClyDevSyncRepository({
  db,
  now = () => new Date().toISOString(),
} = {}) {
  if (!db) throw new Error("A SQLite database is required.");

  const insertAudit = (
    action,
    metadata = {},
    { projectId = null, actorDeviceId = null, subjectDeviceId = null } = {},
  ) => {
    assertSafeAuditMetadata(metadata);
    const id = randomUUID();
    db.prepare(
      `INSERT INTO cly_dev_sync_audit
       (id, project_id, action, actor_device_id, subject_device_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      projectId,
      action,
      actorDeviceId,
      subjectDeviceId,
      json(metadata),
      now(),
    );
    return id;
  };

  const getDeviceRow = (deviceId) => {
    const row = db
      .prepare(
        `SELECT devices.*, keys.encryption_public_key, keys.signing_public_key,
                keys.private_key_ref, keys.state AS key_state
         FROM cly_dev_devices devices
         JOIN cly_dev_device_keys keys
           ON keys.device_id = devices.id AND keys.key_version = devices.current_key_version
         WHERE devices.id = ?`,
      )
      .get(deviceId);
    if (!row) throw new Error("Cly Dev device was not found.");
    return row;
  };

  const repository = {
    ensureLocalDevice(rawInput) {
      const { privateKeyRef, ...registration } = rawInput ?? {};
      const input = deviceRegistrationSchema.parse(registration);
      if (
        typeof privateKeyRef !== "string" ||
        !privateKeyRef.trim() ||
        privateKeyRef.length > 500
      ) {
        throw new Error("A private-key credential reference is required.");
      }
      const existing = db
        .prepare("SELECT id FROM cly_dev_devices WHERE kind = 'local'")
        .get();
      if (existing) {
        if (existing.id !== input.id) {
          throw new Error(
            "A different local Cly Dev device is already registered.",
          );
        }
        return repository.getDevice(input.id);
      }
      return transaction(db, () => {
        const timestamp = now();
        const fingerprint = deviceFingerprint(input.publicBundle);
        db.prepare(
          `INSERT INTO cly_dev_devices
           (id, name, kind, trust_state, fingerprint, current_key_version,
            registered_at, verified_at, revoked_at, revocation_reason, last_seen_at)
           VALUES (?, ?, 'local', 'trusted', ?, ?, ?, ?, NULL, NULL, ?)`,
        ).run(
          input.id,
          input.name,
          fingerprint,
          input.publicBundle.keyVersion,
          timestamp,
          timestamp,
          timestamp,
        );
        db.prepare(
          `INSERT INTO cly_dev_device_keys
           (device_id, key_version, encryption_public_key, signing_public_key,
            private_key_ref, state, created_at, retired_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?, NULL)`,
        ).run(
          input.id,
          input.publicBundle.keyVersion,
          input.publicBundle.encryptionKey,
          input.publicBundle.signingKey,
          privateKeyRef,
          timestamp,
        );
        insertAudit(
          "device.local_registered",
          { keyVersion: input.publicBundle.keyVersion },
          {
            actorDeviceId: input.id,
            subjectDeviceId: input.id,
          },
        );
        return repository.getDevice(input.id);
      });
    },

    registerDevice(rawInput) {
      const input = deviceRegistrationSchema.parse(rawInput);
      const existing = db
        .prepare("SELECT fingerprint FROM cly_dev_devices WHERE id = ?")
        .get(input.id);
      const fingerprint = deviceFingerprint(input.publicBundle);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new Error(
            "The device ID is already bound to different public keys.",
          );
        }
        return repository.getDevice(input.id);
      }
      return transaction(db, () => {
        const timestamp = now();
        db.prepare(
          `INSERT INTO cly_dev_devices
           (id, name, kind, trust_state, fingerprint, current_key_version,
            registered_at, verified_at, revoked_at, revocation_reason, last_seen_at)
           VALUES (?, ?, 'peer', 'pending', ?, ?, ?, NULL, NULL, NULL, NULL)`,
        ).run(
          input.id,
          input.name,
          fingerprint,
          input.publicBundle.keyVersion,
          timestamp,
        );
        db.prepare(
          `INSERT INTO cly_dev_device_keys
           (device_id, key_version, encryption_public_key, signing_public_key,
            private_key_ref, state, created_at, retired_at)
           VALUES (?, ?, ?, ?, NULL, 'active', ?, NULL)`,
        ).run(
          input.id,
          input.publicBundle.keyVersion,
          input.publicBundle.encryptionKey,
          input.publicBundle.signingKey,
          timestamp,
        );
        insertAudit(
          "device.registration_requested",
          { keyVersion: input.publicBundle.keyVersion },
          {
            subjectDeviceId: input.id,
          },
        );
        return repository.getDevice(input.id);
      });
    },

    verifyDevice(deviceId, suppliedFingerprint) {
      return transaction(db, () => {
        const row = getDeviceRow(deviceId);
        if (row.trust_state === "revoked") {
          throw new Error("A revoked device cannot be verified again.");
        }
        const normalized = String(suppliedFingerprint).trim().toUpperCase();
        if (normalized !== row.fingerprint) {
          throw new Error("Device fingerprint verification failed.");
        }
        const timestamp = now();
        db.prepare(
          "UPDATE cly_dev_devices SET trust_state = 'trusted', verified_at = ?, last_seen_at = ? WHERE id = ?",
        ).run(timestamp, timestamp, deviceId);
        insertAudit(
          "device.verified",
          { keyVersion: row.current_key_version },
          {
            subjectDeviceId: deviceId,
          },
        );
        return repository.getDevice(deviceId);
      });
    },

    rotateLocalDevice(deviceId, { publicBundle, privateKeyRef }) {
      return transaction(db, () => {
        const row = getDeviceRow(deviceId);
        if (row.kind !== "local" || row.trust_state !== "trusted") {
          throw new Error("Only the active local device can rotate keys.");
        }
        if (
          publicBundle.deviceId !== deviceId ||
          publicBundle.keyVersion !== row.current_key_version + 1
        ) {
          throw new Error(
            "Device key rotation must advance exactly one version.",
          );
        }
        const timestamp = now();
        db.prepare(
          "UPDATE cly_dev_device_keys SET state = 'retired', retired_at = ? WHERE device_id = ? AND key_version = ?",
        ).run(timestamp, deviceId, row.current_key_version);
        db.prepare(
          `INSERT INTO cly_dev_device_keys
           (device_id, key_version, encryption_public_key, signing_public_key,
            private_key_ref, state, created_at, retired_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?, NULL)`,
        ).run(
          deviceId,
          publicBundle.keyVersion,
          publicBundle.encryptionKey,
          publicBundle.signingKey,
          privateKeyRef,
          timestamp,
        );
        db.prepare(
          `UPDATE cly_dev_devices SET current_key_version = ?, fingerprint = ?, last_seen_at = ?
           WHERE id = ?`,
        ).run(
          publicBundle.keyVersion,
          deviceFingerprint(publicBundle),
          timestamp,
          deviceId,
        );
        const discardedDeliveryCount = db
          .prepare("DELETE FROM cly_dev_sync_outbox WHERE status != 'acked'")
          .run().changes;
        insertAudit(
          "device.keys_rotated",
          { keyVersion: publicBundle.keyVersion, discardedDeliveryCount },
          {
            actorDeviceId: deviceId,
            subjectDeviceId: deviceId,
          },
        );
        return repository.getDevice(deviceId);
      });
    },

    rotatePeerDevice(deviceId, rawInput) {
      const input = deviceKeyRotationSchema.parse(rawInput);
      return transaction(db, () => {
        const row = getDeviceRow(deviceId);
        if (row.kind !== "peer" || row.trust_state !== "trusted") {
          throw new Error("Only a trusted peer can rotate public keys.");
        }
        if (
          input.publicBundle.deviceId !== deviceId ||
          input.publicBundle.keyVersion <= row.current_key_version
        ) {
          throw new Error(
            "Device key rotation must advance to a newer version.",
          );
        }
        const nextFingerprint = deviceFingerprint(input.publicBundle);
        if (input.fingerprint !== nextFingerprint) {
          throw new Error("Device fingerprint verification failed.");
        }
        const timestamp = now();
        db.prepare(
          "UPDATE cly_dev_device_keys SET state = 'retired', retired_at = ? WHERE device_id = ? AND key_version = ?",
        ).run(timestamp, deviceId, row.current_key_version);
        db.prepare(
          `INSERT INTO cly_dev_device_keys
           (device_id, key_version, encryption_public_key, signing_public_key,
            private_key_ref, state, created_at, retired_at)
           VALUES (?, ?, ?, ?, NULL, 'active', ?, NULL)`,
        ).run(
          deviceId,
          input.publicBundle.keyVersion,
          input.publicBundle.encryptionKey,
          input.publicBundle.signingKey,
          timestamp,
        );
        db.prepare(
          `UPDATE cly_dev_devices SET current_key_version = ?, fingerprint = ?,
             verified_at = ?, last_seen_at = ? WHERE id = ?`,
        ).run(
          input.publicBundle.keyVersion,
          nextFingerprint,
          timestamp,
          timestamp,
          deviceId,
        );
        insertAudit(
          "device.peer_keys_rotated",
          { keyVersion: input.publicBundle.keyVersion },
          { subjectDeviceId: deviceId },
        );
        return repository.getDevice(deviceId);
      });
    },

    revokeDevice(deviceId, reason) {
      if (!String(reason).trim())
        throw new Error("A revocation reason is required.");
      return transaction(db, () => {
        const row = getDeviceRow(deviceId);
        if (row.kind === "local")
          throw new Error("The active local device cannot revoke itself.");
        if (row.trust_state === "revoked")
          return repository.getDevice(deviceId);
        const timestamp = now();
        db.prepare(
          `UPDATE cly_dev_devices
           SET trust_state = 'revoked', revoked_at = ?, revocation_reason = ? WHERE id = ?`,
        ).run(timestamp, String(reason).trim(), deviceId);
        db.prepare(
          "UPDATE cly_dev_device_keys SET state = 'revoked', retired_at = COALESCE(retired_at, ?) WHERE device_id = ?",
        ).run(timestamp, deviceId);
        db.prepare(
          `UPDATE cly_dev_sync_outbox SET status = 'policy_blocked', last_error_code = 'device_revoked'
           WHERE recipient_device_id = ? AND status = 'pending'`,
        ).run(deviceId);
        insertAudit(
          "device.revoked",
          { reasonCode: "user_revoked" },
          {
            subjectDeviceId: deviceId,
          },
        );
        return repository.getDevice(deviceId);
      });
    },

    getDevice(deviceId) {
      return deviceFromRow(getDeviceRow(deviceId));
    },

    getDeviceKey(deviceId, keyVersion) {
      const row = db
        .prepare(
          `SELECT devices.id, devices.name, devices.kind, devices.trust_state,
                  keys.key_version, keys.encryption_public_key, keys.signing_public_key,
                  keys.private_key_ref, keys.state AS key_state
           FROM cly_dev_devices devices JOIN cly_dev_device_keys keys ON keys.device_id = devices.id
           WHERE devices.id = ? AND keys.key_version = ?`,
        )
        .get(deviceId, keyVersion);
      if (!row) throw new Error("Cly Dev device key was not found.");
      return {
        deviceId: row.id,
        name: row.name,
        kind: row.kind,
        trustState: row.trust_state,
        keyVersion: row.key_version,
        keyState: row.key_state,
        encryptionKey: row.encryption_public_key,
        signingKey: row.signing_public_key,
        privateKeyRef: row.private_key_ref,
      };
    },

    getLocalDevice() {
      const row = db
        .prepare("SELECT id FROM cly_dev_devices WHERE kind = 'local'")
        .get();
      return row ? repository.getDevice(row.id) : null;
    },

    listDevices() {
      return db
        .prepare("SELECT id FROM cly_dev_devices ORDER BY kind, name, id")
        .all()
        .map((row) => repository.getDevice(row.id));
    },

    listTrustedRecipients() {
      return db
        .prepare(
          "SELECT id FROM cly_dev_devices WHERE kind = 'peer' AND trust_state = 'trusted' ORDER BY name, id",
        )
        .all()
        .map((row) => repository.getDevice(row.id));
    },

    queueEnvelope(projectId, recipientDeviceId, rawEnvelope) {
      const envelope = syncEnvelopeSchema.parse(rawEnvelope);
      if (envelope.metadata.projectId !== projectId) {
        throw new Error(
          "Sync envelope project does not match the queue project.",
        );
      }
      const recipient = envelope.recipients.find(
        (item) => item.deviceId === recipientDeviceId,
      );
      if (!recipient)
        throw new Error("Sync envelope does not include the queue recipient.");
      const device = getDeviceRow(recipientDeviceId);
      if (device.trust_state !== "trusted" || device.kind !== "peer") {
        throw new Error("Only a trusted peer can receive synchronized state.");
      }
      if (device.current_key_version !== recipient.keyVersion) {
        throw new Error("Sync envelope targets an expired device key.");
      }
      const duplicate = db
        .prepare(
          `SELECT * FROM cly_dev_sync_outbox
           WHERE project_id = ? AND recipient_device_id = ? AND envelope_id = ?`,
        )
        .get(projectId, recipientDeviceId, envelope.metadata.envelopeId);
      if (duplicate) return outboxFromRow(duplicate);
      return transaction(db, () => {
        const envelopeBytes = canonicalJson(envelope);
        const id = randomUUID();
        const timestamp = now();
        db.prepare(
          `INSERT INTO cly_dev_sync_outbox
           (id, project_id, recipient_device_id, recipient_key_version, envelope_id,
            record_kind, record_id, revision, base_revision, envelope_json,
            envelope_sha256, byte_size, status, attempt_count, next_attempt_at,
            last_error_code, created_at, acked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, NULL, ?, NULL)`,
        ).run(
          id,
          projectId,
          recipientDeviceId,
          recipient.keyVersion,
          envelope.metadata.envelopeId,
          envelope.metadata.recordKind,
          envelope.metadata.recordId,
          envelope.metadata.revision,
          envelope.metadata.baseRevision,
          envelopeBytes,
          sha256(envelopeBytes),
          Buffer.byteLength(envelopeBytes),
          timestamp,
          timestamp,
        );
        insertAudit(
          "sync.envelope_queued",
          {
            recordKind: envelope.metadata.recordKind,
            revision: envelope.metadata.revision,
            byteSize: Buffer.byteLength(envelopeBytes),
          },
          {
            projectId,
            actorDeviceId: envelope.sender.deviceId,
            subjectDeviceId: recipientDeviceId,
          },
        );
        return repository.getOutboxItem(id);
      });
    },

    getOutboxItem(id) {
      const row = db
        .prepare("SELECT * FROM cly_dev_sync_outbox WHERE id = ?")
        .get(id);
      if (!row) throw new Error("Sync outbox item was not found.");
      return outboxFromRow(row);
    },

    hasOutboxEnvelope(projectId, recipientDeviceId, envelopeId) {
      return Boolean(
        db
          .prepare(
            `SELECT 1 FROM cly_dev_sync_outbox
             WHERE project_id = ? AND recipient_device_id = ? AND envelope_id = ?`,
          )
          .get(projectId, recipientDeviceId, envelopeId),
      );
    },

    listOutboxBatch(projectId, recipientDeviceId, rawOptions = {}) {
      const options = syncBatchOptionsSchema.parse(rawOptions);
      const rows = db
        .prepare(
          `SELECT * FROM cly_dev_sync_outbox
           WHERE project_id = ? AND recipient_device_id = ? AND status = 'pending'
             AND next_attempt_at <= ?
           ORDER BY created_at, rowid LIMIT ?`,
        )
        .all(projectId, recipientDeviceId, now(), options.maxRecords + 1);
      const items = [];
      let bytes = 0;
      let quotaBlocked = 0;
      for (const row of rows) {
        if (items.length >= options.maxRecords) break;
        if (bytes + row.byte_size > options.maxBytes) {
          quotaBlocked = 1;
          break;
        }
        items.push(outboxFromRow(row));
        bytes += row.byte_size;
      }
      return {
        items,
        bytes,
        quotaBlocked,
        hasMore: rows.length > items.length,
      };
    },

    recordAttempt(id, { errorCode = null, retryable = true } = {}) {
      return transaction(db, () => {
        const row = db
          .prepare("SELECT * FROM cly_dev_sync_outbox WHERE id = ?")
          .get(id);
        if (!row) throw new Error("Sync outbox item was not found.");
        if (row.status === "acked" || row.status === "policy_blocked") {
          return outboxFromRow(row);
        }
        const attemptCount = row.attempt_count + 1;
        const retryAt = new Date(
          new Date(now()).getTime() +
            Math.min(300_000, 1_000 * 2 ** (attemptCount - 1)),
        ).toISOString();
        db.prepare(
          `UPDATE cly_dev_sync_outbox SET attempt_count = ?, status = ?,
             next_attempt_at = ?, last_error_code = ? WHERE id = ?`,
        ).run(
          attemptCount,
          retryable ? "pending" : "failed",
          retryAt,
          errorCode,
          id,
        );
        insertAudit(
          "sync.delivery_attempted",
          {
            attemptCount,
            outcome: retryable ? "retry_scheduled" : "failed",
            errorCode,
          },
          {
            projectId: row.project_id,
            subjectDeviceId: row.recipient_device_id,
          },
        );
        return repository.getOutboxItem(id);
      });
    },

    acknowledge(projectId, recipientDeviceId, envelopeIds) {
      return transaction(db, () => {
        const timestamp = now();
        let changed = 0;
        for (const envelopeId of new Set(envelopeIds)) {
          changed += db
            .prepare(
              `UPDATE cly_dev_sync_outbox SET status = 'acked', acked_at = ?, last_error_code = NULL
             WHERE project_id = ? AND recipient_device_id = ? AND envelope_id = ? AND status != 'acked'`,
            )
            .run(timestamp, projectId, recipientDeviceId, envelopeId).changes;
        }
        if (changed)
          insertAudit(
            "sync.batch_acknowledged",
            { recordCount: changed },
            {
              projectId,
              subjectDeviceId: recipientDeviceId,
            },
          );
        return { acknowledged: changed };
      });
    },

    acceptIncomingEnvelope(projectId, recipientDeviceId, rawEnvelope) {
      const envelope = syncEnvelopeSchema.parse(rawEnvelope);
      if (envelope.metadata.projectId !== projectId) {
        throw new Error("Incoming sync envelope belongs to another project.");
      }
      if (
        !envelope.recipients.some((item) => item.deviceId === recipientDeviceId)
      ) {
        throw new Error(
          "Incoming sync envelope is not addressed to this device.",
        );
      }
      const sender = getDeviceRow(envelope.sender.deviceId);
      if (sender.trust_state !== "trusted") {
        throw new Error(
          "Incoming sync sender is not trusted or has been revoked.",
        );
      }
      if (envelope.sender.keyVersion !== sender.current_key_version) {
        const key = repository.getDeviceKey(
          envelope.sender.deviceId,
          envelope.sender.keyVersion,
        );
        if (key.keyState === "revoked") {
          throw new Error("Incoming sync sender key has been revoked.");
        }
      }
      const existing = db
        .prepare("SELECT status FROM cly_dev_sync_inbox WHERE envelope_id = ?")
        .get(envelope.metadata.envelopeId);
      if (existing)
        return {
          envelopeId: envelope.metadata.envelopeId,
          status: existing.status,
          duplicate: true,
        };
      return transaction(db, () => {
        const timestamp = now();
        const envelopeBytes = canonicalJson(envelope);
        const head = db
          .prepare(
            `SELECT * FROM cly_dev_sync_heads
             WHERE project_id = ? AND record_kind = ? AND record_id = ?`,
          )
          .get(
            projectId,
            envelope.metadata.recordKind,
            envelope.metadata.recordId,
          );
        const conflict =
          head && envelope.metadata.baseRevision !== head.revision;
        const status = conflict ? "conflict" : "applied";
        db.prepare(
          `INSERT INTO cly_dev_sync_inbox
           (envelope_id, project_id, recipient_device_id, sender_device_id,
            sender_key_version, record_kind, record_id, revision, base_revision,
            envelope_json, envelope_sha256, byte_size, status, received_at, applied_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          envelope.metadata.envelopeId,
          projectId,
          recipientDeviceId,
          envelope.sender.deviceId,
          envelope.sender.keyVersion,
          envelope.metadata.recordKind,
          envelope.metadata.recordId,
          envelope.metadata.revision,
          envelope.metadata.baseRevision,
          envelopeBytes,
          sha256(envelopeBytes),
          Buffer.byteLength(envelopeBytes),
          status,
          timestamp,
          conflict ? null : timestamp,
        );
        if (conflict) {
          db.prepare(
            `INSERT INTO cly_dev_sync_conflicts
             (id, project_id, record_kind, record_id, local_revision, incoming_revision,
              local_envelope_id, incoming_envelope_id, state, created_at, resolved_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)`,
          ).run(
            randomUUID(),
            projectId,
            envelope.metadata.recordKind,
            envelope.metadata.recordId,
            head.revision,
            envelope.metadata.revision,
            head.envelope_id,
            envelope.metadata.envelopeId,
            timestamp,
          );
          insertAudit(
            "sync.conflict_detected",
            {
              recordKind: envelope.metadata.recordKind,
              localRevision: head.revision,
              incomingRevision: envelope.metadata.revision,
            },
            {
              projectId,
              actorDeviceId: envelope.sender.deviceId,
              subjectDeviceId: recipientDeviceId,
            },
          );
        } else {
          db.prepare(
            `INSERT INTO cly_dev_sync_heads
             (project_id, record_kind, record_id, revision, source_device_id, envelope_id, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(project_id, record_kind, record_id) DO UPDATE SET
               revision = excluded.revision, source_device_id = excluded.source_device_id,
               envelope_id = excluded.envelope_id, updated_at = excluded.updated_at`,
          ).run(
            projectId,
            envelope.metadata.recordKind,
            envelope.metadata.recordId,
            envelope.metadata.revision,
            envelope.sender.deviceId,
            envelope.metadata.envelopeId,
            timestamp,
          );
          insertAudit(
            "sync.envelope_applied",
            {
              recordKind: envelope.metadata.recordKind,
              revision: envelope.metadata.revision,
              byteSize: Buffer.byteLength(envelopeBytes),
            },
            {
              projectId,
              actorDeviceId: envelope.sender.deviceId,
              subjectDeviceId: recipientDeviceId,
            },
          );
        }
        return {
          envelopeId: envelope.metadata.envelopeId,
          status,
          duplicate: false,
        };
      });
    },

    getIncomingEnvelope(envelopeId) {
      const row = db
        .prepare("SELECT * FROM cly_dev_sync_inbox WHERE envelope_id = ?")
        .get(envelopeId);
      if (!row) throw new Error("Incoming sync envelope was not found.");
      return {
        envelopeId: row.envelope_id,
        projectId: row.project_id,
        status: row.status,
        envelope: parse(row.envelope_json),
      };
    },

    listConflicts(projectId) {
      return db
        .prepare(
          "SELECT * FROM cly_dev_sync_conflicts WHERE project_id = ? ORDER BY created_at, id",
        )
        .all(projectId)
        .map(conflictFromRow);
    },

    resolveConflict(projectId, conflictId, resolution) {
      if (!["keep_local", "use_incoming"].includes(resolution)) {
        throw new Error("A valid conflict resolution is required.");
      }
      return transaction(db, () => {
        const row = db
          .prepare(
            "SELECT * FROM cly_dev_sync_conflicts WHERE id = ? AND project_id = ?",
          )
          .get(conflictId, projectId);
        if (!row)
          throw new Error("Sync conflict was not found in this project.");
        if (row.state !== "pending") return conflictFromRow(row);
        const timestamp = now();
        if (resolution === "use_incoming") {
          const incoming = db
            .prepare("SELECT * FROM cly_dev_sync_inbox WHERE envelope_id = ?")
            .get(row.incoming_envelope_id);
          db.prepare(
            `UPDATE cly_dev_sync_heads SET revision = ?, source_device_id = ?,
             envelope_id = ?, updated_at = ?
             WHERE project_id = ? AND record_kind = ? AND record_id = ?`,
          ).run(
            incoming.revision,
            incoming.sender_device_id,
            incoming.envelope_id,
            timestamp,
            projectId,
            row.record_kind,
            row.record_id,
          );
          db.prepare(
            "UPDATE cly_dev_sync_inbox SET status = 'applied', applied_at = ? WHERE envelope_id = ?",
          ).run(timestamp, incoming.envelope_id);
        } else {
          db.prepare(
            "UPDATE cly_dev_sync_inbox SET status = 'rejected' WHERE envelope_id = ?",
          ).run(row.incoming_envelope_id);
        }
        db.prepare(
          "UPDATE cly_dev_sync_conflicts SET state = ?, resolved_at = ? WHERE id = ?",
        ).run(resolution, timestamp, conflictId);
        insertAudit(
          "sync.conflict_resolved",
          {
            resolution,
            recordKind: row.record_kind,
            localRevision: row.local_revision,
            incomingRevision: row.incoming_revision,
          },
          { projectId },
        );
        return conflictFromRow(
          db
            .prepare("SELECT * FROM cly_dev_sync_conflicts WHERE id = ?")
            .get(conflictId),
        );
      });
    },

    getHead(projectId, recordKind, recordId) {
      const row = db
        .prepare(
          `SELECT * FROM cly_dev_sync_heads
           WHERE project_id = ? AND record_kind = ? AND record_id = ?`,
        )
        .get(projectId, recordKind, recordId);
      return row
        ? {
            projectId: row.project_id,
            recordKind: row.record_kind,
            recordId: row.record_id,
            revision: row.revision,
            sourceDeviceId: row.source_device_id,
            envelopeId: row.envelope_id,
            updatedAt: row.updated_at,
          }
        : null;
    },

    updateCursor(
      projectId,
      deviceId,
      direction,
      { cursor, status, errorCode = null },
    ) {
      if (!["push", "pull"].includes(direction))
        throw new Error("Invalid sync cursor direction.");
      const timestamp = now();
      db.prepare(
        `INSERT INTO cly_dev_sync_cursors
         (project_id, device_id, direction, cursor, last_sync_at, status, error_code, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id, device_id, direction) DO UPDATE SET
           cursor = excluded.cursor, last_sync_at = excluded.last_sync_at,
           status = excluded.status, error_code = excluded.error_code,
           updated_at = excluded.updated_at`,
      ).run(
        projectId,
        deviceId,
        direction,
        String(cursor),
        status === "complete" ? timestamp : null,
        status,
        errorCode,
        timestamp,
      );
    },

    getStatus(projectId) {
      const counts = db
        .prepare(
          `SELECT
             SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
             SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
             SUM(CASE WHEN status = 'policy_blocked' THEN 1 ELSE 0 END) AS blocked
           FROM cly_dev_sync_outbox WHERE project_id = ?`,
        )
        .get(projectId);
      const conflicts = db
        .prepare(
          "SELECT COUNT(*) AS count FROM cly_dev_sync_conflicts WHERE project_id = ? AND state = 'pending'",
        )
        .get(projectId).count;
      const lastSync = db
        .prepare(
          "SELECT MAX(last_sync_at) AS value FROM cly_dev_sync_cursors WHERE project_id = ?",
        )
        .get(projectId).value;
      return {
        pendingChanges: counts.pending ?? 0,
        failedChanges: counts.failed ?? 0,
        policyBlocked: counts.blocked ?? 0,
        conflictCount: conflicts,
        lastSyncAt: lastSync ?? null,
      };
    },

    recordAudit(action, metadata, options) {
      return transaction(db, () => insertAudit(action, metadata, options));
    },

    listAuditEvents(limit = 100) {
      return db
        .prepare(
          "SELECT * FROM cly_dev_sync_audit ORDER BY created_at DESC, id DESC LIMIT ?",
        )
        .all(Math.max(1, Math.min(500, Number(limit) || 100)))
        .map((row) => ({
          id: row.id,
          projectId: row.project_id,
          action: row.action,
          actorDeviceId: row.actor_device_id,
          subjectDeviceId: row.subject_device_id,
          metadata: parse(row.metadata_json),
          createdAt: row.created_at,
        }));
    },
  };

  return repository;
}
