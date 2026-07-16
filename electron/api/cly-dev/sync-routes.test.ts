// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { generateDeviceKeyMaterial } from "./sync-crypto.js";
import { registerClyDevSyncRoutes } from "./sync-routes.js";

function setup(service: Record<string, unknown>) {
  const app = new Hono();
  registerClyDevSyncRoutes(app, { getService: () => service });
  return app;
}

const jsonRequest = (url: string, body: unknown, method = "POST") =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("Cly Dev sync routes", () => {
  it("exposes status and bounded encrypted batch operations", async () => {
    const status = vi.fn().mockResolvedValue({
      pendingChanges: 2,
      localOnlyItems: 1,
      devices: [],
    });
    const stage = vi.fn().mockResolvedValue({ queued: 2, policyBlocked: 0 });
    const exportBatch = vi.fn().mockResolvedValue({
      items: [{ envelopeId: "envelope-1", envelope: { ciphertext: {} } }],
      bytes: 512,
      quotaBlocked: 0,
    });
    const app = setup({ status, stage, exportBatch });

    const statusResponse = await app.request(
      "/api/projects/project-a/cly-dev/sync/status",
    );
    expect(statusResponse.status).toBe(200);
    expect(await statusResponse.json()).toMatchObject({ pendingChanges: 2 });

    const stageResponse = await app.request(
      jsonRequest("/api/projects/project-a/cly-dev/sync/stage", {}),
    );
    expect(stageResponse.status).toBe(200);
    expect(stage).toHaveBeenCalledWith("project-a");

    const exportResponse = await app.request(
      "/api/projects/project-a/cly-dev/sync/outbox?recipientDeviceId=device-b&maxRecords=20&maxBytes=4096",
    );
    expect(exportResponse.status).toBe(200);
    expect(exportBatch).toHaveBeenCalledWith("project-a", "device-b", {
      maxRecords: 20,
      maxBytes: 4096,
    });
  });

  it("validates pairing and never accepts a private key field", async () => {
    const registerDevice = vi.fn().mockResolvedValue({
      id: "device-b",
      trustState: "pending",
    });
    const app = setup({ registerDevice });
    const keys = generateDeviceKeyMaterial({ deviceId: "device-b" });

    const response = await app.request(
      jsonRequest("/api/cly-dev/devices", {
        id: "device-b",
        name: "Lab workstation",
        publicBundle: keys.publicBundle,
        privateKey: keys.privateBundle,
      }),
    );
    expect(response.status).toBe(400);
    expect(registerDevice).not.toHaveBeenCalled();
  });

  it("requires a verified fingerprint when accepting rotated peer keys", async () => {
    const verifyPeerKeyRotation = vi.fn().mockResolvedValue({
      id: "device-b",
      keyVersion: 2,
      trustState: "trusted",
    });
    const app = setup({ verifyPeerKeyRotation });
    const keys = generateDeviceKeyMaterial({
      deviceId: "device-b",
      keyVersion: 2,
    });
    const fingerprint = "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111";

    const response = await app.request(
      jsonRequest("/api/cly-dev/devices/device-b/keys/verify", {
        publicBundle: keys.publicBundle,
        fingerprint,
      }),
    );

    expect(response.status).toBe(200);
    expect(verifyPeerKeyRotation).toHaveBeenCalledWith(
      "device-b",
      keys.publicBundle,
      fingerprint,
    );
  });

  it("imports partial batches, acknowledges cursors, and resolves conflicts", async () => {
    const importBatch = vi.fn().mockResolvedValue({
      applied: 1,
      conflicts: 1,
      failed: 1,
      results: [],
    });
    const acknowledge = vi.fn().mockResolvedValue({ acknowledged: 2 });
    const resolveConflict = vi.fn().mockResolvedValue({
      id: "conflict-1",
      state: "keep_local",
    });
    const app = setup({ importBatch, acknowledge, resolveConflict });

    expect(
      (
        await app.request(
          jsonRequest("/api/projects/project-a/cly-dev/sync/import", {
            envelopes: [{ version: 1 }],
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(
          jsonRequest("/api/projects/project-a/cly-dev/sync/ack", {
            recipientDeviceId: "device-b",
            envelopeIds: ["one", "two"],
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(
          jsonRequest(
            "/api/projects/project-a/cly-dev/sync/conflicts/conflict-1",
            { resolution: "keep_local" },
          ),
        )
      ).status,
    ).toBe(200);
    expect(resolveConflict).toHaveBeenCalledWith(
      "project-a",
      "conflict-1",
      "keep_local",
    );
  });

  it("maps revoked devices, quota failures, and missing records to explicit statuses", async () => {
    const app = setup({
      exportBatch: vi.fn().mockRejectedValue(new Error("Device was revoked")),
      importBatch: vi.fn().mockRejectedValue(new Error("Batch exceeds quota")),
      resolveConflict: vi
        .fn()
        .mockRejectedValue(new Error("Conflict not found")),
    });

    expect(
      (
        await app.request(
          "/api/projects/project-a/cly-dev/sync/outbox?recipientDeviceId=device-b",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request(
          jsonRequest("/api/projects/project-a/cly-dev/sync/import", {
            envelopes: [],
          }),
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await app.request(
          jsonRequest(
            "/api/projects/project-a/cly-dev/sync/conflicts/missing",
            { resolution: "keep_local" },
          ),
        )
      ).status,
    ).toBe(404);
  });
});
