import { createHash } from "node:crypto";
import { getStateDatabase } from "../../persisted-state.js";
import { getGitRepositoryInfo, runGitCommand } from "../project-git/core.js";
import {
  clyDevCancellationRequestSchema,
  clyDevExecutionRequestSchema,
} from "./runtime/execution-request-schema.js";
import { deriveTransferableContextSummary } from "./runtime/execution-runtime.js";
import { createProductionClyDevRuntime } from "./runtime/production-composition.js";
import { createClyDevSessionRepository } from "./session-repository.js";
import {
  clyDevContextManifestInputSchema,
  clyDevEventInputSchema,
  clyDevEventsQuerySchema,
  clyDevSessionAggregateInputSchema,
  clyDevSessionInputSchema,
  clyDevSessionLaunchInputSchema,
  clyDevSessionOverviewQuerySchema,
  clyDevTaskInputSchema,
  clyDevWorkspaceInputSchema,
} from "./session-schema.js";

const stableLocalId = (prefix, value) =>
  `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;

export async function createProductionSessionLaunchAggregate({
  db,
  input,
  projectId,
  repository,
  getRepositoryInfo = getGitRepositoryInfo,
  gitCommand = runGitCommand,
}) {
  const project = db
    .prepare("SELECT id, name, path FROM projects WHERE id = ?")
    .get(projectId);
  if (!project) throw new Error("Project was not found.");
  const git = await getRepositoryInfo(project.path);
  if (!git?.isRepo || !git.repoRoot || !git.branch) {
    throw new Error(
      "Agent Sessions require the active project to be inside a Git repository with a checked-out commit.",
    );
  }
  const head = await gitCommand(git.repoRoot, ["rev-parse", "HEAD"]);
  const commitSha = String(head.stdout ?? "").trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(commitSha)) {
    throw new Error("The active Git commit could not be resolved.");
  }

  const rootKey = `${projectId}:${input.idempotencyKey}`;
  const repositoryId = stableLocalId("repository", git.repoRoot);
  const entries = [{ kind: "commit", commitSha }];
  return repository.createSessionAggregate(projectId, {
    workspace: {
      schemaVersion: 1,
      idempotencyKey: `${input.idempotencyKey}:workspace`,
      id: stableLocalId("workspace", rootKey),
      name: `${project.name} · ${git.branch}`,
      repository: { id: repositoryId },
      worktree: {
        id: stableLocalId("worktree", `${git.repoRoot}:${git.branch}`),
        branch: git.branch,
      },
      machine: {
        id: "cly-local-machine",
        platform: process.platform,
        architecture: process.arch,
      },
      localOnly: {
        repositoryPath: project.path,
        worktreePath: project.path,
      },
    },
    contextManifest: {
      schemaVersion: 1,
      idempotencyKey: `${input.idempotencyKey}:context`,
      id: stableLocalId("context", rootKey),
      localOnly: {
        absolutePaths: [],
        environmentVariableNames: [],
        notes: [],
        uncommittedFilePaths: [],
      },
      transferable: {
        summary: deriveTransferableContextSummary(entries),
        entries,
      },
    },
    task: {
      schemaVersion: 1,
      idempotencyKey: `${input.idempotencyKey}:task`,
      id: stableLocalId("task", rootKey),
      title: input.title,
      objective: input.objective,
      researchObjectIds: [],
    },
    session: {
      schemaVersion: 1,
      idempotencyKey: `${input.idempotencyKey}:session`,
      id: stableLocalId("session", rootKey),
      title: input.title,
      provider: input.provider,
      commit: { sha: commitSha },
      state: "queued",
    },
  });
}

const assertLaunchProvider = (providers, input) => {
  const provider = providers.find((entry) => entry.id === input.provider.id);
  if (!provider || provider.authentication !== "authenticated") {
    throw new Error(
      "The selected provider is not connected and authenticated.",
    );
  }
  if (!provider.supportedModes.includes(input.mode)) {
    throw new Error(
      `The selected provider does not support ${input.mode} sessions.`,
    );
  }
  const model = provider.models.find(
    (entry) => entry.id === input.provider.model,
  );
  if (!model) {
    throw new Error("The selected model is not in the live provider catalog.");
  }
  if (
    input.provider.reasoningEffort &&
    !model.reasoningEfforts.includes(input.provider.reasoningEffort)
  ) {
    throw new Error(
      "The selected reasoning level is not advertised by this model.",
    );
  }
};

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
    createSessionLaunchAggregate = createProductionSessionLaunchAggregate,
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

  app.get("/api/cly-dev/providers", async (c) => {
    try {
      return c.json(await resolveRuntime().listProviders());
    } catch {
      return c.text("Provider status could not be verified.", 503);
    }
  });

  app.post("/api/projects/:projectId/cly-dev/session-launches", async (c) => {
    const body = await parseBody(c, clyDevSessionLaunchInputSchema);
    if (body.error) return body.error;
    try {
      const runtime = resolveRuntime();
      assertLaunchProvider(await runtime.listProviders(), body.data);
      const repository = getRepository();
      const aggregate = await createSessionLaunchAggregate({
        db: getDatabase(),
        input: body.data,
        projectId: c.req.param("projectId"),
        repository,
      });
      const tools =
        body.data.provider.id === "anthropic-claude"
          ? body.data.mode === "workspace_write"
            ? ["listFiles", "readFile", "writeFile", "runCommand"]
            : ["listFiles", "readFile"]
          : [];
      repository.appendEvent(c.req.param("projectId"), aggregate.session.id, {
        schemaVersion: 1,
        payloadVersion: 1,
        idempotencyKey: `${body.data.idempotencyKey}:execution-settings`,
        type: "summary.recorded",
        transferability: "local-only",
        occurredAt: new Date().toISOString(),
        actor: { kind: "system", id: "cly-dev-runtime" },
        payload: {
          title: "Execution settings",
          sections: [
            `mode:${body.data.mode}`,
            ...tools.map((tool) => `tool:${tool}`),
          ],
        },
      });
      return c.json(
        {
          ...aggregate,
          execution: {
            mode: body.data.mode,
            tools,
          },
        },
        201,
      );
    } catch (error) {
      return c.text(
        error instanceof Error ? error.message : "Agent session launch failed.",
        400,
      );
    }
  });

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
