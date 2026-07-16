import { getClyDevMaterializedAggregate } from "./handoff-aggregate.js";

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
    if (record.materializedSessionId) {
      return {
        record,
        materialized: getClyDevMaterializedAggregate(
          sessions,
          projectId,
          record.materializedSessionId,
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

    const identity = `handoff:${record.integrity.digest}`;
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
    const linkedRecord = handoffRepository.linkMaterializedSession(
      projectId,
      record.id,
      session.id,
    );
    return {
      record: linkedRecord,
      materialized: {
        workspace,
        contextManifest,
        task,
        session: sessions.getSnapshot(projectId, session.id),
      },
    };
  };
}
