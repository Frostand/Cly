// @vitest-environment node
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createContextRepository } from "./context-repository.js";
import { registerContextRoutes } from "./context-routes.js";

const projectId = "project/a";
const base = "/api/projects/project%2Fa/agent-context";

describe("agent context routes", () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let app: Hono;

  beforeEach(() => {
    repository = {
      snapshot: vi.fn(() => ({ items: [], packs: [], manifests: [] })),
      listAudit: vi.fn(() => []),
      createItem: vi.fn((_projectId, input) => ({ id: "item-1", ...input })),
      proposeRevision: vi.fn(() => ({ id: "item-1", version: 2 })),
      approveRevision: vi.fn(() => ({ id: "item-1", version: 3 })),
      setLifecycle: vi.fn(() => ({ id: "item-1", pinned: true })),
      savePack: vi.fn(() => ({ id: "pack-1" })),
      previewManifest: vi.fn(() => ({ sha256: "a".repeat(64) })),
      persistManifest: vi.fn(() => ({ id: "manifest-1" })),
      createTransmissionApproval: vi.fn(() => ({ id: "approval-1" })),
      revokeTransmissionApproval: vi.fn(() => ({ state: "revoked" })),
    };
    app = new Hono();
    registerContextRoutes(app, {
      getRepository: () =>
        repository as unknown as ReturnType<typeof createContextRepository>,
    });
  });

  it("exposes project-scoped snapshot, lifecycle, pack, preview, persist, and approval routes", async () => {
    expect((await app.request(base)).status).toBe(200);
    expect(repository.snapshot).toHaveBeenCalledWith(projectId);

    const itemBody = { label: "Memory" };
    expect(
      (
        await app.request(`${base}/items`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(itemBody),
        })
      ).status,
    ).toBe(201);
    expect(repository.createItem).toHaveBeenCalledWith(projectId, itemBody);

    const proposal = { expectedVersion: 1 };
    expect(
      (
        await app.request(`${base}/items/item-1/revisions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(proposal),
        })
      ).status,
    ).toBe(201);
    expect(repository.proposeRevision).toHaveBeenCalledWith(
      projectId,
      "item-1",
      proposal,
    );

    const approval = { expectedVersion: 2 };
    await app.request(`${base}/items/item-1/revisions/revision-2/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(approval),
    });
    expect(repository.approveRevision).toHaveBeenCalledWith(
      projectId,
      "item-1",
      "revision-2",
      approval,
    );

    const lifecycle = { action: "pin", expectedVersion: 3 };
    await app.request(`${base}/items/item-1/lifecycle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(lifecycle),
    });
    expect(repository.setLifecycle).toHaveBeenCalledWith(
      projectId,
      "item-1",
      lifecycle,
    );

    for (const [suffix, method, body, functionName] of [
      ["/packs", "PUT", { name: "Pack" }, "savePack"],
      ["/manifests/preview", "POST", { packId: "pack-1" }, "previewManifest"],
      ["/manifests", "POST", { packId: "pack-1" }, "persistManifest"],
      [
        "/approvals",
        "POST",
        { manifestSha256: "a".repeat(64) },
        "createTransmissionApproval",
      ],
    ] as const) {
      await app.request(`${base}${suffix}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(repository[functionName]).toHaveBeenCalledWith(projectId, body);
    }

    const revocation = { actorId: "user-1", rationale: "No longer needed" };
    expect(
      (
        await app.request(`${base}/approvals/approval-1/revoke`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(revocation),
        })
      ).status,
    ).toBe(200);
    expect(repository.revokeTransmissionApproval).toHaveBeenCalledWith(
      projectId,
      "approval-1",
      revocation,
    );
  });

  it("returns 409 for optimistic conflicts and 400 for invalid JSON", async () => {
    repository.setLifecycle.mockImplementation(() => {
      throw new Error("Agent context revision conflict.");
    });
    const conflict = await app.request(`${base}/items/item-1/lifecycle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "pin", expectedVersion: 1 }),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      error: "Agent context revision conflict.",
    });

    const invalid = await app.request(`${base}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect(invalid.status).toBe(400);
  });

  it.each([
    "Transmission approval is missing or revoked.",
    "Transmission approval has expired.",
    "Transmission approval scope does not match the manifest.",
  ])("fails closed on restricted persistence errors: %s", async (message) => {
    repository.persistManifest.mockImplementation(() => {
      throw new Error(message);
    });
    const response = await app.request(`${base}/manifests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        packId: "pack-1",
        transmissionApprovalId: "approval-1",
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: message });
  });
});
