// @vitest-environment node
import { describe, expect, it } from "vitest";

import { chatRequestBodySchema } from "./schema.js";

const request = {
  messages: [],
  model: "test-model",
  projectId: "project-1",
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

  it("derives provider permissions from the authoritative agent mode", () => {
    expect(
      chatRequestBodySchema.parse({ ...request, agentMode: "plan" }),
    ).toMatchObject({
      agentMode: "plan",
      claudePermissionMode: "ask-permissions",
      codexPermissionMode: "default",
    });
    expect(
      chatRequestBodySchema.parse({ ...request, agentMode: "build" }),
    ).toMatchObject({
      agentMode: "build",
      claudePermissionMode: "accept-edits",
      codexPermissionMode: "auto-accept-edits",
    });
  });

  it("rejects permission modes that contradict plan mode", () => {
    expect(
      chatRequestBodySchema.safeParse({
        ...request,
        agentMode: "plan",
        claudePermissionMode: "accept-edits",
      }).success,
    ).toBe(false);
    expect(
      chatRequestBodySchema.safeParse({
        ...request,
        agentMode: "plan",
        codexPermissionMode: "auto-accept-edits",
      }).success,
    ).toBe(false);
  });

  it("rejects permission modes that contradict build mode", () => {
    expect(
      chatRequestBodySchema.safeParse({
        ...request,
        agentMode: "build",
        claudePermissionMode: "ask-permissions",
      }).success,
    ).toBe(false);
    expect(
      chatRequestBodySchema.safeParse({
        ...request,
        agentMode: "build",
        codexPermissionMode: "default",
      }).success,
    ).toBe(false);
  });

  it("keeps Cursor plan-only until its actions can be intercepted", () => {
    expect(
      chatRequestBodySchema.safeParse({
        ...request,
        provider: "cursor",
        agentMode: "build",
      }).success,
    ).toBe(false);
    expect(
      chatRequestBodySchema.safeParse({
        ...request,
        provider: "cursor",
        agentMode: "plan",
      }).success,
    ).toBe(true);
  });
});
