// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalJson, hashHandoffPayload } from "./canonical-json.js";
import {
  clyDevHandoffEnvelopeSchema,
  migrateClyDevHandoffEnvelope,
  validateHandoffEnvelope,
} from "./handoff-schema.js";

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
      "utf8",
    ),
  );

describe("Cly Dev handoff schema", () => {
  it("accepts the comprehensive v1 golden record", () => {
    const envelope = fixture("valid-v1.json");
    expect(envelope.integrity.digest).toBe(
      hashHandoffPayload(envelope.payload),
    );
    expect(clyDevHandoffEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(validateHandoffEnvelope(envelope).payload).toEqual(envelope.payload);
  });

  it("canonicalizes deterministically and hashes payload only", () => {
    expect(canonicalJson({ z: 1, a: { d: 4, b: 2 }, list: [3, 1] })).toBe(
      '{"a":{"b":2,"d":4},"list":[3,1],"z":1}',
    );
    expect(hashHandoffPayload({ b: 2, a: 1 })).toBe(
      hashHandoffPayload({ a: 1, b: 2 }),
    );
    expect(() => canonicalJson({ value: Number.NaN })).toThrow(/finite/i);
    expect(() => canonicalJson({ missing: undefined })).toThrow(/undefined/i);
    expect(() => canonicalJson(Array(1))).toThrow(/undefined|sparse/i);
  });

  it("detects corruption and unsupported future versions safely", () => {
    const envelope = fixture("valid-v1.json");
    envelope.integrity.digest = hashHandoffPayload(envelope.payload);
    envelope.payload.goal.objective = "corrupted after hashing";
    expect(() => validateHandoffEnvelope(envelope)).toThrow(/integrity/i);

    const future = { ...envelope, schemaVersion: 99, minimumReaderVersion: 99 };
    expect(() => validateHandoffEnvelope(future)).toThrow(/upgrade|version/i);
  });

  it.each([
    ["credential", { credential: "abc" }],
    ["token", { nested: { accessToken: "abc" } }],
    ["secret", { nested: [{ client_secret: "abc" }] }],
    ["terminal", { terminal: { id: "pty-1" } }],
    ["process", { progress: { processId: 123 } }],
    ["cache", { cacheDirectory: "relative-cache" }],
    ["dataset", { nested: { rawDataset: [1, 2] } }],
    ["environment", { env: { DEBUG: "1" } }],
    ["provider config", { providerConfiguration: { temperature: 1 } }],
    ["absolute path", { note: "/Users/example/private.txt" }],
    ["Windows path", { note: "C:\\Users\\example\\private.txt" }],
  ])("rejects restricted %s fields at any depth", (_label, injected) => {
    const envelope = fixture("valid-v1.json");
    Object.assign(envelope.payload.progress, injected);
    envelope.integrity.digest = hashHandoffPayload(envelope.payload);
    expect(() => clyDevHandoffEnvelopeSchema.parse(envelope)).toThrow();
  });

  it("migrates a supported older structured record", () => {
    const legacy = fixture("legacy-v0.json");
    expect(legacy.integrity.digest).toBe(hashHandoffPayload(legacy.payload));
    const migrated = migrateClyDevHandoffEnvelope(legacy);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.payload.goal.objective).toBe("Migrate this objective");
    expect(migrated.payload.summaries[0].sections).toEqual([
      "A legacy structured summary",
    ]);
    expect(migrated.payload.remainingWork[0].description).toBe(
      "Verify migration",
    );
    expect(validateHandoffEnvelope(legacy).schemaVersion).toBe(1);
  });

  it("keeps provider requirements neutral and capability-based", () => {
    const envelope = fixture("valid-v1.json");
    envelope.integrity.digest = hashHandoffPayload(envelope.payload);
    expect(envelope.payload.providerRequirements).toEqual({
      capabilities: ["tool_calls", "structured_output"],
    });
    expect(JSON.stringify(envelope.payload)).not.toContain("openai");
  });

  it("rejects credentials encoded in otherwise textual values", () => {
    const envelope = fixture("valid-v1.json");
    envelope.payload.repository.remoteUrl =
      "https://github.com/example/cly.git?access_token=abc";
    envelope.integrity.digest = hashHandoffPayload(envelope.payload);
    expect(() => clyDevHandoffEnvelopeSchema.parse(envelope)).toThrow();

    const textual = fixture("valid-v1.json");
    textual.payload.constraints.push("API_KEY=abc123");
    textual.integrity.digest = hashHandoffPayload(textual.payload);
    expect(() => clyDevHandoffEnvelopeSchema.parse(textual)).toThrow(
      /credential|secret|restricted/i,
    );
  });
});
