// @vitest-environment node
import { describe, expect, it } from "vitest";

import { chatRequestBodySchema, chatTitleRequestBodySchema } from "./schema.js";

const request = {
  messages: [],
  model: "test-model",
  projectPath: "/tmp/project",
  provider: "openai",
};

describe("chat authority schema", () => {
  it("rejects renderer-requested full-access provider modes", () => {
    expect(
      chatRequestBodySchema.safeParse({
        ...request,
        codexPermissionMode: "full-access",
      }).success,
    ).toBe(false);
    expect(
      chatRequestBodySchema.safeParse({
        ...request,
        claudePermissionMode: "bypass-permissions",
      }).success,
    ).toBe(false);
  });

  it("rejects injected provider model ids and control characters in paths", () => {
    expect(
      chatRequestBodySchema.safeParse({
        ...request,
        model: "gpt-5.6-sol; touch /tmp/cly-canary",
      }).success,
    ).toBe(false);
    expect(
      chatRequestBodySchema.safeParse({
        ...request,
        projectPath: "/tmp/project\n--dangerously-skip-permissions",
      }).success,
    ).toBe(false);
    expect(
      chatRequestBodySchema.safeParse({
        ...request,
        projectPath: "relative/project",
      }).success,
    ).toBe(false);
    expect(
      chatRequestBodySchema.safeParse({
        ...request,
        projectPath: "/tmp/a project; still a valid directory",
      }).success,
    ).toBe(true);
  });

  it("applies the same launch-safe validation to title requests", () => {
    expect(
      chatTitleRequestBodySchema.safeParse({
        fallbackModel: "$(open -a Calculator)",
        projectPath: "/tmp/project",
        promptText: "A harmless title prompt",
        provider: "openai",
      }).success,
    ).toBe(false);
  });
});
