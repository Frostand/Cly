// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assertProviderModelId,
  assertProviderProjectPath,
  normalizeProviderSessionId,
} from "./provider-inputs.js";

describe("provider launch input validation", () => {
  it("accepts detected model ids and rejects shell metacharacters", () => {
    expect(assertProviderModelId("gpt-5.6-sol[1m]")).toBe("gpt-5.6-sol[1m]");
    expect(() => assertProviderModelId("gpt-5; touch /tmp/pwned")).toThrow(
      /unsupported characters/i,
    );
    expect(() => assertProviderModelId("$(open -a Calculator)")).toThrow(
      /unsupported characters/i,
    );
  });

  it("requires absolute control-character-free project paths and safe sessions", () => {
    expect(assertProviderProjectPath("/tmp/research;safe-as-cwd")).toBe(
      "/tmp/research;safe-as-cwd",
    );
    expect(() => assertProviderProjectPath("../escape")).toThrow(/absolute/i);
    expect(() => assertProviderProjectPath("/tmp/bad\npath")).toThrow(/safe/i);
    expect(normalizeProviderSessionId("session_123-abc")).toBe(
      "session_123-abc",
    );
    expect(() => normalizeProviderSessionId("--resume=x;calc")).toThrow(
      /unsupported characters/i,
    );
  });
});
