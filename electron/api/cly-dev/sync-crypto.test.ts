// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  decryptSyncEnvelope,
  deviceFingerprint,
  encryptSyncEnvelope,
  generateDeviceKeyMaterial,
  verifySyncEnvelope,
} from "./sync-crypto.js";

const metadata = {
  envelopeId: "envelope-1",
  projectId: "project-a",
  recordKind: "session-event",
  recordId: "session-1:4",
  revision: 4,
  baseRevision: 3,
  createdAt: "2026-07-16T12:00:00.000Z",
};

describe("Cly Dev sync crypto", () => {
  it("encrypts one payload for multiple recipients and signs its metadata", () => {
    const sender = generateDeviceKeyMaterial({
      deviceId: "device-a",
      keyVersion: 2,
    });
    const receiverB = generateDeviceKeyMaterial({ deviceId: "device-b" });
    const receiverC = generateDeviceKeyMaterial({ deviceId: "device-c" });
    const payload = {
      kind: "message.recorded",
      body: "The plaintext must never reach the relay.",
    };

    const envelope = encryptSyncEnvelope({
      sender,
      recipients: [receiverB.publicBundle, receiverC.publicBundle],
      metadata,
      payload,
    });

    expect(JSON.stringify(envelope)).not.toContain(payload.body);
    expect(envelope.recipients).toHaveLength(2);
    expect(verifySyncEnvelope({ envelope, sender: sender.publicBundle })).toBe(
      true,
    );
    expect(
      decryptSyncEnvelope({
        envelope,
        recipient: receiverB,
        sender: sender.publicBundle,
      }),
    ).toEqual(payload);
    expect(
      decryptSyncEnvelope({
        envelope,
        recipient: receiverC,
        sender: sender.publicBundle,
      }),
    ).toEqual(payload);
  });

  it("rejects signature, ciphertext, and recipient tampering", () => {
    const sender = generateDeviceKeyMaterial({ deviceId: "device-a" });
    const receiver = generateDeviceKeyMaterial({ deviceId: "device-b" });
    const stranger = generateDeviceKeyMaterial({ deviceId: "device-c" });
    const envelope = encryptSyncEnvelope({
      sender,
      recipients: [receiver.publicBundle],
      metadata,
      payload: { body: "secret" },
    });

    const changedMetadata = structuredClone(envelope);
    changedMetadata.metadata.recordId = "session-2:4";
    expect(() =>
      decryptSyncEnvelope({
        envelope: changedMetadata,
        recipient: receiver,
        sender: sender.publicBundle,
      }),
    ).toThrow(/signature/i);

    const changedCiphertext = structuredClone(envelope);
    changedCiphertext.ciphertext.bytes = `${envelope.ciphertext.bytes.slice(0, -2)}AA`;
    expect(() =>
      decryptSyncEnvelope({
        envelope: changedCiphertext,
        recipient: receiver,
        sender: sender.publicBundle,
      }),
    ).toThrow(/signature|authentication/i);

    expect(() =>
      decryptSyncEnvelope({
        envelope,
        recipient: stranger,
        sender: sender.publicBundle,
      }),
    ).toThrow(/recipient/i);
  });

  it("binds fingerprints and envelopes to key versions during rotation", () => {
    const versionOne = generateDeviceKeyMaterial({
      deviceId: "device-a",
      keyVersion: 1,
    });
    const versionTwo = generateDeviceKeyMaterial({
      deviceId: "device-a",
      keyVersion: 2,
    });
    const receiver = generateDeviceKeyMaterial({ deviceId: "device-b" });
    const envelope = encryptSyncEnvelope({
      sender: versionTwo,
      recipients: [receiver.publicBundle],
      metadata,
      payload: { body: "rotated" },
    });

    expect(deviceFingerprint(versionOne.publicBundle)).not.toBe(
      deviceFingerprint(versionTwo.publicBundle),
    );
    expect(() =>
      decryptSyncEnvelope({
        envelope,
        recipient: receiver,
        sender: versionOne.publicBundle,
      }),
    ).toThrow(/sender|signature/i);
    expect(
      decryptSyncEnvelope({
        envelope,
        recipient: receiver,
        sender: versionTwo.publicBundle,
      }),
    ).toEqual({ body: "rotated" });
  });
});
