// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerClyDevWorkbenchRoutes } from "./workbench-routes.js";

describe("Cly Dev workbench routes", () => {
  it("validates commands and passes project/session scope to the service", async () => {
    const service = {
      getContext: vi.fn().mockResolvedValue({ session: { id: "session-a" } }),
      requestCommand: vi
        .fn()
        .mockResolvedValue({ status: "approval_required" }),
      executeCommand: vi.fn().mockResolvedValue({ status: "completed" }),
      cancelCommand: vi.fn().mockReturnValue(true),
    };
    const app = new Hono();
    registerClyDevWorkbenchRoutes(app, { getService: () => service });
    const root = "/api/projects/project-a/cly-dev/sessions/session-a/workbench";

    expect(await (await app.request(root)).json()).toEqual({
      session: { id: "session-a" },
    });
    expect(service.getContext).toHaveBeenCalledWith("project-a", "session-a");

    const invalid = await app.request(`${root}/commands/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "" }),
    });
    expect(invalid.status).toBe(400);

    const requested = await app.request(`${root}/commands/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: "request-a", command: "pnpm test" }),
    });
    expect(requested.status).toBe(200);
    expect(service.requestCommand).toHaveBeenCalledWith({
      projectId: "project-a",
      sessionId: "session-a",
      requestId: "request-a",
      command: "pnpm test",
    });

    const canceled = await app.request(`${root}/commands/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: "request-a" }),
    });
    expect(await canceled.json()).toEqual({ canceled: true });
  });
});
