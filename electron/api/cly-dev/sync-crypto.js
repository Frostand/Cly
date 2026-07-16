import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  verify,
} from "node:crypto";

export const CLY_DEV_SYNC_ENVELOPE_VERSION = 1;
const CONTENT_ALGORITHM = "aes-256-gcm";
const AGREEMENT_ALGORITHM = "x25519-hkdf-sha256";
const SIGNATURE_ALGORITHM = "ed25519";

const asBase64 = (value) => Buffer.from(value).toString("base64");
const fromBase64 = (value) => Buffer.from(value, "base64");

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export const canonicalJson = (value) => JSON.stringify(canonicalValue(value));

const importPublicKey = (value) =>
  createPublicKey({ key: fromBase64(value), format: "der", type: "spki" });
const importPrivateKey = (value) =>
  createPrivateKey({ key: fromBase64(value), format: "der", type: "pkcs8" });
const exportPublicKey = (key) =>
  asBase64(key.export({ format: "der", type: "spki" }));
const exportPrivateKey = (key) =>
  asBase64(key.export({ format: "der", type: "pkcs8" }));

function encryptAes(key, plaintext, aad) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CONTENT_ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad));
  const bytes = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    iv: asBase64(iv),
    bytes: asBase64(bytes),
    tag: asBase64(cipher.getAuthTag()),
  };
}

function decryptAes(key, encrypted, aad) {
  const decipher = createDecipheriv(
    CONTENT_ALGORITHM,
    key,
    fromBase64(encrypted.iv),
  );
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(fromBase64(encrypted.tag));
  return Buffer.concat([
    decipher.update(fromBase64(encrypted.bytes)),
    decipher.final(),
  ]);
}

function publicKeyAgreementBundle(key) {
  return {
    encryptionKey: exportPublicKey(key.encryption.publicKey),
    signingKey: exportPublicKey(key.signing.publicKey),
  };
}

export function generateDeviceKeyMaterial({
  deviceId = "local-device",
  keyVersion = 1,
} = {}) {
  if (!deviceId || !Number.isInteger(keyVersion) || keyVersion < 1) {
    throw new Error("A device ID and positive key version are required.");
  }
  const encryption = generateKeyPairSync("x25519");
  const signing = generateKeyPairSync("ed25519");
  const publicKeys = publicKeyAgreementBundle({ encryption, signing });
  return {
    publicBundle: { deviceId, keyVersion, ...publicKeys },
    privateBundle: {
      deviceId,
      keyVersion,
      encryptionKey: exportPrivateKey(encryption.privateKey),
      signingKey: exportPrivateKey(signing.privateKey),
    },
  };
}

export function deviceFingerprint(publicBundle) {
  const digest = createHash("sha256")
    .update(
      canonicalJson({
        deviceId: publicBundle.deviceId,
        keyVersion: publicBundle.keyVersion,
        encryptionKey: publicBundle.encryptionKey,
        signingKey: publicBundle.signingKey,
      }),
    )
    .digest("hex")
    .toUpperCase();
  return digest
    .slice(0, 32)
    .match(/.{1,4}/g)
    .join("-");
}

function envelopeSigningBytes(envelope) {
  const { signature: _signature, ...unsigned } = envelope;
  return Buffer.from(canonicalJson(unsigned));
}

function sharedWrapKey({ privateKey, publicKey, metadata, sender, recipient }) {
  const secret = diffieHellman({
    privateKey,
    publicKey,
  });
  return Buffer.from(
    hkdfSync(
      "sha256",
      secret,
      Buffer.from(metadata.projectId),
      Buffer.from(
        canonicalJson({
          purpose: "cly-dev-sync-content-key",
          envelopeId: metadata.envelopeId,
          sender,
          recipient,
        }),
      ),
      32,
    ),
  );
}

