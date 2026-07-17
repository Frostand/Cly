// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerClyDevSessionRoutes } from "./session-routes.js";

describe("Cly Dev session routes", () => {
  it("rejects a workspace before persistence when its root lacks project authority", async () => {
    const createWorkspace = vi.fn();
    const resolveWorkspaceAuthority = vi.fn(async () => {
      throw new Error("projectPath does not match the persisted project.");
    });
    const app = new Hono();
    registerClyDevSessionRoutes(app, {
      getRepository: () => ({ createWorkspace }),
      resolveWorkspaceAuthority,
    });

    const response = await app.request(
      "/api/projects/project-a/cly-dev/workspaces",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 1,
          idempotencyKey: "workspace-a",
          name: "Workspace A",
          repository: { id: "repository-a" },
          worktree: { id: "worktree-a", branch: "main" },
          machine: { id: "machine-a", platform: "darwin" },
          localOnly: {
            repositoryPath: "/authorized/project",
            worktreePath: "/arbitrary/directory",
          },
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(resolveWorkspaceAuthority).toHaveBeenCalledWith({
      projectId: "project-a",
      localOnly: {
        repositoryPath: "/authorized/project",
        worktreePath: "/arbitrary/directory",
      },
    });
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it("revalidates a persisted session root before provider execution", async () => {
    const execute = vi.fn();
    const app = new Hono();
    registerClyDevSessionRoutes(app, {
      getRepository: () => ({
        getHandoffSource: () => ({
          workspace: {
            localOnly: {
              repositoryPath: "/authorized/project",
              worktreePath: "/stale/arbitrary/directory",
            },
          },
        }),
      }),
      getRuntime: () => ({ cancel: vi.fn(), execute, resume: vi.fn() }),
      resolveWorkspaceAuthority: async () => {
        throw new Error("projectPath does not match the persisted project.");
      },
    });

    const response = await app.request(
      "/api/projects/project-a/cly-dev/sessions/session-a/execute",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 1,
          payloadVersion: 1,
          requestId: "request-a",
          prompt: "Inspect the project",
          mode: "read_only",
          tools: [],
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes bounded event and overview pagination through HTTP", async () => {
    const listEvents = vi.fn().mockReturnValue([]);
    const listSessionOverviews = vi
      .fn()
      .mockReturnValue({ items: [], nextOffset: null });
    const app = new Hono();
    registerClyDevSessionRoutes(app, {
      getRepository: () => ({ listEvents, listSessionOverviews }),
    });

    expect(
      await (
        await app.request(
          "/api/projects/project-a/cly-dev/sessions/session-a/events?afterSequence=7&limit=3",
        )
      ).json(),
    ).toEqual([]);
    expect(listEvents).toHaveBeenCalledWith("project-a", "session-a", 7, 3);

    expect(
      await (
        await app.request(
          "/api/projects/project-a/cly-dev/sessions?offset=20&limit=10",
        )
      ).json(),
    ).toEqual({ items: [], nextOffset: null });
    expect(listSessionOverviews).toHaveBeenCalledWith("project-a", 20, 10);
  });

  it("rejects runtime-internal context manifest events on the public event route", async () => {
    const appendEvent = vi.fn();
    const app = new Hono();
    registerClyDevSessionRoutes(app, {
      getRepository: () => ({ appendEvent }),
      getRuntime: () => ({
        cancel: vi.fn(),
        execute: vi.fn(),
        resume: vi.fn(),
      }),
    });

    const response = await app.request(
      "/api/projects/project-a/cly-dev/sessions/session-a/events",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 1,
          payloadVersion: 1,
          idempotencyKey: "public-context-event",
          type: "context.manifest.recorded",
          transferability: "transferable",
          occurredAt: "2026-07-16T12:00:00.000Z",
          actor: { kind: "system", id: "external-caller" },
          payload: { manifestId: "manifest-a" },
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/runtime-internal/i);
    expect(appendEvent).not.toHaveBeenCalled();
  });
});
