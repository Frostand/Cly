const findTask = (repository, projectId, taskId) => {
  for (const workspace of repository.listWorkspaces(projectId)) {
    const task = repository
      .listTasks(projectId, workspace.id)
      .find((candidate) => candidate.id === taskId);
    if (task) return { task, workspace };
  }
  throw new Error("Cly Dev task was not found in this project.");
};

const listAllEvents = (repository, projectId, sessionId) => {
  const events = [];
  let afterSequence = 0;
  for (;;) {
    const page = repository.listEvents(
      projectId,
      sessionId,
      afterSequence,
      500,
    );
    events.push(...page);
    if (page.length < 500) return events;
    afterSequence = page.at(-1).sequence;
  }
};

const sourcePermissions = (inspection) =>
  inspection?.current ?? inspection?.permissions ?? inspection;
const knownContentHash = (value) =>
  typeof value === "string" && /^[a-f0-9]{40,128}$/i.test(value);
const nonemptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const loadSourceResearch = async ({
  inspectResearch,
  projectId,
  sessionId,
  task,
  contextManifest,
}) => {
  const researchObjectIds = [
    ...new Set([
      ...(task.researchObjectIds ?? []),
      ...(contextManifest.transferable?.entries ?? [])
        .filter((entry) => entry.kind === "research_object")
        .map((entry) => entry.researchObjectId),
    ]),
  ];
  if (!researchObjectIds.length) return { objects: [], impact: [] };
  if (typeof inspectResearch !== "function") {
    throw new Error(
      "A source research inspector is required to export referenced research objects.",
    );
  }
  const inspected = await inspectResearch({
    projectId,
    sessionId,
    researchObjectIds,
  });
  if (!Array.isArray(inspected?.objects)) {
    throw new Error("Source research object state is unavailable.");
  }
  const objectsById = new Map();
  for (const object of inspected.objects) {
    if (
      !nonemptyString(object?.id) ||
      !nonemptyString(object?.version) ||
      !knownContentHash(object?.contentHash) ||
      objectsById.has(object.id)
    ) {
      throw new Error(
        "Every source research object requires a unique id, version, and content hash.",
      );
    }
    objectsById.set(object.id, object);
  }
  const objects = researchObjectIds.map((objectId) => {
    const object = objectsById.get(objectId);
    if (!object) {
      throw new Error(
        `Source research object ${objectId} is unavailable for handoff export.`,
      );
    }
    return object;
  });
  return { objects, impact: inspected.impact ?? [] };
};

export function createClyDevHandoffAggregateAccess({
  getSessionRepository,
  inspectResearch,
  getProviderRequirements,
  inspectPermissions,
}) {
  if (typeof getSessionRepository !== "function") {
    throw new Error("Cly Dev session repository access is required.");
  }

  return async function getAggregate(projectId, sessionId) {
    const repository = getSessionRepository();
    const session = repository
      .listSessions(projectId)
      .find((candidate) => candidate.id === sessionId);
    if (!session) {
      throw new Error("Cly Dev session was not found in this project.");
    }
    const { task, workspace } = findTask(repository, projectId, session.taskId);
    const snapshot = repository.getSnapshot(projectId, sessionId);
    const contextManifest = repository.getContextManifest(
      projectId,
      session.contextManifestId,
    );
    const research = await loadSourceResearch({
      inspectResearch,
      projectId,
      sessionId,
      task,
      contextManifest,
    });
    const providerRequirements =
      typeof getProviderRequirements === "function"
        ? await getProviderRequirements({ projectId, session, task })
        : undefined;
    const permissionInspection =
      typeof inspectPermissions === "function"
        ? await inspectPermissions({ projectId, sessionId, session, task })
        : undefined;

    return {
      workspace,
      task,
      session: snapshot,
      contextManifest,
      events: listAllEvents(repository, projectId, sessionId),
      approvals: snapshot.approvals,
      research: {
        objects: research?.objects ?? [],
        impact: research?.impact ?? [],
      },
      ...(sourcePermissions(permissionInspection)
        ? { permissions: sourcePermissions(permissionInspection) }
        : {}),
      providerRequirements,
    };
  };
}

export function getClyDevMaterializedAggregate(
  repository,
  projectId,
  sessionId,
  handoffRepository,
) {
  const session = repository
    .listSessions(projectId)
    .find((candidate) => candidate.id === sessionId);
  if (!session) {
    throw new Error("The handoff-linked Cly Dev session was not found.");
  }
  const { task, workspace } = findTask(repository, projectId, session.taskId);
  const linkedHandoff = handoffRepository?.findImportByMaterializedSession(
    projectId,
    sessionId,
  );
  return {
    workspace,
    task,
    session: repository.getSnapshot(projectId, sessionId),
    contextManifest: repository.getContextManifest(
      projectId,
      session.contextManifestId,
    ),
    ...(linkedHandoff
      ? { handoff: linkedHandoff, actionableState: linkedHandoff.payload }
      : {}),
  };
}
