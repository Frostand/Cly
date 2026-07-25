import { z } from "zod";
import { getStateDatabase } from "../../persisted-state.js";
import { createClyDevWorkbenchService } from "./workbench-service.js";
import { resolveClyDevWorkspaceAuthority } from "./workspace-authority.js";

const commandSchema = z.object({
  requestId: z.string().trim().min(1).max(200).optional(),
  command: z.string().trim().min(1).max(20_000),
  approvalId: z.string().trim().min(1).max(200).optional(),
});

const cancellationSchema = z.object({
  requestId: z.string().trim().min(1).max(200),
});

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

const errorResponse = (c, error) => {
  const message =
    error instanceof Error
      ? error.message
      : "Cly Dev workbench request failed.";
  return c.text(message, /not found/i.test(message) ? 404 : 400);
};

export function registerClyDevWorkbenchRoutes(
  app,
  {
    getDatabase = getStateDatabase,
    getService,
    authorizeCommand,
    resolveWorkspaceAuthority = resolveClyDevWorkspaceAuthority,
  } = {},
) {
  let service;
  const resolveService = () => {
    if (getService) return getService();
    service ??= createClyDevWorkbenchService({
      db: getDatabase(),
      authorizeCommand,
      resolveWorkspaceAuthority,
    });
    return service;
  };

  app.get(
    "/api/projects/:projectId/cly-dev/sessions/:sessionId/workbench",
    async (c) => {
      try {
        return c.json(
          await resolveService().getContext(
            c.req.param("projectId"),
            c.req.param("sessionId"),
          ),
        );
      } catch (error) {
        return errorResponse(c, error);
      }
    },
  );

  app.post(
    "/api/projects/:projectId/cly-dev/sessions/:sessionId/workbench/commands/request",
    async (c) => {
      const body = await parseBody(c, commandSchema.omit({ approvalId: true }));
      if (body.error) return body.error;
      try {
        return c.json(
          await resolveService().requestCommand({
            projectId: c.req.param("projectId"),
            sessionId: c.req.param("sessionId"),
            ...body.data,
          }),
        );
      } catch (error) {
        return errorResponse(c, error);
      }
    },
  );

  app.post(
    "/api/projects/:projectId/cly-dev/sessions/:sessionId/workbench/commands/execute",
    async (c) => {
      const body = await parseBody(
        c,
        commandSchema.extend({ requestId: z.string().trim().min(1).max(200) }),
      );
      if (body.error) return body.error;
      try {
        return c.json(
          await resolveService().executeCommand({
            projectId: c.req.param("projectId"),
            sessionId: c.req.param("sessionId"),
            ...body.data,
          }),
        );
      } catch (error) {
        return errorResponse(c, error);
      }
    },
  );

  app.post(
    "/api/projects/:projectId/cly-dev/sessions/:sessionId/workbench/commands/cancel",
    async (c) => {
      const body = await parseBody(c, cancellationSchema);
      if (body.error) return body.error;
      return c.json({
        canceled: resolveService().cancelCommand({
          projectId: c.req.param("projectId"),
          sessionId: c.req.param("sessionId"),
          requestId: body.data.requestId,
        }),
      });
    },
  );
}
