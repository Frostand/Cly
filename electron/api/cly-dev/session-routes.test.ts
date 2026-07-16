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
});
