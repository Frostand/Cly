// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerClyDevSessionRoutes } from "./session-routes.js";

describe("Cly Dev session routes", () => {
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
