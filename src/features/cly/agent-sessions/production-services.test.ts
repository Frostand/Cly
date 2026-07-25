import { describe, expect, it, vi } from "vitest";
import { createProductionAgentSessionServices } from "./production-services";

describe("production agent-session services", () => {
  it("does not request session pages before a project is selected", async () => {
    const fetchClyDevSessionOverviews = vi.fn();
    const services = createProductionAgentSessionServices({
      api: { fetchClyDevSessionOverviews } as never,
    });

    await expect(services.hydrate("")).resolves.toEqual([]);
    expect(fetchClyDevSessionOverviews).not.toHaveBeenCalled();
  });

  it("hydrates one lightweight overview projection without renderer recovery or N+1 snapshot reads", async () => {
    const api = {
      fetchClyDevSessionOverviews: vi.fn().mockResolvedValue({
        items: [{ id: "session-1", state: "running", lastSequence: 4 }],
        nextOffset: null,
      }),
      fetchClyDevSessionSnapshot: vi.fn().mockResolvedValue({
        id: "session-1",
        state: "resumable",
        events: [],
      }),
      createClyDevSessionAggregate: vi.fn(),
      startClyDevSession: vi.fn(),
      appendClyDevSessionEvent: vi.fn(),
      fetchClyDevSessionEvents: vi.fn(),
    };
    const services = createProductionAgentSessionServices({ api });

    await expect(services.hydrate("project-a")).resolves.toEqual([
      expect.objectContaining({ id: "session-1", state: "running" }),
    ]);
    expect(api.fetchClyDevSessionOverviews).toHaveBeenCalledWith(
      "project-a",
      0,
      50,
    );
    expect(api.fetchClyDevSessionSnapshot).not.toHaveBeenCalled();
  });

  it("hydrates every bounded overview page so sessions after the first 50 remain accessible", async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      id: `session-${index + 1}`,
    }));
    const finalPage = Array.from({ length: 5 }, (_, index) => ({
      id: `session-${index + 51}`,
    }));
    const fetchClyDevSessionOverviews = vi
      .fn()
      .mockResolvedValueOnce({ items: firstPage, nextOffset: 50 })
      .mockResolvedValueOnce({ items: finalPage, nextOffset: null });
    const services = createProductionAgentSessionServices({
      api: {
        fetchClyDevSessionOverviews,
      } as never,
    });

    const sessions = await services.hydrate("project-a");

    expect(sessions).toHaveLength(55);
    expect(sessions.at(-1)).toMatchObject({ id: "session-55" });
    expect(fetchClyDevSessionOverviews).toHaveBeenNthCalledWith(
      1,
      "project-a",
      0,
      50,
    );
    expect(fetchClyDevSessionOverviews).toHaveBeenNthCalledWith(
      2,
      "project-a",
      50,
      50,
    );
  });

  it("creates the workspace, context boundary, task, and session through one atomic API", async () => {
    const createClyDevSessionAggregate = vi.fn().mockResolvedValue({
      session: { id: "session-1" },
    });
    const services = createProductionAgentSessionServices({
      api: { createClyDevSessionAggregate } as never,
    });
    const input = {
      workspace: { idempotencyKey: "workspace-key" },
      contextManifest: { idempotencyKey: "context-key" },
      task: { idempotencyKey: "task-key" },
      session: { idempotencyKey: "session-key" },
    };

    await expect(
      services.createSession("project-a", input as never),
    ).resolves.toEqual({
      id: "session-1",
    });
    expect(createClyDevSessionAggregate).toHaveBeenCalledWith(
      "project-a",
      input,
    );
  });

  it("starts a real provider session through the server-owned aggregate boundary", async () => {
    const startClyDevSession = vi.fn().mockResolvedValue({
      session: { id: "session-started" },
      execution: { status: "completed" },
    });
    const services = createProductionAgentSessionServices({
      api: { startClyDevSession } as never,
    });
    const input = {
      title: "Fix CLY-71",
      objective: "Create the production task start flow.",
      provider: { id: "openai-codex" as const, model: "gpt-5" },
      researchObjectIds: ["claim-1"],
    };

    await expect(
      services.startSession("project-a", input),
    ).resolves.toMatchObject({
      session: { id: "session-started" },
      execution: { status: "completed" },
    });
    expect(startClyDevSession).toHaveBeenCalledWith("project-a", input);
  });

  it("persists approval decisions as idempotent ordered events", async () => {
    const appendClyDevSessionEvent = vi.fn().mockResolvedValue({ sequence: 7 });
    const respondToClyDevApproval = vi.fn().mockResolvedValue({
      handled: false,
      status: "not-found",
    });
    const services = createProductionAgentSessionServices({
      api: {
        appendClyDevSessionEvent,
        respondToClyDevApproval,
      } as never,
      idempotencyKey: () => "key-1",
      now: () => "2026-07-15T12:00:00.000Z",
    });

    await services.resolveApproval(
      "project-a",
      "session-1",
      "approval-1",
      "approved",
    );

    expect(appendClyDevSessionEvent).toHaveBeenCalledWith(
      "project-a",
      "session-1",
      expect.objectContaining({
        idempotencyKey: "key-1",
        type: "approval.resolved",
        actor: { kind: "user", id: "local-user" },
        payload: {
          approvalId: "approval-1",
          state: "approved",
          resolvedBy: "local-user",
        },
      }),
    );
    expect(respondToClyDevApproval).toHaveBeenCalledWith({
      approved: true,
      id: "approval-1",
      reason: null,
      scope: "once",
    });
  });

  it("lets the live approval broker own the durable resolution while execution is active", async () => {
    const appendClyDevSessionEvent = vi.fn();
    const respondToClyDevApproval = vi.fn().mockResolvedValue({
      handled: true,
      status: "ok",
    });
    const services = createProductionAgentSessionServices({
      api: { appendClyDevSessionEvent, respondToClyDevApproval },
    });

    await expect(
      services.resolveApproval(
        "project-a",
        "session-1",
        "approval-1",
        "approved",
      ),
    ).resolves.toEqual({ handled: true, status: "ok" });
    expect(appendClyDevSessionEvent).not.toHaveBeenCalled();
  });
});
