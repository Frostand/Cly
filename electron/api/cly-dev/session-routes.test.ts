// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerClyDevSessionRoutes } from "./session-routes.js";

describe("Cly Dev session routes", () => {
  it("launches only an authenticated live runtime model and records recoverable execution settings", async () => {
    const providers = [
      {
        family: "openai",
        id: "openai-codex",
        label: "Codex",
        authentication: "authenticated",
        capabilities: {
          streaming: true,
          reasoning: true,
          toolCalls: false,
          interceptBeforeEffect: false,
        },
        supportedModes: ["read_only"],
        models: [
          {
            id: "gpt-detected",
            label: "Detected model",
            reasoningEfforts: ["medium", "ultra"],
          },
        ],
      },
    ];
    const appendEvent = vi.fn();
    const createSessionLaunchAggregate = vi.fn().mockResolvedValue({
      workspace: { id: "workspace-1" },
      contextManifest: { id: "context-1" },
      task: { id: "task-1", objective: "Inspect the project" },
      session: { id: "session-1" },
    });
    const app = new Hono();
    registerClyDevSessionRoutes(app, {
      getDatabase: () => ({}) as never,
      getRepository: () => ({ appendEvent }) as never,
      getRuntime: () => ({
        listProviders: vi.fn().mockResolvedValue(providers),
      }),
      createSessionLaunchAggregate,
    });

    const status = await app.request("/api/cly-dev/providers");
    expect(await status.json()).toEqual(providers);
    const launched = await app.request(
      "/api/projects/project-a/cly-dev/session-launches",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 1,
          payloadVersion: 1,
          idempotencyKey: "launch-1",
          title: "Inspect",
          objective: "Inspect the project",
          mode: "read_only",
          provider: {
            id: "openai-codex",
            model: "gpt-detected",
            reasoningEffort: "ultra",
          },
        }),
      },
    );

    expect(launched.status).toBe(201);
    expect(await launched.json()).toMatchObject({
      session: { id: "session-1" },
      execution: { mode: "read_only", tools: [] },
    });
    expect(createSessionLaunchAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-a",
        input: expect.objectContaining({
          provider: expect.objectContaining({
            model: "gpt-detected",
            reasoningEffort: "ultra",
          }),
        }),
      }),
    );
    expect(appendEvent).toHaveBeenCalledWith(
      "project-a",
      "session-1",
      expect.objectContaining({
        type: "summary.recorded",
        payload: {
          title: "Execution settings",
          sections: ["mode:read_only"],
        },
      }),
    );
  });

  it("rejects a model that is not in the live runtime catalog", async () => {
    const app = new Hono();
    registerClyDevSessionRoutes(app, {
      getRuntime: () => ({
        listProviders: vi.fn().mockResolvedValue([
          {
            id: "openai-codex",
            authentication: "authenticated",
            supportedModes: ["read_only"],
            models: [{ id: "live-model", label: "Live", reasoningEfforts: [] }],
          },
        ]),
      }),
    });
    const response = await app.request(
      "/api/projects/project-a/cly-dev/session-launches",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 1,
          payloadVersion: 1,
          idempotencyKey: "launch-1",
          title: "Inspect",
          objective: "Inspect the project",
          mode: "read_only",
          provider: { id: "openai-codex", model: "invented-model" },
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/live provider catalog/i);
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
