// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { registerClyDevHandoffRoutes } from "./handoff-routes.js";
import { ClyDevHandoffError } from "./handoff-service.js";

const request = (app: Hono, path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("Cly Dev handoff routes", () => {
  it.each([
    ["provider-authentication-failed", 401],
    ["device-revoked", 403],
    ["handoff-conflict", 409],
    ["transport-offline", 503],
  ])("maps %s to HTTP %s", async (code, status) => {
    const app = new Hono();
    registerClyDevHandoffRoutes(app, {
      getService: () => ({
        pairDevice: async () => {
          throw new ClyDevHandoffError(code, code);
        },
      }),
    });
    const response = await request(app, "/api/cly-dev/devices/pair", {
      deviceId: "machine-2",
      pairingCode: "123456",
    });
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });

  it("returns readiness mismatches as a blocked precondition", async () => {
    const app = new Hono();
    registerClyDevHandoffRoutes(app, {
      getService: () => ({
        inspect: async () => ({
          envelope: { handoffId: "handoff-1" },
          readiness: {
            status: "divergent-branch",
            blocking: true,
            checks: [],
            actions: ["create-worktree", "defer"],
          },
        }),
      }),
    });
    const response = await request(
      app,
      "/api/cly-dev/handoffs/handoff-1/inspect",
      {
        deviceId: "machine-2",
        destination: {
          path: "/repo",
          repositoryPath: "/repo",
          worktreePath: "/repo",
          requiredTools: [],
          machine: { id: "machine-2", platform: "darwin" },
        },
      },
    );
    expect(response.status).toBe(412);
    await expect(response.json()).resolves.toMatchObject({
      readiness: {
        status: "divergent-branch",
        actions: ["create-worktree", "defer"],
      },
    });
  });
});
