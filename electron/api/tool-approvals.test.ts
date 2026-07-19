// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import {
  createToolApprovalChallenge,
  registerToolApprovalRoutes,
  waitForToolApproval,
} from "./tool-approvals.js";

describe("tool approval broker", () => {
  it("binds a decision to project, run, action arguments, and expiry", async () => {
    const app = new Hono();
    registerToolApprovalRoutes(app);
    const approvalInput = {
      expiresInMs: 5_000,
      id: "approval-1",
      projectId: "project-1",
      provider: "openai",
      request: {
        input: { command: "pnpm test", cwd: "/tmp/project-1" },
        toolName: "runCommand",
      },
      runId: "run-1",
    };
    const challenge = createToolApprovalChallenge(approvalInput);
    const pending = waitForToolApproval({ ...approvalInput, challenge });

    const response = await app.request("/api/tool-approval-response", {
      body: JSON.stringify({
        approved: true,
        id: "approval-1",
        signature: challenge.signature,
        scope: "once",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      actionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      handled: true,
      projectId: "project-1",
      runId: "run-1",
    });
    await expect(pending).resolves.toMatchObject({
      actionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      approved: true,
      expiresAt: expect.any(Number),
      projectId: "project-1",
      runId: "run-1",
    });
  });

  it("rejects a response that is not bound to the pending action", async () => {
    const app = new Hono();
    registerToolApprovalRoutes(app);
    const controller = new AbortController();
    const approvalInput = {
      id: "approval-bound",
      projectId: "project-1",
      provider: "openai",
      request: { input: { command: "pnpm test" }, toolName: "runCommand" },
      runId: "run-1",
      signal: controller.signal,
    };
    const challenge = createToolApprovalChallenge(approvalInput);
    const pending = waitForToolApproval({ ...approvalInput, challenge });

    const response = await app.request("/api/tool-approval-response", {
      body: JSON.stringify({
        approved: true,
        id: approvalInput.id,
        signature: `${challenge.signature}-tampered`,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      handled: false,
      status: "binding-mismatch",
    });
    controller.abort();
    await expect(pending).resolves.toMatchObject({ approved: false });
  });

  it("expires unanswered approvals closed", async () => {
    const pending = waitForToolApproval({
      expiresInMs: 1,
      id: "approval-expiring",
      projectId: "project-1",
      provider: "anthropic",
      request: { input: { filePath: "results.txt" }, toolName: "writeFile" },
      runId: "run-1",
    });

    await expect(pending).resolves.toMatchObject({
      approved: false,
      reason: "Permission request expired.",
    });
  });

  it("rejects duplicate pending approval identifiers", async () => {
    const controller = new AbortController();
    const first = waitForToolApproval({
      id: "approval-duplicate",
      provider: "openai",
      request: { input: { command: "first" }, toolName: "runCommand" },
      signal: controller.signal,
    });
    await expect(
      waitForToolApproval({
        id: "approval-duplicate",
        provider: "openai",
        request: { input: { command: "second" }, toolName: "runCommand" },
      }),
    ).rejects.toThrow("already pending");
    controller.abort();
    await expect(first).resolves.toMatchObject({ approved: false });
  });
});
