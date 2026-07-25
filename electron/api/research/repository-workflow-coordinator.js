import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

const DEFAULT_APPROVAL_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_APPROVALS = 1_000;
const ACTOR_ID_SCHEMA = z.string().trim().min(1).max(200);
const PROJECT_ID_SCHEMA = z.string().trim().min(1).max(500);
const OBJECT_ID_SCHEMA = z.string().trim().min(1).max(500);
const COMMIT_SHA_SCHEMA = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i);

const externalUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "Repository references require an HTTPS URL.",
  })
  .refine(
    (value) => {
      const url = new URL(value);
      return !url.username && !url.password && !url.hash;
    },
    {
      message:
        "Repository reference URLs cannot contain credentials or fragments.",
    },
  );

const referenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("commit"),
      sha: COMMIT_SHA_SCHEMA,
      title: z.string().trim().min(1).max(500).optional(),
      url: externalUrlSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("pull-request"),
      number: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      title: z.string().trim().min(1).max(500).optional(),
      url: externalUrlSchema,
    })
    .strict(),
]);

export const repositoryWorkflowActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      enabled: z.boolean(),
      type: z.literal("set-observation"),
    })
    .strict(),
  z
    .object({
      reference: referenceSchema,
      researchObjectIds: z
        .array(OBJECT_ID_SCHEMA)
        .min(1)
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length, {
          message: "Research object IDs must be unique.",
        }),
      type: z.literal("link-reference"),
    })
    .strict(),
]);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
};

export const hashRepositoryWorkflowAction = (projectId, action) =>
  createHash("sha256")
    .update(JSON.stringify(canonicalize({ action, projectId })))
    .digest("hex");

const workflowError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const projectDeepLink = (projectId, eventId) =>
  `cly://research/projects/${encodeURIComponent(projectId)}/provenance/${encodeURIComponent(eventId)}`;

export function isRepositoryObservationEnabled(project, provenance = []) {
  const setting = project?.metadata?.repositoryObservation;
  if (setting?.enabled !== true || typeof setting.approvalId !== "string") {
    return false;
  }
  const latestSettingEvent = provenance.find(
    (event) =>
      event.action === "repository.observation.enabled" ||
      event.action === "repository.observation.disabled",
  );
  return (
    latestSettingEvent?.action === "repository.observation.enabled" &&
    latestSettingEvent.metadata?.approvalId === setting.approvalId
  );
}

