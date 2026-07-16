// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import {
  registerToolApprovalRoutes,
  waitForToolApproval,
} from "./tool-approvals.js";

describe("tool approval broker", () => {
  it("binds a decision to project, run, action arguments, and expiry", async () => {
    const app = new Hono();
    registerToolApprovalRoutes(app);
    const pending = waitForToolApproval({
      expiresInMs: 5_000,
      id: "approval-1",
      projectId: "project-1",
      provider: "openai",
      request: {
        input: { command: "pnpm test", cwd: "/tmp/project-1" },
        toolName: "runCommand",
      },
      runId: "run-1",
    });

    const response = await app.request("/api/tool-approval-response", {
      body: JSON.stringify({
        approved: true,
        id: "approval-1",
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
