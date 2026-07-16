import { randomUUID } from "node:crypto";
import {
  decryptSyncEnvelope,
  encryptSyncEnvelope,
  generateDeviceKeyMaterial,
} from "./sync-crypto.js";

const syncableTypes = new Set([
  "message.recorded",
  "summary.recorded",
  "plan.recorded",
  "progress.recorded",
  "decision.recorded",
  "remaining_work.recorded",
  "approval.requested",
  "approval.resolved",
  "session.state.changed",
  "context.manifest.recorded",
]);
const appendOnlyTypes = new Set(["message.recorded"]);

const errorCodeFor = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/revoked|not trusted/i.test(message)) return "device_revoked";
  if (/expired|key.*unavailable|key.*not found/i.test(message))
    return "expired_key";
  if (/quota|too (?:large|many)/i.test(message)) return "quota_exceeded";
  if (/signature|authentication|checksum|corrupt|JSON/i.test(message)) {
    return "corrupted_payload";
  }
  return "sync_failed";
};

function collectProjectRecords(sessionRepository, projectId) {
  const records = [];
  let localOnlyItems = 0;
  for (const session of sessionRepository.listSessions(projectId)) {
    const priorRevision = new Map();
    let afterSequence = 0;
    while (true) {
      const events = sessionRepository.listEvents(
        projectId,
        session.id,
        afterSequence,
        500,
      );
      for (const event of events) {
        if (
          event.transferability !== "transferable" ||
          !syncableTypes.has(event.type)
        ) {
          localOnlyItems += 1;
          continue;
        }
        const appendOnly = appendOnlyTypes.has(event.type);
        const recordId = appendOnly
          ? `${session.id}:${event.id}`
          : `${session.id}:${event.type}`;
        const revision = appendOnly ? 1 : event.sequence;
        const baseRevision = appendOnly
          ? 0
          : (priorRevision.get(recordId) ?? 0);
        priorRevision.set(recordId, revision);
        records.push({
          envelopeId: event.id,
          projectId,
          recordKind:
            event.type === "context.manifest.recorded"
              ? "context-manifest"
              : event.type === "message.recorded"
                ? "chat-message"
                : "handoff-state",
          recordId,
          revision,
          baseRevision,
          createdAt: event.recordedAt,
          payload: event.outboundEnvelope,
        });
      }
      if (events.length < 500) break;
      afterSequence = events.at(-1).sequence;
    }
  }
  return { records, localOnlyItems };
}