export function createRepositoryWorkflowCoordinator(
  repository,
  {
    approvalTtlMs = DEFAULT_APPROVAL_TTL_MS,
    clock = () => new Date(),
    createId = randomUUID,
  } = {},
) {
  if (!Number.isSafeInteger(approvalTtlMs) || approvalTtlMs < 1) {
    throw new Error("Repository workflow approval TTL must be positive.");
  }
  const approvals = new Map();

  const loadApproval = (projectId, approvalId, action) => {
    if (typeof approvalId !== "string" || !approvalId.trim()) {
      throw workflowError(
        "APPROVAL_REQUIRED",
        "This repository action requires explicit approval.",
      );
    }
    const approval = approvals.get(approvalId);
    if (!approval || approval.projectId !== projectId) {
      throw workflowError(
        "APPROVAL_INVALID",
        "Repository action approval was not found for this project.",
      );
    }
    if (approval.expiresAt <= clock().getTime()) {
      approvals.delete(approvalId);
      throw workflowError(
        "APPROVAL_EXPIRED",
        "Repository action approval has expired.",
      );
    }
    const actionHash = hashRepositoryWorkflowAction(projectId, action);
    if (approval.actionHash !== actionHash || approval.state !== "approved") {
      throw workflowError(
        "APPROVAL_INVALID",
        "Repository action approval does not match this exact action.",
      );
    }
    approval.state = "consumed";
    return approval;
  };

  return Object.freeze({
    requestApproval(projectIdInput, actionInput) {
      const projectId = PROJECT_ID_SCHEMA.parse(projectIdInput);
      repository.getProject(projectId);
      const action = repositoryWorkflowActionSchema.parse(actionInput);
      const requestedAt = clock();
      for (const [id, approval] of approvals) {
        if (approval.expiresAt <= requestedAt.getTime()) approvals.delete(id);
      }
      if (approvals.size >= MAX_PENDING_APPROVALS) {
        throw workflowError(
          "APPROVAL_LIMIT",
          "Too many repository action approvals are pending.",
        );
      }
      const approval = {
        action,
        actionHash: hashRepositoryWorkflowAction(projectId, action),
        expiresAt: requestedAt.getTime() + approvalTtlMs,
        id: createId(),
        projectId,
        requestedAt: requestedAt.toISOString(),
        state: "pending",
      };
      approvals.set(approval.id, approval);
      return {
        action: approval.action,
        actionHash: approval.actionHash,
        expiresAt: new Date(approval.expiresAt).toISOString(),
        id: approval.id,
        projectId,
        requestedAt: approval.requestedAt,
        state: approval.state,
      };
    },

    approveAction(projectIdInput, approvalId, actorIdInput) {
      const projectId = PROJECT_ID_SCHEMA.parse(projectIdInput);
      const actorId = ACTOR_ID_SCHEMA.parse(actorIdInput);
      const approval = approvals.get(approvalId);
      if (!approval || approval.projectId !== projectId) {
        throw workflowError(
          "APPROVAL_INVALID",
          "Repository action approval was not found for this project.",
        );
      }
      if (approval.expiresAt <= clock().getTime()) {
        approvals.delete(approvalId);
        throw workflowError(
          "APPROVAL_EXPIRED",
          "Repository action approval has expired.",
        );
      }
      if (approval.state !== "pending") {
        throw workflowError(
          "APPROVAL_INVALID",
          "Repository action approval is no longer pending.",
        );
      }
      const event = repository.appendProvenance({
        action: "repository.action.approved",
        actorId,
        actorType: "human",
        metadata: {
          actionHash: approval.actionHash,
          actionType: approval.action.type,
          approvalId: approval.id,
          expiresAt: new Date(approval.expiresAt).toISOString(),
        },
        projectId,
      });
      approval.approvedBy = actorId;
      approval.approvalEventId = event.id;
      approval.state = "approved";
      return {
        actionHash: approval.actionHash,
        approvedBy: actorId,
        approvalEventId: event.id,
        expiresAt: new Date(approval.expiresAt).toISOString(),
        id: approval.id,
        projectId,
        state: approval.state,
      };
    },

    setObservationEnabled(projectIdInput, { approvalId, enabled }) {
      const projectId = PROJECT_ID_SCHEMA.parse(projectIdInput);
      const action = repositoryWorkflowActionSchema.parse({
        enabled,
        type: "set-observation",
      });
      const approval = loadApproval(projectId, approvalId, action);
      const project = repository.getProject(projectId);
      const updatedAt = clock().toISOString();
      const updated = repository.upsertProject({
        id: project.id,
        metadata: {
          ...project.metadata,
          repositoryObservation: {
            approvalId,
            approvedBy: approval.approvedBy,
            enabled: action.enabled,
            updatedAt,
          },
        },
        name: project.name,
        path: project.path,
      });
      const event = repository.appendProvenance({
        action: action.enabled
          ? "repository.observation.enabled"
          : "repository.observation.disabled",
        actorId: approval.approvedBy,
        actorType: "human",
        metadata: {
          actionHash: approval.actionHash,
          approvalEventId: approval.approvalEventId,
          approvalId,
          enabled: action.enabled,
        },
        projectId,
      });
      approvals.delete(approvalId);
      return {
        enabled: action.enabled,
        projectId,
        provenanceEventId: event.id,
        updatedAt,
        metadata: updated.metadata.repositoryObservation,
      };
    },

    linkReference(projectIdInput, input) {
      const projectId = PROJECT_ID_SCHEMA.parse(projectIdInput);
      const action = repositoryWorkflowActionSchema.parse({
        reference: input.reference,
        researchObjectIds: input.researchObjectIds,
        type: "link-reference",
      });
      const approval = loadApproval(projectId, input.approvalId, action);
      const project = repository.getProject(projectId);
      if (
        !isRepositoryObservationEnabled(
          project,
          repository.listProvenance(projectId, { limit: 500 }),
        )
      ) {
        throw workflowError(
          "OBSERVATION_DISABLED",
          "Repository observation is not enabled for this project.",
        );
      }
      const projectObjects = new Set(
        repository.listProject(projectId).objects.map((object) => object.id),
      );
      for (const objectId of action.researchObjectIds) {
        if (!projectObjects.has(objectId)) {
          throw workflowError(
            "PROJECT_SCOPE_VIOLATION",
            "A linked research object does not belong to this project.",
          );
        }
      }
      const provenanceAction =
        action.reference.kind === "commit"
          ? "repository.commit.linked"
          : "repository.pull-request.linked";
      const events = action.researchObjectIds.map((objectId) =>
        repository.appendProvenance({
          action: provenanceAction,
          actorId: approval.approvedBy,
          actorType: "human",
          metadata: {
            actionHash: approval.actionHash,
            approvalEventId: approval.approvalEventId,
            approvalId: input.approvalId,
            reference: action.reference,
          },
          objectId,
          projectId,
        }),
      );
      approvals.delete(input.approvalId);
      return {
        events: events.map((event) => ({
          action: event.action,
          deepLink: projectDeepLink(projectId, event.id),
          id: event.id,
          objectId: event.objectId,
          projectId,
          reference: action.reference,
        })),
        projectId,
      };
    },
  });
}
