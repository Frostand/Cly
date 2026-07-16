import { getStateDatabase } from "../../persisted-state.js";
import { createClyDevSessionRepository } from "./session-repository.js";
import {
  clyDevContextManifestInputSchema,
  clyDevEventInputSchema,
  clyDevEventsQuerySchema,
  clyDevSessionAggregateInputSchema,
  clyDevSessionInputSchema,
  clyDevTaskInputSchema,
  clyDevWorkspaceInputSchema,
} from "./session-schema.js";

async function parseBody(c, schema) {
  try {
    const parsed = schema.safeParse(await c.req.json());
    return parsed.success
      ? { data: parsed.data }
      : { error: c.text(parsed.error.message, 400) };
  } catch {
    return { error: c.text("Invalid JSON payload.", 400) };
  }
}

const respond = (c, operation, successStatus = 200) => {
  try {
    return c.json(operation(), successStatus);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Cly Dev session request failed.";
    return c.text(message, /not found/i.test(message) ? 404 : 400);
  }
};

export function registerClyDevSessionRoutes(
  app,
  {
    getRepository = () =>
      createClyDevSessionRepository({ db: getStateDatabase() }),
  } = {},
) {
  app.get("/api/projects/:projectId/cly-dev/workspaces", (c) =>
    respond(c, () => getRepository().listWorkspaces(c.req.param("projectId"))),
  );
  app.post("/api/projects/:projectId/cly-dev/workspaces", async (c) => {
    const body = await parseBody(c, clyDevWorkspaceInputSchema);
    if (body.error) return body.error;
    return respond(
      c,
      () =>
        getRepository().createWorkspace(c.req.param("projectId"), body.data),
      201,
    );
  });
  app.get(
    "/api/projects/:projectId/cly-dev/workspaces/:workspaceId/tasks",
    (c) =>
      respond(c, () =>
        getRepository().listTasks(
          c.req.param("projectId"),
          c.req.param("workspaceId"),
        ),
      ),
  );
  app.post(
    "/api/projects/:projectId/cly-dev/workspaces/:workspaceId/context-manifests",
    async (c) => {
      const body = await parseBody(c, clyDevContextManifestInputSchema);
      if (body.error) return body.error;
      return respond(
        c,
        () =>
          getRepository().createContextManifest(
            c.req.param("projectId"),
            c.req.param("workspaceId"),
            body.data,
          ),
        201,
      );
    },
  );
  app.get(
    "/api/projects/:projectId/cly-dev/context-manifests/:manifestId",
    (c) =>
      respond(c, () =>
        getRepository().getContextManifest(
          c.req.param("projectId"),
          c.req.param("manifestId"),
        ),
      ),
  );
  app.post(
    "/api/projects/:projectId/cly-dev/workspaces/:workspaceId/tasks",
    async (c) => {
      const body = await parseBody(c, clyDevTaskInputSchema);
      if (body.error) return body.error;
      return respond(
        c,
        () =>
          getRepository().createTask(
            c.req.param("projectId"),
            c.req.param("workspaceId"),
            body.data,
          ),
        201,
      );
    },
  );
  app.get("/api/projects/:projectId/cly-dev/sessions", (c) =>
    respond(c, () =>
      getRepository().listSessionOverviews(c.req.param("projectId")),
    ),
  );
  app.post("/api/projects/:projectId/cly-dev/session-aggregates", async (c) => {
    const body = await parseBody(c, clyDevSessionAggregateInputSchema);
    if (body.error) return body.error;
    return respond(
      c,
      () =>
        getRepository().createSessionAggregate(
          c.req.param("projectId"),
          body.data,
        ),
      201,
    );
  });
  app.post(
    "/api/projects/:projectId/cly-dev/tasks/:taskId/sessions",
    async (c) => {
      const body = await parseBody(c, clyDevSessionInputSchema);
      if (body.error) return body.error;
      return respond(
        c,
        () =>
          getRepository().createSession(
            c.req.param("projectId"),
            c.req.param("taskId"),
            body.data,
          ),
        201,
      );
    },
  );
  app.get("/api/projects/:projectId/cly-dev/sessions/:sessionId", (c) =>
    respond(c, () =>
      getRepository().getSnapshot(
        c.req.param("projectId"),
        c.req.param("sessionId"),
      ),
    ),
  );
  app.get(
    "/api/projects/:projectId/cly-dev/sessions/:sessionId/events",
    (c) => {
      const parsed = clyDevEventsQuerySchema.safeParse({
        afterSequence: c.req.query("afterSequence") ?? undefined,
      });
      if (!parsed.success) return c.text(parsed.error.message, 400);
      return respond(c, () =>
        getRepository().listEvents(
          c.req.param("projectId"),
          c.req.param("sessionId"),
          parsed.data.afterSequence,
          parsed.data.limit,
        ),
      );
    },
  );
  app.post(
    "/api/projects/:projectId/cly-dev/sessions/:sessionId/events",
    async (c) => {
      const body = await parseBody(c, clyDevEventInputSchema);
      if (body.error) return body.error;
      return respond(
        c,
        () =>
          getRepository().appendEvent(
            c.req.param("projectId"),
            c.req.param("sessionId"),
            body.data,
          ),
        201,
      );
    },
  );
}
