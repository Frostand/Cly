import { z } from "zod";
import { getStateDatabase } from "../../persisted-state.js";
import { inspectGitResumeDestination } from "./git-resume.js";
import {
  ClyDevHandoffError,
  createClyDevHandoffService,
  createUnavailableHandoffTransport,
} from "./handoff-service.js";
import { createClyDevSessionRepository } from "./session-repository.js";

const id = z.string().trim().min(1).max(500);
const pairSchema = z
  .object({ deviceId: id, pairingCode: z.string().regex(/^\d{6}$/) })
  .strict();
const publishSchema = z
  .object({ deviceId: id, expectedRevision: z.number().int().nonnegative() })
  .strict();
const destinationSchema = z
  .object({
    name: z.string().trim().min(1).max(500).optional(),
    path: z.string().trim().min(1).max(4_000),
    repositoryPath: z.string().trim().min(1).max(4_000),
    worktreePath: z.string().trim().min(1).max(4_000),
    requiredTools: z.array(id).default([]),
    machine: z
      .object({
        id,
        platform: z.enum(["darwin", "linux", "win32"]),
        architecture: z.string().trim().min(1).max(100).optional(),
      })
      .strict(),
  })
  .strict();
const resumeSchema = z
  .object({
    deviceId: id,
    destination: destinationSchema,
    offline: z.boolean().default(false),
  })
  .strict();

const parseBody = async (c, schema) => {
  try {
    const parsed = schema.safeParse(await c.req.json());
    if (parsed.success) return parsed.data;
    return c.json(
      { error: "Invalid handoff request.", details: parsed.error.issues },
      400,
    );
  } catch {
    return c.json({ error: "Invalid JSON payload." }, 400);
  }
};

const respond = async (c, operation, successStatus = 200) => {
  try {
    const result = await operation();
    return result instanceof Response ? result : c.json(result, successStatus);
  } catch (error) {
    if (error instanceof ClyDevHandoffError) {
      return c.json(
        { error: error.message, code: error.code, details: error.details },
        error.status,
      );
    }
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Handoff request failed.",
      },
      400,
    );
  }
};

const unavailableTransport = createUnavailableHandoffTransport();

export function registerClyDevHandoffRoutes(
  app,
  {
    getService = () =>
      createClyDevHandoffService({
        repository: createClyDevSessionRepository({ db: getStateDatabase() }),
        transport: unavailableTransport,
        inspectDestination: inspectGitResumeDestination,
      }),
  } = {},
) {
  app.post("/api/cly-dev/devices/pair", async (c) => {
    const body = await parseBody(c, pairSchema);
    if (body instanceof Response) return body;
    return respond(c, () => getService().pairDevice(body), 201);
  });
  app.post(
    "/api/projects/:projectId/cly-dev/sessions/:sessionId/handoffs",
    async (c) => {
      const body = await parseBody(c, publishSchema);
      if (body instanceof Response) return body;
      return respond(
        c,
        () =>
          getService().publish(
            c.req.param("projectId"),
            c.req.param("sessionId"),
            body,
          ),
        201,
      );
    },
  );
  for (const action of ["inspect", "resume"]) {
    app.post(`/api/cly-dev/handoffs/:handoffId/${action}`, async (c) => {
      const body = await parseBody(c, resumeSchema);
      if (body instanceof Response) return body;
      return respond(c, async () => {
        const result = await getService()[action](
          decodeURIComponent(c.req.param("handoffId")),
          body,
        );
        if (result.readiness?.blocking) {
          return c.json(result, 412);
        }
        return result;
      });
    });
  }
}
