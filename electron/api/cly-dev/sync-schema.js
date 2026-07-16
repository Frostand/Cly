import { createPublicKey } from "node:crypto";
import { z } from "zod";

const id = z.string().trim().min(1).max(500);
const encodedValue = z.string().min(32).max(16_384);
const spkiPublicKey = (asymmetricKeyType, label) =>
  encodedValue.superRefine((value, context) => {
    let publicKey;
    try {
      const decoded = Buffer.from(value, "base64");
      if (decoded.toString("base64") !== value)
        throw new Error("invalid base64");
      publicKey = createPublicKey({
        key: decoded,
        format: "der",
        type: "spki",
      });
    } catch {
      context.addIssue({
        code: "custom",
        message: `${label} must be a valid ${asymmetricKeyType} SPKI public key.`,
      });
      return;
    }
    if (publicKey.asymmetricKeyType !== asymmetricKeyType) {
      context.addIssue({
        code: "custom",
        message: `${label} must use the ${asymmetricKeyType} algorithm.`,
      });
    }
  });
const x25519PublicKey = spkiPublicKey("x25519", "Encryption key");
const ed25519PublicKey = spkiPublicKey("ed25519", "Signing key");
const encryptedValue = z
  .string()
  .min(8)
  .max(16 * 1024 * 1024);
const fingerprint = z
  .string()
  .regex(/^[A-F0-9]{4}(?:-[A-F0-9]{4}){7}$/i)
  .transform((value) => value.toUpperCase());

export const devicePublicBundleSchema = z
  .object({
    deviceId: id,
    keyVersion: z.number().int().min(1),
    encryptionKey: x25519PublicKey,
    signingKey: ed25519PublicKey,
  })
  .strict();

export const deviceRegistrationSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(200),
    publicBundle: devicePublicBundleSchema,
  })
  .strict()
  .refine((value) => value.id === value.publicBundle.deviceId, {
    message: "Device ID must match its public key bundle.",
  });

export const deviceVerificationSchema = z.object({ fingerprint }).strict();

export const deviceKeyRotationSchema = z
  .object({ publicBundle: devicePublicBundleSchema, fingerprint })
  .strict();

export const deviceRevocationSchema = z
  .object({ reason: z.string().trim().min(1).max(1_000) })
  .strict();

const encryptedBytes = z
  .object({ iv: encryptedValue, bytes: encryptedValue, tag: encryptedValue })
  .strict();

export const syncEnvelopeSchema = z
  .object({
    version: z.literal(1),
    algorithms: z
      .object({
        content: z.literal("aes-256-gcm"),
        keyAgreement: z.literal("x25519-hkdf-sha256"),
        signature: z.literal("ed25519"),
      })
      .strict(),
    metadata: z
      .object({
        envelopeId: id,
        projectId: id,
        recordKind: id,
        recordId: id,
        revision: z.number().int().min(1),
        baseRevision: z.number().int().min(0),
        createdAt: z.iso.datetime(),
      })
      .strict(),
    sender: z
      .object({ deviceId: id, keyVersion: z.number().int().min(1) })
      .strict(),
    recipients: z
      .array(
        z
          .object({
            deviceId: id,
            keyVersion: z.number().int().min(1),
            ephemeralPublicKey: encodedValue,
            iv: encryptedValue,
            bytes: encryptedValue,
            tag: encryptedValue,
          })
          .strict(),
      )
      .min(1)
      .max(100),
    ciphertext: encryptedBytes
      .extend({ sha256: z.string().regex(/^[a-f0-9]{64}$/i) })
      .strict(),
    signature: encodedValue,
  })
  .strict();

export const syncBatchOptionsSchema = z
  .object({
    maxRecords: z.number().int().min(1).max(500).default(100),
    maxBytes: z
      .number()
      .int()
      .min(1)
      .max(16 * 1024 * 1024)
      .default(2 * 1024 * 1024),
  })
  .strict();

export const syncConflictResolutionSchema = z
  .object({ resolution: z.enum(["keep_local", "use_incoming"]) })
  .strict();
