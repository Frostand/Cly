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

  it("creates a server-derived durable aggregate and starts its selected provider without blocking the approval UI", async () => {
    const createSessionAggregate = vi.fn(() => ({
      session: { id: "session-started" },
      workspace: { id: "workspace-started" },
      contextManifest: { id: "manifest-started" },
      task: { id: "task-started" },
    }));
    const execute = vi.fn(async () => ({ status: "completed" }));
    const resolveSessionStartContext = vi.fn(async () => ({
      project: { id: "project-a", name: "Research project" },
      workspace: {
        repositoryPath: "/authorized/project",
        worktreePath: "/authorized/project",
        branch: "feature/start",
        commitSha: "a".repeat(40),
      },
      machine: {
        id: "local-machine",
        platform: "darwin",
        architecture: "arm64",
      },
    }));
    const app = new Hono();
    registerClyDevSessionRoutes(app, {
      getRepository: () => ({ createSessionAggregate }),
      getRuntime: () => ({ execute, cancel: vi.fn(), resume: vi.fn() }),
      resolveSessionStartContext,
    });

    const response = await app.request(
      "/api/projects/project-a/cly-dev/session-starts",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Fix task creation",
          objective:
            "Start a production provider task and preserve its evidence.",
          linearIssue: "CLY-71",
          provider: {
            id: "anthropic-claude",
            model: "claude-sonnet-4-6",
          },
          researchObjectIds: ["claim-1", "experiment-1", "claim-1"],
          budget: { maxTotalTokens: 12000 },
        }),
      },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      session: { id: "session-started" },
      execution: { status: "queued", requestId: expect.any(String) },
    });
    expect(resolveSessionStartContext).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-a",
        researchObjectIds: ["claim-1", "experiment-1", "claim-1"],
      }),
    );
    expect(createSessionAggregate).toHaveBeenCalledWith(
      "project-a",
      expect.objectContaining({
        task: expect.objectContaining({
          title: "Fix task creation (CLY-71)",
          researchObjectIds: ["claim-1", "experiment-1"],
        }),
        contextManifest: expect.objectContaining({
          transferable: {
            summary: "Task context for Fix task creation (CLY-71).",
            entries: [
              { kind: "research_object", researchObjectId: "claim-1" },
              { kind: "research_object", researchObjectId: "experiment-1" },
            ],
          },
        }),
      }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-a",
        sessionId: "session-started",
        prompt: "Start a production provider task and preserve its evidence.",
        mode: "execute",
        budget: { maxTotalTokens: 12000 },
      }),
    );
  });

  it("returns the durable session immediately while provider failures are recorded in its log", async () => {
    const createSessionAggregate = vi.fn(() => ({
      session: { id: "session-failed" },
      workspace: { id: "workspace-failed" },
      contextManifest: { id: "manifest-failed" },
      task: { id: "task-failed" },
    }));
    const app = new Hono();
    registerClyDevSessionRoutes(app, {
      getRepository: () => ({ createSessionAggregate }),
      getRuntime: () => ({
        execute: vi.fn(async () => ({
          status: "failed",
          error: {
            code: "AUTHENTICATION_EXPIRED",
            message: "Provider authentication has expired.",
            retryable: false,
          },
        })),
        cancel: vi.fn(),
        resume: vi.fn(),
      }),
      resolveSessionStartContext: async () => ({
        project: { id: "project-a", name: "Research project" },
        workspace: {
          repositoryPath: "/authorized/project",
          worktreePath: "/authorized/project",
          branch: "main",
          commitSha: "a".repeat(40),
        },
        machine: {
          id: "local-machine",
          platform: "darwin",
          architecture: "arm64",
        },
      }),
    });

    const response = await app.request(
      "/api/projects/project-a/cly-dev/session-starts",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Authenticate provider",
          objective: "Retry after signing in.",
          provider: { id: "openai-codex", model: "gpt-5" },
        }),
      },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      session: { id: "session-failed" },
      execution: { status: "queued", requestId: expect.any(String) },
    });
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
