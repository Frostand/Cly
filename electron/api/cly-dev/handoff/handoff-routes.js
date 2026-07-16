import { z } from "zod";
import { getStateDatabase } from "../../../persisted-state.js";
import { createClyDevSessionRepository } from "../session-repository.js";
import { createClyDevHandoffAggregateAccess } from "./handoff-aggregate.js";
import { createClyDevHandoffMaterializer } from "./handoff-materializer.js";
import { createClyDevHandoffRepository } from "./handoff-repository.js";
import { createClyDevHandoffService } from "./handoff-service.js";

const exportInputSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(500),
    includeMessages: z.literal(true).optional(),
  })
  .strict();
const envelopeInputSchema = z.object({ envelope: z.unknown() }).strict();

const publicMessages = {
  integrity_mismatch: "Handoff integrity verification failed.",
  unsupported_version: "This handoff version is not supported.",
  invalid_schema: "The handoff is not a valid structured record.",
  restricted_data: "The handoff contains restricted or local-only data.",
  project_not_found: "The target project was not found.",
  stale_handoff: "The handoff is stale and must be reconciled before resume.",
};
const compatibilityMessage =
  "The handoff is not compatible with the target project.";

const publicIssue = (issue) => ({
  code: issue.code,
  message: publicMessages[issue.code] ?? compatibilityMessage,
  ...(issue.recoveryAction ? { recoveryAction: issue.recoveryAction } : {}),
});

const errorResponse = (c, status, code, message, issues) =>
  c.json(
    {
      error: {
        code,
        message,
        ...(issues?.length ? { issues: issues.map(publicIssue) } : {}),
      },
    },
    status,
  );

async function parseBody(c, schema) {
  try {
    const parsed = schema.safeParse(await c.req.json());
    if (parsed.success) return { data: parsed.data };
  } catch {
    // Returned as one stable public error below.
  }
  return {
    error: errorResponse(
      c,
      400,
      "invalid_request",
      "The request body is invalid.",
    ),
  };
}

const importFailureStatus = (code) => {
  if (code === "project_not_found") return 404;
  if (
    [
      "integrity_mismatch",
      "unsupported_version",
      "invalid_schema",
      "restricted_data",
    ].includes(code)
  ) {
    return 400;
  }
  return 409;
};

const defaultTargetWorkspace = ({ sessions, projectId, repository }) =>
  sessions
    .listWorkspaces(projectId)
    .find(
      (workspace) =>
        workspace.repository?.id === repository.id &&
        workspace.worktree?.id === repository.worktreeId &&
        workspace.worktree?.branch === repository.branch,
    );

export function createClyDevHandoffRouteComposition({
  getDatabase = () => getStateDatabase(),
  getSessionRepository,
  projectExists,
  inspectRepository,
  inspectResearch,
  getProviderCapabilities,
  inspectPermissions,
  inspectApprovals,
  inspectSourceResearch,
  inspectSourcePermissions,
  getProviderRequirements,
  resolveTargetWorkspace,
  resolveTargetProvider,
  now,
} = {}) {
  const db = getDatabase();
  const sessions = getSessionRepository
    ? getSessionRepository(db)
    : createClyDevSessionRepository({ db, now });
  const handoffs = createClyDevHandoffRepository({ db, now });
  const getSessions = () => sessions;
  const aggregateAccess = createClyDevHandoffAggregateAccess({
    getSessionRepository: getSessions,
    inspectResearch: inspectSourceResearch,
    inspectPermissions: inspectSourcePermissions,
    getProviderRequirements,
  });
  const materializeImport = createClyDevHandoffMaterializer({
    getSessionRepository: getSessions,
    handoffRepository: handoffs,
    resolveTargetWorkspace:
      resolveTargetWorkspace ??
      ((input) => defaultTargetWorkspace({ sessions, ...input })),
    resolveTargetProvider:
      resolveTargetProvider ??
      (() => {
        throw new Error("A current target provider resolver is required.");
      }),
  });
  const service = createClyDevHandoffService({
    repository: handoffs,
    now,
    projectExists:
      projectExists ??
      (({ projectId }) =>
        db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId)),
    inspectRepository,
    inspectResearch,
    getProviderCapabilities,
    inspectPermissions,
    inspectApprovals,
    getAggregate: aggregateAccess,
    materializeImport,
  });
  return { db, sessions, handoffs, service };
}

export function registerClyDevHandoffRoutes(app, options = {}) {
  const composition = () => createClyDevHandoffRouteComposition(options);

  app.post("/api/projects/:projectId/cly-dev/handoffs/export", async (c) => {
    const body = await parseBody(c, exportInputSchema);
    if (body.error) return body.error;
    try {
      const { service } = composition();
      return c.json(
        await service.exportHandoff({
          projectId: c.req.param("projectId"),
          ...body.data,
        }),
        200,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      return errorResponse(
        c,
        /not found/i.test(message) ? 404 : 409,
        /not found/i.test(message) ? "not_found" : "export_failed",
        /not found/i.test(message)
          ? "The requested project or Cly Dev session was not found."
          : "The Cly Dev handoff could not be exported safely.",
      );
    }
  });

  app.post("/api/projects/:projectId/cly-dev/handoffs/inspect", async (c) => {
    const body = await parseBody(c, envelopeInputSchema);
    if (body.error) return body.error;
    try {
      const { service } = composition();
      return c.json(
        await service.inspectImport({
          projectId: c.req.param("projectId"),
          envelope: body.data.envelope,
        }),
        200,
      );
    } catch {
      return errorResponse(
        c,
        503,
        "inspection_unavailable",
        "Handoff compatibility could not be inspected.",
      );
    }
  });

  app.post("/api/projects/:projectId/cly-dev/handoffs/import", async (c) => {
    const body = await parseBody(c, envelopeInputSchema);
    if (body.error) return body.error;
    try {
      const { service } = composition();
      const input = {
        projectId: c.req.param("projectId"),
        envelope: body.data.envelope,
      };
      const inspection = await service.inspectImport(input);
      if (!inspection.compatible || !inspection.envelope) {
        const issue = inspection.conflicts[0] ?? {
          code: "invalid_schema",
          message: publicMessages.invalid_schema,
        };
        return errorResponse(
          c,
          importFailureStatus(issue.code),
          issue.code,
          publicMessages[issue.code] ?? compatibilityMessage,
          inspection.conflicts,
        );
      }
      if (inspection.stale.length) {
        return errorResponse(
          c,
          409,
          "stale_handoff",
          publicMessages.stale_handoff,
          inspection.stale,
        );
      }
      const result = await service.importHandoff({ ...input, inspection });
      return c.json(result, result.duplicate ? 200 : 201);
    } catch {
      return errorResponse(
        c,
        409,
        "materialization_failed",
        "The handoff could not be materialized into resumable Cly Dev state.",
      );
    }
  });
}
