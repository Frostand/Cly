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
    const research =
      typeof inspectResearch === "function"
        ? await inspectResearch({
            projectId,
            sessionId,
            research: { objectIds: task.researchObjectIds },
          })
        : { objects: [], impact: [] };
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
      contextManifest: repository.getContextManifest(
        projectId,
        session.contextManifestId,
      ),
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
) {
  const session = repository
    .listSessions(projectId)
    .find((candidate) => candidate.id === sessionId);
  if (!session) {
    throw new Error("The handoff-linked Cly Dev session was not found.");
  }
  const { task, workspace } = findTask(repository, projectId, session.taskId);
  return {
    workspace,
    task,
    session: repository.getSnapshot(projectId, sessionId),
    contextManifest: repository.getContextManifest(
      projectId,
      session.contextManifestId,
    ),
  };
}
