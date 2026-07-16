import { createHash } from "node:crypto";
import { getClyDevMaterializedAggregate } from "./handoff-aggregate.js";

const EVENT_TEXT_LIMIT = 500;

const hashedEventSuffix = (kind, sourceId) =>
  `${kind}:${createHash("sha256").update(`${kind}\0${sourceId}`).digest("hex")}`;

const boundedEventText = (value) => {
  let bounded = value.slice(0, EVENT_TEXT_LIMIT);
  const finalCodeUnit = bounded.charCodeAt(bounded.length - 1);
  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) {
    bounded = bounded.slice(0, -1);
  }
  return bounded;
};

const emptyLocalOnly = () => ({
  absolutePaths: [],
  environmentVariableNames: [],
  notes: [],
  uncommittedFilePaths: [],
});

const transferableEntry = (entry) => {
  if (entry.kind === "research_object") {
    return { kind: entry.kind, researchObjectId: entry.researchObjectId };
  }
  return entry;
};

const assertTargetWorkspace = (workspace, projectId, repository) => {
  if (!workspace || workspace.projectId !== projectId) {
    throw new Error("A project-scoped target workspace is required.");
  }
  if (
    workspace.repository?.id !== repository.id ||
    workspace.worktree?.id !== repository.worktreeId ||
    workspace.worktree?.branch !== repository.branch
  ) {
    throw new Error(
      "The target workspace does not match the inspected repository and worktree.",
    );
  }
};

const eventBase = (identity, suffix, occurredAt) => ({
  schemaVersion: 1,
  payloadVersion: 1,
  idempotencyKey: `${identity}:event:${suffix}`,
  transferability: "local-only",
  occurredAt,
  actor: { kind: "system", id: "cly-handoff-import" },
});

const materializeActionableEvents = (
  sessions,
  projectId,
  sessionId,
  identity,
  payload,
  importedAt,
) => {
  for (const summary of payload.summaries) {
    sessions.appendEvent(projectId, sessionId, {
      ...eventBase(
        identity,
        hashedEventSuffix("summary", summary.id),
        summary.createdAt,
      ),
      type: "summary.recorded",
      payload: { title: summary.title, sections: summary.sections },
    });
  }
  if (payload.plan.steps.length) {
    sessions.appendEvent(projectId, sessionId, {
      ...eventBase(identity, "plan", importedAt),
      type: "plan.recorded",
      payload: payload.plan,
    });
  }
  const completed = payload.progress.completedItems.length;
  sessions.appendEvent(projectId, sessionId, {
    ...eventBase(identity, "progress", importedAt),
    type: "progress.recorded",
    payload: {
      completed,
      total: Math.max(
        completed,
        completed + payload.remainingWork.length,
        payload.plan.steps.length,
      ),
      label: boundedEventText(
        payload.progress.currentItem ?? payload.progress.status,
      ),
    },
  });
  for (const decision of payload.decisions) {
    sessions.appendEvent(projectId, sessionId, {
      ...eventBase(
        identity,
        hashedEventSuffix("decision", decision.id),
        decision.decidedAt,
      ),
      type: "decision.recorded",
      payload: {
        decisionId: decision.id,
        summary: decision.summary,
        rationale: decision.rationale,
      },
    });
  }
  if (payload.remainingWork.length) {
    sessions.appendEvent(projectId, sessionId, {
      ...eventBase(identity, "remaining-work", importedAt),
      type: "remaining_work.recorded",
      payload: {
        items: payload.remainingWork.map((item) => item.description),
      },
    });
  }
};

export function createClyDevHandoffMaterializer({
  getSessionRepository,
  handoffRepository,
  resolveTargetWorkspace,
  resolveTargetProvider,
}) {
  if (typeof getSessionRepository !== "function") {
    throw new Error("Cly Dev session repository access is required.");
  }
  if (!handoffRepository) {
    throw new Error("A Cly Dev handoff repository is required.");
  }
  if (typeof resolveTargetWorkspace !== "function") {
    throw new Error("A target workspace resolver is required.");
  }
  if (typeof resolveTargetProvider !== "function") {
    throw new Error("A current target provider resolver is required.");
  }

  return async function materializeImport({
    projectId,
    record,
    payload,
    inspection,
  }) {
    if (
      !inspection?.compatible ||
      inspection.stale?.length ||
      !inspection.authority
    ) {
      throw new Error(
        "A compatible inspection with current target authority is required before materialization.",
      );
    }
    const sessions = getSessionRepository();
    const identity = `handoff:${record.integrity.digest}`;
    if (record.materializedSessionId) {
      materializeActionableEvents(
        sessions,
        projectId,
        record.materializedSessionId,
        identity,
        payload,
        record.importedAt,
      );
      return {
        record,
        materialized: getClyDevMaterializedAggregate(
          sessions,
          projectId,
          record.materializedSessionId,
          handoffRepository,
        ),
      };
    }

    const workspace = await resolveTargetWorkspace({
      projectId,
      repository: payload.repository,
      inspection,
    });
    assertTargetWorkspace(workspace, projectId, payload.repository);
    const provider = await resolveTargetProvider({
      projectId,
      requirements: payload.providerRequirements,
      inspection,
    });
    if (!provider?.id || !provider?.model) {
      throw new Error("A current target provider and model are required.");
    }

    const contextManifest = sessions.createContextManifest(
      projectId,
      workspace.id,
      {
        schemaVersion: 1,
        idempotencyKey: `${identity}:context`,
        localOnly: emptyLocalOnly(),
        transferable: {
          summary: payload.contextManifest.summary,
          entries: payload.contextManifest.entries.map(transferableEntry),
        },
      },
    );
    const task = sessions.createTask(projectId, workspace.id, {
      schemaVersion: 1,
      idempotencyKey: `${identity}:task`,
      title: payload.task.title,
      objective: payload.goal.objective,
      researchObjectIds: payload.research.objects.map((object) => object.id),
    });
    const session = sessions.createSession(projectId, task.id, {
      schemaVersion: 1,
      idempotencyKey: `${identity}:session`,
      title: payload.task.title,
      contextManifestId: contextManifest.id,
      provider,
      commit: { sha: payload.repository.commitSha },
      state: "resumable",
    });
    materializeActionableEvents(
      sessions,
      projectId,
      session.id,
      identity,
      payload,
      record.importedAt,
    );
    const linkedRecord = handoffRepository.linkMaterializedSession(
      projectId,
      record.id,
      session.id,
    );
    return {
      record: linkedRecord,
      materialized: getClyDevMaterializedAggregate(
        sessions,
        projectId,
        session.id,
        handoffRepository,
      ),
    };
  };
}
