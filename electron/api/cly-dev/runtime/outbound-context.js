import { createHash } from "node:crypto";
import { z } from "zod";
import {
  clyDevContextManifestInputSchema,
  commitIdentitySchema,
  machineIdentitySchema,
  providerIdentitySchema,
  repositoryIdentitySchema,
  worktreeIdentitySchema,
} from "../session-schema.js";

const VERSION = 1;
const TRANSFERABLE_CONTEXT_KINDS = [
  "research_object",
  "repository_file",
  "commit",
  "note",
];
const idSchema = z.string().trim().min(1).max(500);
const transferableShape =
  clyDevContextManifestInputSchema.shape.transferable.shape;
const outboundContextSchema = z
  .object({
    schemaVersion: z.literal(VERSION),
    kind: z.literal("cly.context_manifest"),
    manifest: z
      .object({
        id: idSchema,
        schemaVersion: z.literal(VERSION),
        summary: transferableShape.summary,
        entries: transferableShape.entries,
      })
      .strict(),
    provenance: z
      .object({
        repository: repositoryIdentitySchema,
        worktree: worktreeIdentitySchema,
        commit: commitIdentitySchema,
        machine: machineIdentitySchema,
        provider: providerIdentitySchema,
        research: z.object({ objectIds: z.array(idSchema) }).strict(),
      })
      .strict(),
  })
  .strict();
const forbiddenContextKey =
  /(?:password|secret|token|credential|api[_-]?key|environment(?:value|values)|absolute(?:path|paths)|cache|dataset|process|terminal|local[_-]?only|providerconfig)/i;
const forbiddenContextStrings = [
  /\bfile:\/\/\/?[^\s"'<>]+/i,
  /(?:^|[\s("'`[{=:,])\/(?!\/)(?:[^/\s"'<>]+\/)*[^/\s"'<>]+/i,
  /(?:^|[\s("'`[{=,])(?:[a-z]:[\\/]|\\\\)[^\s"'<>]+/i,
  /-----BEGIN [^-]*(?:PRIVATE|SECRET) KEY-----/i,
  /\bauthorization\s*[:=]\s*(?:(?:bearer|basic)\s+)?\S+/i,
  /\b(?:bearer|basic)\s+[a-z0-9+/._~=-]{4,}/i,
  /\b(?:sk-(?:ant-)?[a-z0-9_-]{6,}|gh[pousr]_[a-z0-9]{10,}|github_pat_[a-z0-9_]{10,}|glpat-[a-z0-9_-]{8,}|hf_[a-z0-9_-]{8,}|ya29\.[a-z0-9._-]{8,}|akia[0-9a-z]{16}|aiza[0-9a-z_-]{20,}|xox[baprs]-[a-z0-9-]{8,}|npm_[a-z0-9]{10,}|eyj[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,})\b/i,
  /\b(?:api[_ -]?key|access[_ -]?key|credential|secret|token|password|auth(?:entication)?)\b\s*(?::|=|\bis\b|\bwas\b|\bvalue\b|\bof\b)\s*["']?\S+/i,
  /\b(?:openai|anthropic|github|gitlab|aws|azure|google|slack|npm)\s+(?:api\s+)?(?:key|token|credential|secret)\s*(?::|=|\bis\b)\s*["']?\S+/i,
];

export const deriveTransferableContextSummary = (entries) => {
  if (!Array.isArray(entries)) {
    throw new TypeError("Transferable context entries must be an array.");
  }
  const counts = Object.fromEntries(
    TRANSFERABLE_CONTEXT_KINDS.map((kind) => [kind, 0]),
  );
  for (const entry of entries) {
    if (!entry || !TRANSFERABLE_CONTEXT_KINDS.includes(entry.kind)) {
      throw new TypeError(
        "Transferable context contains an unknown entry kind.",
      );
    }
    counts[entry.kind] += 1;
  }
  return `Cly Dev transferable context v1: entries=${entries.length}; research_object=${counts.research_object}; repository_file=${counts.repository_file}; commit=${counts.commit}; note=${counts.note}.`;
};

const hasForbiddenContextMaterial = (value) => {
  if (typeof value === "string") {
    return forbiddenContextStrings.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) return value.some(hasForbiddenContextMaterial);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, child]) =>
      forbiddenContextKey.test(key) || hasForbiddenContextMaterial(child),
  );
};

export const verifyNormalizedOutboundContext = (
  rawEnvelope,
  { manifestId } = {},
) => {
  const parsed = outboundContextSchema.safeParse(rawEnvelope);
  if (
    !parsed.success ||
    parsed.data.manifest.entries.some((entry) => entry.kind === "note") ||
    parsed.data.manifest.summary !==
      deriveTransferableContextSummary(parsed.data.manifest.entries) ||
    (manifestId !== undefined && parsed.data.manifest.id !== manifestId) ||
    hasForbiddenContextMaterial(parsed.data)
  ) {
    throw new Error(
      "Normalized outbound context failed strict provider-egress validation.",
    );
  }
  const envelope = parsed.data;
  const bytes = JSON.stringify(envelope);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { envelope, bytes, sha256 };
};

export const normalizeDurableOutboundContext = (rawEnvelope) => {
  const parsed = outboundContextSchema.safeParse(rawEnvelope);
  if (!parsed.success) {
    throw new Error("Durable context is not a strict source context envelope.");
  }
  const entries = parsed.data.manifest.entries.filter(
    (entry) => entry.kind !== "note",
  );
  return verifyNormalizedOutboundContext({
    ...parsed.data,
    manifest: {
      ...parsed.data.manifest,
      summary: deriveTransferableContextSummary(entries),
      entries,
    },
  });
};
