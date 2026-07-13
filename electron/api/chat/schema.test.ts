// @vitest-environment node
import { describe, expect, it } from "vitest";

import { chatRequestBodySchema } from "./schema.js";

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
});
