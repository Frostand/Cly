import { getStateDatabase } from "../../persisted-state.js";
import {
  clyDevCancellationRequestSchema,
  clyDevExecutionRequestSchema,
} from "./runtime/execution-request-schema.js";
import { createProductionClyDevRuntime } from "./runtime/production-composition.js";
import { createClyDevSessionRepository } from "./session-repository.js";
import {
  clyDevContextManifestInputSchema,
  clyDevEventInputSchema,
  clyDevEventsQuerySchema,
  clyDevSessionAggregateInputSchema,
  clyDevSessionInputSchema,
  clyDevSessionOverviewQuerySchema,
  clyDevTaskInputSchema,
  clyDevWorkspaceInputSchema,
} from "./session-schema.js";

async function parseBody(c, schema) {
  try {
    const value = await c.req.json();
    if (value?.type === "context.manifest.recorded") {
      return {
        error: c.text(
          "context.manifest.recorded is runtime-internal and cannot be appended through the public event route.",
          400,
        ),
      };
    }
    const parsed = schema.safeParse(value);
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
    getDatabase = getStateDatabase,
    getRepository = () => createClyDevSessionRepository({ db: getDatabase() }),
    getRuntime,
    runner,
    claudeRunner,
    executeTool,
    durableToolEffects,
    requestApproval,
    now,
  } = {},
) {
  let productionRuntime;
  const resolveRuntime = () => {
    if (getRuntime) return getRuntime();
    if (!productionRuntime) {
      productionRuntime = createProductionClyDevRuntime({
        db: getDatabase(),
        runner,
        claudeRunner,
        executeTool,
        durableToolEffects,
        requestApproval,
        now,
      });
    }
    return productionRuntime;
  };
  const executeRequest = (operation) => async (c) => {
    const body = await parseBody(c, clyDevExecutionRequestSchema);
    if (body.error) return body.error;
    try {
      const result = await resolveRuntime()[operation]({
        ...body.data,
        projectId: c.req.param("projectId"),
        sessionId: c.req.param("sessionId"),
        signal: c.req.raw.signal,
      });
      return c.json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Cly Dev execution failed.";
      return c.text(message, /not found/i.test(message) ? 404 : 400);
    }
  };

  app.post(
    "/api/projects/:projectId/cly-dev/sessions/:sessionId/execute",
    executeRequest("execute"),
  );
  app.post(
    "/api/projects/:projectId/cly-dev/sessions/:sessionId/resume",
    executeRequest("resume"),
  );
  app.post(
    "/api/projects/:projectId/cly-dev/sessions/:sessionId/cancel",
    async (c) => {
      const body = await parseBody(c, clyDevCancellationRequestSchema);
      if (body.error) return body.error;
      try {
        await resolveRuntime().cancel({
          projectId: c.req.param("projectId"),
          sessionId: c.req.param("sessionId"),
          requestId: body.data.requestId,
        });
        return c.json({ status: "cancellation_requested" });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Cancellation failed.";
        return c.text(message, /not found/i.test(message) ? 404 : 400);
      }
    },
  );

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
  app.get("/api/projects/:projectId/cly-dev/sessions", (c) => {
    const parsed = clyDevSessionOverviewQuerySchema.safeParse({
      offset: c.req.query("offset") ?? undefined,
      limit: c.req.query("limit") ?? undefined,
    });
    if (!parsed.success) return c.text(parsed.error.message, 400);
    return respond(c, () =>
      getRepository().listSessionOverviews(
        c.req.param("projectId"),
        parsed.data.offset,
        parsed.data.limit,
      ),
    );
  });
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
  app.get(
    "/api/projects/:projectId/cly-dev/sessions/:sessionId/context-envelope",
    (c) =>
      respond(c, () =>
        getRepository().getOutboundContext(
          c.req.param("projectId"),
          c.req.param("sessionId"),
        ),
      ),
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
        limit: c.req.query("limit") ?? undefined,
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