export function encryptSyncEnvelope({ sender, recipients, metadata, payload }) {
  if (!recipients?.length) {
    throw new Error("At least one sync recipient is required.");
  }
  const senderIdentity = {
    deviceId: sender.publicBundle.deviceId,
    keyVersion: sender.publicBundle.keyVersion,
  };
  const header = {
    version: CLY_DEV_SYNC_ENVELOPE_VERSION,
    algorithms: {
      content: CONTENT_ALGORITHM,
      keyAgreement: AGREEMENT_ALGORITHM,
      signature: SIGNATURE_ALGORITHM,
    },
    metadata,
    sender: senderIdentity,
  };
  const payloadBytes = Buffer.from(canonicalJson(payload));
  const contentKey = randomBytes(32);
  const contentAad = canonicalJson(header);
  const ciphertext = {
    ...encryptAes(contentKey, payloadBytes, contentAad),
    sha256: createHash("sha256").update(payloadBytes).digest("hex"),
  };
  const recipientKeys = recipients.map((recipient) => {
    const ephemeral = generateKeyPairSync("x25519");
    const recipientIdentity = {
      deviceId: recipient.deviceId,
      keyVersion: recipient.keyVersion,
    };
    const wrapAad = canonicalJson({ ...header, recipient: recipientIdentity });
    const wrapKey = sharedWrapKey({
      privateKey: ephemeral.privateKey,
      publicKey: importPublicKey(recipient.encryptionKey),
      metadata,
      sender: senderIdentity,
      recipient: recipientIdentity,
    });
    return {
      ...recipientIdentity,
      ephemeralPublicKey: exportPublicKey(ephemeral.publicKey),
      ...encryptAes(wrapKey, contentKey, wrapAad),
    };
  });
  const unsigned = { ...header, recipients: recipientKeys, ciphertext };
  const signature = asBase64(
    sign(
      null,
      Buffer.from(canonicalJson(unsigned)),
      importPrivateKey(sender.privateBundle.signingKey),
    ),
  );
  return { ...unsigned, signature };
}

export function verifySyncEnvelope({ envelope, sender }) {
  if (
    envelope.version !== CLY_DEV_SYNC_ENVELOPE_VERSION ||
    envelope.sender.deviceId !== sender.deviceId ||
    envelope.sender.keyVersion !== sender.keyVersion
  ) {
    return false;
  }
  return verify(
    null,
    envelopeSigningBytes(envelope),
    importPublicKey(sender.signingKey),
    fromBase64(envelope.signature),
  );
}

export function decryptSyncEnvelope({ envelope, recipient, sender }) {
  if (!verifySyncEnvelope({ envelope, sender })) {
    throw new Error("Sync envelope signature or sender key is invalid.");
  }
  const wrapped = envelope.recipients.find(
    (item) =>
      item.deviceId === recipient.publicBundle.deviceId &&
      item.keyVersion === recipient.publicBundle.keyVersion,
  );
  if (!wrapped) {
    throw new Error("Sync envelope is not addressed to this recipient key.");
  }
  const recipientIdentity = {
    deviceId: wrapped.deviceId,
    keyVersion: wrapped.keyVersion,
  };
  const header = {
    version: envelope.version,
    algorithms: envelope.algorithms,
    metadata: envelope.metadata,
    sender: envelope.sender,
  };
  const wrapKey = sharedWrapKey({
    privateKey: importPrivateKey(recipient.privateBundle.encryptionKey),
    publicKey: importPublicKey(wrapped.ephemeralPublicKey),
    metadata: envelope.metadata,
    sender: envelope.sender,
    recipient: recipientIdentity,
  });
  let contentKey;
  let payloadBytes;
  try {
    contentKey = decryptAes(
      wrapKey,
      wrapped,
      canonicalJson({ ...header, recipient: recipientIdentity }),
    );
    payloadBytes = decryptAes(
      contentKey,
      envelope.ciphertext,
      canonicalJson(header),
    );
  } catch {
    throw new Error("Sync envelope authentication failed.");
  }
  const payloadSha256 = createHash("sha256").update(payloadBytes).digest("hex");
  if (payloadSha256 !== envelope.ciphertext.sha256) {
    throw new Error("Sync envelope payload checksum is invalid.");
  }
  try {
    return JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    throw new Error("Sync envelope payload is not valid JSON.");
  }
}
