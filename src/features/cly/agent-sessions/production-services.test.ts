import { describe, expect, it, vi } from "vitest";
import { createProductionAgentSessionServices } from "./production-services";

describe("production agent-session services", () => {
  it("hydrates one lightweight overview projection without renderer recovery or N+1 snapshot reads", async () => {
    const api = {
      fetchClyDevSessionOverviews: vi
        .fn()
        .mockResolvedValue([
          { id: "session-1", state: "running", lastSequence: 4 },
        ]),
      fetchClyDevSessionSnapshot: vi.fn().mockResolvedValue({
        id: "session-1",
        state: "resumable",
        events: [],
      }),
      createClyDevSessionAggregate: vi.fn(),
      appendClyDevSessionEvent: vi.fn(),
      fetchClyDevSessionEvents: vi.fn(),
    };
    const services = createProductionAgentSessionServices({ api });

    await expect(services.hydrate("project-a")).resolves.toEqual([
      expect.objectContaining({ id: "session-1", state: "running" }),
    ]);
    expect(api.fetchClyDevSessionOverviews).toHaveBeenCalledWith("project-a");
    expect(api.fetchClyDevSessionSnapshot).not.toHaveBeenCalled();
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

  it("persists approval decisions as idempotent ordered events", async () => {
    const appendClyDevSessionEvent = vi.fn().mockResolvedValue({ sequence: 7 });
    const services = createProductionAgentSessionServices({
      api: {
        appendClyDevSessionEvent,
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
  });
});