export function createClyDevSyncService({
  repository,
  sessionRepository,
  keyVault,
  now = () => new Date().toISOString(),
  deviceId = () => randomUUID(),
  credentialReference = () => `device-key-${randomUUID()}`,
  encryptEnvelope = encryptSyncEnvelope,
} = {}) {
  if (!repository || !sessionRepository || !keyVault) {
    throw new Error(
      "Sync repository, session repository, and device key vault are required.",
    );
  }

  const loadLocalKeyMaterial = async (keyVersion) => {
    const local = repository.getLocalDevice();
    if (!local)
      throw new Error("This Cly installation has no registered local device.");
    const version = keyVersion ?? local.keyVersion;
    const key = repository.getDeviceKey(local.id, version);
    if (!key.privateKeyRef)
      throw new Error("Local device key reference is unavailable.");
    const privateBundle = await keyVault.get(key.privateKeyRef);
    return {
      publicBundle: {
        deviceId: key.deviceId,
        keyVersion: key.keyVersion,
        encryptionKey: key.encryptionKey,
        signingKey: key.signingKey,
      },
      privateBundle,
    };
  };

  const service = {
    async ensureLocalDevice(name = "This device") {
      const existing = repository.getLocalDevice();
      if (existing) return existing;
      const vaultStatus = await keyVault.status();
      if (vaultStatus.state !== "available") {
        throw new Error(
          vaultStatus.state === "locked"
            ? "The operating-system credential store is locked."
            : "A secure operating-system credential store is unavailable.",
        );
      }
      const id = deviceId();
      const material = generateDeviceKeyMaterial({ deviceId: id });
      const reference = credentialReference();
      await keyVault.put(reference, material.privateBundle);
      try {
        return repository.ensureLocalDevice({
          id,
          name,
          privateKeyRef: reference,
          publicBundle: material.publicBundle,
        });
      } catch (error) {
        await keyVault.delete(reference);
        throw error;
      }
    },

    async registerDevice(input) {
      return repository.registerDevice(input);
    },

    async verifyDevice(id, fingerprint) {
      return repository.verifyDevice(id, fingerprint);
    },

    async verifyPeerKeyRotation(id, publicBundle, fingerprint) {
      return repository.rotatePeerDevice(id, { publicBundle, fingerprint });
    },

    async registerAndVerifyDevice(input, fingerprint) {
      await service.registerDevice({
        id: input.id,
        name: input.name,
        publicBundle: input.publicBundle,
      });
      return service.verifyDevice(input.id, fingerprint);
    },

    async rotateLocalKeys() {
      const local = await service.ensureLocalDevice();
      const material = generateDeviceKeyMaterial({
        deviceId: local.id,
        keyVersion: local.keyVersion + 1,
      });
      const reference = credentialReference();
      await keyVault.put(reference, material.privateBundle);
      try {
        return repository.rotateLocalDevice(local.id, {
          publicBundle: material.publicBundle,
          privateKeyRef: reference,
        });
      } catch (error) {
        await keyVault.delete(reference);
        throw error;
      }
    },

    async revokeDevice(id, reason) {
      return repository.revokeDevice(id, reason);
    },

    async devices() {
      await service.ensureLocalDevice();
      return repository.listDevices();
    },

    async preview(projectId) {
      const local = await service.ensureLocalDevice();
      const vaultStatus = await keyVault.status();
      const { records, localOnlyItems } = collectProjectRecords(
        sessionRepository,
        projectId,
      );
      const trusted = repository.listTrustedRecipients();
      const durable = repository.getStatus(projectId);
      const blockedByPolicy =
        records.length &&
        (trusted.length === 0 || vaultStatus.state !== "available")
          ? records.length
          : durable.policyBlocked;
      return {
        localDevice: local,
        devices: repository.listDevices(),
        keyStoreState: vaultStatus.state,
        approvedChanges: records.length,
        localOnlyItems,
        trustedDeviceCount: trusted.length,
        pendingChanges: durable.pendingChanges,
        failedChanges: durable.failedChanges,
        policyBlocked: blockedByPolicy,
        conflictCount: durable.conflictCount,
        conflicts: repository.listConflicts(projectId),
        lastSyncAt: durable.lastSyncAt,
      };
    },

    async stage(projectId) {
      await service.ensureLocalDevice();
      const recipients = repository.listTrustedRecipients();
      const { records } = collectProjectRecords(sessionRepository, projectId);
      if (!recipients.length) {
        return { queued: 0, policyBlocked: records.length };
      }
      const sender = await loadLocalKeyMaterial();
      let queued = 0;
      for (const record of records) {
        if (!record.payload) continue;
        for (const recipient of recipients) {
          if (
            repository.hasOutboxEnvelope(
              projectId,
              recipient.id,
              record.envelopeId,
            )
          ) {
            continue;
          }
          const envelope = encryptEnvelope({
            sender,
            recipients: [recipient.publicBundle],
            metadata: {
              envelopeId: record.envelopeId,
              projectId,
              recordKind: record.recordKind,
              recordId: record.recordId,
              revision: record.revision,
              baseRevision: record.baseRevision,
              createdAt: record.createdAt ?? now(),
            },
            payload: record.payload,
          });
          repository.queueEnvelope(projectId, recipient.id, envelope);
          queued += 1;
        }
      }
      return { queued, policyBlocked: 0 };
    },

    async exportBatch(projectId, recipientDeviceId, options) {
      const device = repository.getDevice(recipientDeviceId);
      if (device.trustState !== "trusted") {
        throw new Error(
          "A revoked or unverified device cannot fetch new sync state.",
        );
      }
      const batch = repository.listOutboxBatch(
        projectId,
        recipientDeviceId,
        options,
      );
      repository.updateCursor(projectId, recipientDeviceId, "push", {
        cursor: batch.items.at(-1)?.envelopeId ?? "",
        status: "syncing",
      });
      return batch;
    },

    async importBatch(projectId, envelopes) {
      if (!Array.isArray(envelopes) || envelopes.length > 500) {
        throw new Error("Sync batch contains too many records.");
      }
      const byteSize = Buffer.byteLength(JSON.stringify(envelopes));
      if (byteSize > 16 * 1024 * 1024) {
        throw new Error("Sync batch exceeds the quota.");
      }
      const local = await service.ensureLocalDevice();
      const results = [];
      for (const envelope of envelopes) {
        const envelopeId = envelope?.metadata?.envelopeId ?? "unknown";
        try {
          const senderKey = repository.getDeviceKey(
            envelope.sender.deviceId,
            envelope.sender.keyVersion,
          );
          if (
            senderKey.trustState !== "trusted" ||
            senderKey.keyState === "revoked"
          ) {
            throw new Error("Incoming sync sender is revoked or not trusted.");
          }
          const recipient = envelope.recipients.find(
            (item) => item.deviceId === local.id,
          );
          if (!recipient) throw new Error("Envelope has no local recipient.");
          const recipientMaterial = await loadLocalKeyMaterial(
            recipient.keyVersion,
          );
          decryptSyncEnvelope({
            envelope,
            recipient: recipientMaterial,
            sender: {
              deviceId: senderKey.deviceId,
              keyVersion: senderKey.keyVersion,
              encryptionKey: senderKey.encryptionKey,
              signingKey: senderKey.signingKey,
            },
          });
          const accepted = repository.acceptIncomingEnvelope(
            projectId,
            local.id,
            envelope,
          );
          results.push({ envelopeId, status: accepted.status });
        } catch (error) {
          results.push({
            envelopeId,
            status: "failed",
            errorCode: errorCodeFor(error),
          });
        }
      }
      const applied = results.filter(
        (item) => item.status === "applied",
      ).length;
      const conflicts = results.filter(
        (item) => item.status === "conflict",
      ).length;
      const failed = results.filter((item) => item.status === "failed").length;
      const lastSuccessful = results.findLast(
        (item) => item.status !== "failed",
      );
      repository.updateCursor(projectId, local.id, "pull", {
        cursor: lastSuccessful?.envelopeId ?? "",
        status: failed ? "failed" : "complete",
        errorCode: failed ? "partial_sync_failure" : null,
      });
      return { applied, conflicts, failed, results };
    },

    async readAppliedRecord(projectId, envelopeId) {
      const stored = repository.getIncomingEnvelope(envelopeId);
      if (stored.projectId !== projectId || stored.status !== "applied") {
        throw new Error("Synchronized record is not applied in this project.");
      }
      const envelope = stored.envelope;
      const senderKey = repository.getDeviceKey(
        envelope.sender.deviceId,
        envelope.sender.keyVersion,
      );
      if (
        senderKey.trustState !== "trusted" ||
        senderKey.keyState === "revoked"
      ) {
        throw new Error(
          "Synchronized record sender is revoked or not trusted.",
        );
      }
      const local = repository.getLocalDevice();
      const recipient = envelope.recipients.find(
        (item) => item.deviceId === local.id,
      );
      if (!recipient)
        throw new Error("Synchronized record has no local recipient.");
      return decryptSyncEnvelope({
        envelope,
        recipient: await loadLocalKeyMaterial(recipient.keyVersion),
        sender: {
          deviceId: senderKey.deviceId,
          keyVersion: senderKey.keyVersion,
          encryptionKey: senderKey.encryptionKey,
          signingKey: senderKey.signingKey,
        },
      });
    },

    async acknowledge(projectId, recipientDeviceId, envelopeIds) {
      const result = repository.acknowledge(
        projectId,
        recipientDeviceId,
        envelopeIds,
      );
      repository.updateCursor(projectId, recipientDeviceId, "push", {
        cursor: envelopeIds.at(-1) ?? "",
        status: "complete",
      });
      return result;
    },

    async resolveConflict(projectId, conflictId, resolution) {
      return repository.resolveConflict(projectId, conflictId, resolution);
    },

    async status(projectId) {
      return service.preview(projectId);
    },
  };

  return service;
}
