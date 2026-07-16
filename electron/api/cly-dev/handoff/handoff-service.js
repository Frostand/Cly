import { hashHandoffPayload } from "./canonical-json.js";
import {
  CLY_DEV_HANDOFF_MINIMUM_READER_VERSION,
  CLY_DEV_HANDOFF_PROTOCOL,
  CLY_DEV_HANDOFF_SCHEMA_VERSION,
  clyDevHandoffPayloadSchema,
  findRestrictedHandoffData,
  isRestrictedHandoffKey,
  validateHandoffEnvelope,
} from "./handoff-schema.js";

const OMIT = Symbol("omit-restricted-handoff-value");

function redactRestricted(value) {
  if (value === null || typeof value !== "object") {
    const restricted = findRestrictedHandoffData(value);
    if (restricted) {
      throw new Error(
        `Handoff contains ${restricted.reason} at ${restricted.path}.`,
      );
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redactRestricted).filter((item) => item !== OMIT);
  }
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (isRestrictedHandoffKey(key)) continue;
    const sanitized = redactRestricted(child);
    if (sanitized !== OMIT) output[key] = sanitized;
  }
  return output;
}

const eventId = (event, prefix) =>
  String(
    event.id ?? event.idempotencyKey ?? `${prefix}-${event.sequence ?? 0}`,
  );
const eventsOfType = (events, type) =>
  events.filter((event) => event.type === type);
const lastOfType = (events, type) => eventsOfType(events, type).at(-1);

function payloadFromAggregate(aggregate) {
  if (aggregate.payload) return aggregate.payload;
  const events = aggregate.events ?? [];
  const workspace = aggregate.workspace ?? {};
  const task = aggregate.task ?? {};
  const session = aggregate.session ?? aggregate.snapshot ?? {};
  const context = aggregate.contextManifest ?? {};
  const transferable = context.transferable ?? context;
  const repository = aggregate.repository ?? workspace.repository ?? {};
  const worktree = aggregate.worktree ?? workspace.worktree ?? {};
  const commit = aggregate.commit ?? session.commit ?? {};
  const research = aggregate.research ?? { objects: [], impact: [] };
  const planEvent = lastOfType(events, "plan.recorded");
  const progressEvent = lastOfType(events, "progress.recorded");
  const costs = eventsOfType(events, "cost.recorded").map((event) => ({
    category: event.payload.category,
    amountMinor: event.payload.amountMinor,
    currency: event.payload.currency,
  }));
  const entries = transferable.entries ?? [];
  const researchObjects = new Map(
    (research.objects ?? []).map((object) => [object.id, object]),
  );
  const handoffEntries = entries.flatMap((entry) => {
    if (entry.kind !== "research_object") return [entry];
    if (entry.version && entry.contentHash) return [entry];
    const object = researchObjects.get(entry.researchObjectId);
    return object
      ? [{ ...entry, version: object.version, contentHash: object.contentHash }]
      : [];
  });
  if (session.provider && aggregate.providerRequirements?.required !== true) {
    throw new Error(
      "Explicit provider requirements are required for provider-backed handoff export.",
    );
  }
  return {
    task: {
      id: task.id,
      title: task.title ?? session.title,
      sessionId: session.id,
      state: session.state,
    },
    messages: eventsOfType(events, "message.recorded").map((event) => ({
      id: eventId(event, "message"),
      role: event.payload.role,
      body: event.payload.body,
      createdAt: event.occurredAt,
    })),
    conversationSync: "included",
    summaries: eventsOfType(events, "summary.recorded").map((event) => ({
      id: eventId(event, "summary"),
      title: event.payload.title,
      sections: event.payload.sections,
      createdAt: event.occurredAt,
    })),
    goal: aggregate.goal ?? {
      objective: task.objective,
      successCriteria: [],
    },
    plan: aggregate.plan ?? { steps: planEvent?.payload.steps ?? [] },
    progress: aggregate.progress ?? {
      status:
        session.state === "completed"
          ? "completed"
          : session.state === "failed" || session.state === "awaiting_approval"
            ? "blocked"
            : events.length
              ? "in_progress"
              : "not_started",
      completedItems: progressEvent
        ? [
            `${progressEvent.payload.label}: ${progressEvent.payload.completed}/${progressEvent.payload.total}`,
          ]
        : [],
    },
    decisions: eventsOfType(events, "decision.recorded").map((event) => ({
      id: event.payload.decisionId ?? eventId(event, "decision"),
      summary: event.payload.summary,
      rationale: event.payload.rationale,
      decidedAt: event.occurredAt,
    })),
    openQuestions: aggregate.openQuestions ?? [],
    remainingWork: eventsOfType(events, "remaining_work.recorded").flatMap(
      (event) =>
        event.payload.items.map((description, index) => ({
          id: `${eventId(event, "work")}-${index + 1}`,
          description,
          status: "pending",
        })),
    ),
    contextManifest: {
      id: context.id,
      summary: transferable.summary,
      entries: handoffEntries,
    },
    repository: {
      id: repository.id,
      ...(repository.remoteUrl ? { remoteUrl: repository.remoteUrl } : {}),
      branch: worktree.branch,
      worktreeId: worktree.id,
      commitSha: commit.sha,
      files: handoffEntries
        .filter((entry) => entry.kind === "repository_file")
        .map(({ relativePath, objectHash }) => ({ relativePath, objectHash })),
      symbols: aggregate.relevantSymbols ?? [],
    },
    approvals: (aggregate.approvals ?? session.approvals ?? []).map(
      (approval) => ({
        evidenceOnly: true,
        id: approval.id,
        state: approval.state,
        title: approval.title ?? approval.payload?.title,
        requestedAction:
          approval.requestedAction ?? approval.payload?.requestedAction,
        requestedAt: approval.requestedAt,
        ...(approval.resolvedAt ? { resolvedAt: approval.resolvedAt } : {}),
      }),
    ),
    permissions: {
      ...(aggregate.permissions ?? {
        filesystem: "read-only",
        network: "disabled",
        commands: [],
      }),
      evidenceOnly: true,
    },
    constraints: aggregate.constraints ?? [],
    diffs: eventsOfType(events, "diff.recorded").map((event) => ({
      id: eventId(event, "diff"),
      relativePaths: event.payload.relativePaths,
      additions: event.payload.additions,
      deletions: event.payload.deletions,
      baseCommitSha: event.payload.commitSha,
      resultHash: event.payload.resultHash ?? event.payload.commitSha,
    })),
    tests: eventsOfType(events, "test.recorded").map((event) => ({
      id: eventId(event, "test"),
      command: event.payload.command ?? event.payload.commandId,
      status: event.payload.failed ? "failed" : "passed",
      passed: event.payload.passed,
      failed: event.payload.failed,
      durationMs: event.payload.durationMs,
    })),
    failures: eventsOfType(events, "failure.recorded").map((event) => ({
      id: eventId(event, "failure"),
      code: event.payload.code,
      message: event.payload.message,
      retryable: event.payload.retryable,
    })),
    costs: aggregate.costs ?? {
      currency: costs[0]?.currency ?? "USD",
      totalMinor: costs.reduce((total, item) => total + item.amountMinor, 0),
      items: costs.map(({ category, amountMinor }) => ({
        category,
        amountMinor,
      })),
    },
    research,
    providerRequirements: aggregate.providerRequirements,
  };
}

const issue = (code, message, recoveryAction, extra = {}) => ({
  code,
  message,
  recoveryAction,
  ...extra,
});

function errorIssue(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/integrity|digest/i.test(message)) {
    return issue(
      "integrity_mismatch",
      message,
      "Discard this handoff and request a fresh export from the source task.",
    );
  }
  if (/version|upgrade|reader/i.test(message)) {
    return issue(
      "unsupported_version",
      message,
      "Upgrade Cly or ask the source to export schema version 1.",
    );
  }
  if (/restricted|local-only|machine path/i.test(message)) {
    return issue(
      "restricted_data",
      message,
      "Remove local-only data and export the task again.",
    );
  }
  return issue(
    "invalid_schema",
    `The handoff is not a valid structured record: ${message}`,
    "Repair the source state or request a fresh export.",
  );
}

const normalizeCapabilities = (value) => {
  const capabilities = value?.capabilities ?? value;
  if (capabilities instanceof Set) return capabilities;
  if (!Array.isArray(capabilities)) return null;
  if (
    capabilities.some(
      (capability) =>
        typeof capability !== "string" || capability.trim().length === 0,
    )
  ) {
    return null;
  }
  return new Set(capabilities);
};

const validProjectId = (projectId) =>
  typeof projectId === "string" && projectId.trim().length > 0;
const nonemptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;
const knownGitHash = (value) =>
  typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value);
const knownContentHash = (value) =>
  typeof value === "string" && /^[a-f0-9]{40,128}$/i.test(value);
const projectLookupStatus = (result, projectId) => {
  if (result === true) return "found";
  if (result && typeof result === "object" && "id" in result) {
    return result.id === projectId ? "found" : "mismatch";
  }
  return "missing";
};
const filesystemScope = new Map([
  ["read-only", 0],
  ["workspace-write", 1],
  ["unrestricted", 2],
]);
const networkScope = new Map([
  ["disabled", 0],
  ["restricted", 1],
  ["unrestricted", 2],
]);
const isPermissionRecord = (value) =>
  value &&
  filesystemScope.has(value.filesystem) &&
  networkScope.has(value.network) &&
  Array.isArray(value.commands) &&
  value.commands.every((command) => typeof command === "string");
const permissionsCover = (current, historical) => {
  if (!isPermissionRecord(current)) return false;
  const commands = new Set(current.commands);
  return (
    filesystemScope.get(current.filesystem) >=
      filesystemScope.get(historical.filesystem) &&
    networkScope.get(current.network) >= networkScope.get(historical.network) &&
    (commands.has("*") ||
      historical.commands.every((command) => commands.has(command)))
  );
};

export function createClyDevHandoffService({
  repository,
  now = () => new Date().toISOString(),
  inspectRepository,
  inspectResearch,
  getProviderCapabilities,
  projectExists,
  inspectPermissions,
  inspectApprovals,
  getAggregate,
  materializeImport,
} = {}) {
  if (!repository) throw new Error("A Cly Dev handoff repository is required.");

  async function requireExportProject(projectId) {
    if (!validProjectId(projectId)) {
      throw new Error(
        "A nonempty target projectId is required for handoff export.",
      );
    }
    if (typeof projectExists !== "function") {
      throw new Error(
        "A project-scoped lookup is required before exporting a handoff.",
      );
    }
    let found;
    try {
      found = await projectExists({ projectId });
    } catch (error) {
      throw new Error(
        `Target project lookup failed before handoff export: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const status = projectLookupStatus(found, projectId);
    if (status === "mismatch") {
      throw new Error(
        "The project lookup returned a record for a different project.",
      );
    }
    if (status !== "found") {
      throw new Error("The target project was not found for handoff export.");
    }
  }

  async function exportHandoff(input) {
    await requireExportProject(input?.projectId);
    let aggregate = input.aggregate;
    if (!aggregate && !input.payload && getAggregate) {
      aggregate = await getAggregate(input.projectId, input.sessionId);
    }
    const source = input.payload ?? payloadFromAggregate(aggregate ?? {});
    const transferableSource =
      input.includeMessages === true
        ? source
        : { ...source, messages: [], conversationSync: "excluded" };
    const redacted = redactRestricted(transferableSource);
    const payload = clyDevHandoffPayloadSchema.parse(redacted);
    const envelope = {
      protocol: CLY_DEV_HANDOFF_PROTOCOL,
      schemaVersion: CLY_DEV_HANDOFF_SCHEMA_VERSION,
      minimumReaderVersion: CLY_DEV_HANDOFF_MINIMUM_READER_VERSION,
      exportedAt: now(),
      payload,
      integrity: {
        algorithm: "sha256",
        canonicalization: "cly-json-v1",
        digest: hashHandoffPayload(payload),
      },
    };
    await repository.recordExport(input.projectId, envelope, {
      compatible: true,
      stale: [],
      conflicts: [],
      explanations: [],
    });
    return envelope;
  }

  async function inspectImport(inputOrProjectId, possibleEnvelope) {
    const input =
      typeof inputOrProjectId === "string"
        ? { projectId: inputOrProjectId, envelope: possibleEnvelope }
        : inputOrProjectId;
    let envelope;
    try {
      envelope = validateHandoffEnvelope(input.envelope);
    } catch (error) {
      const conflict = errorIssue(error);
      return {
        compatible: false,
        stale: [],
        conflicts: [conflict],
        explanations: [conflict],
        envelope: null,
        payload: null,
      };
    }

    const stale = [];
    const conflicts = [];
    const sourceRepository = envelope.payload.repository;
    const researchIsApplicable =
      envelope.payload.research.objects.length > 0 ||
      envelope.payload.research.impact.length > 0;
    const providerIsApplicable = envelope.payload.providerRequirements.required;

    if (!validProjectId(input.projectId)) {
      const conflict = issue(
        "invalid_project_id",
        "A nonempty target projectId is required for handoff import.",
        "Select a target project before inspecting this handoff.",
      );
      return {
        compatible: false,
        stale,
        conflicts: [conflict],
        explanations: [conflict],
        envelope,
        payload: envelope.payload,
        authority: null,
      };
    }

    const requiredInspectors = [
      [projectExists, "project_lookup_unavailable", "project-scoped lookup"],
      [
        inspectRepository,
        "repository_inspector_unavailable",
        "repository inspector",
      ],
      ...(researchIsApplicable
        ? [
            [
              inspectResearch,
              "research_inspector_unavailable",
              "research inspector",
            ],
          ]
        : []),
      ...(providerIsApplicable
        ? [
            [
              getProviderCapabilities,
              "provider_capability_inspector_unavailable",
              "provider capability inspector",
            ],
          ]
        : []),
      [
        inspectPermissions,
        "permission_inspector_unavailable",
        "target permission inspector",
      ],
      [
        inspectApprovals,
        "approval_inspector_unavailable",
        "target approval inspector",
      ],
    ];
    for (const [inspector, code, label] of requiredInspectors) {
      if (typeof inspector !== "function") {
        conflicts.push(
          issue(
            code,
            `The ${label} is unavailable, so compatibility cannot be verified.`,
            `Configure the ${label} and inspect the handoff again.`,
          ),
        );
      }
    }
    if (conflicts.length) {
      return {
        compatible: false,
        stale,
        conflicts,
        explanations: [...conflicts],
        envelope,
        payload: envelope.payload,
        authority: null,
      };
    }

    let project;
    try {
      project = await projectExists({ projectId: input.projectId });
    } catch (error) {
      conflicts.push(
        issue(
          "project_lookup_failed",
          `The target project lookup failed: ${error instanceof Error ? error.message : String(error)}`,
          "Restore project storage access and inspect the handoff again.",
        ),
      );
    }
    if (!conflicts.length) {
      const status = projectLookupStatus(project, input.projectId);
      if (status === "mismatch") {
        conflicts.push(
          issue(
            "project_identity_mismatch",
            `The project lookup returned ${project.id} instead of ${input.projectId}.`,
            "Select the exact target project and inspect the handoff again.",
          ),
        );
      } else if (status !== "found") {
        conflicts.push(
          issue(
            "project_not_found",
            `Target project ${input.projectId} was not found.`,
            "Select an existing target project before importing this handoff.",
          ),
        );
      }
    }
    if (conflicts.length) {
      return {
        compatible: false,
        stale,
        conflicts,
        explanations: [...conflicts],
        envelope,
        payload: envelope.payload,
        authority: null,
      };
    }

    let currentRepository;
    try {
      currentRepository = await inspectRepository({
        projectId: input.projectId,
        repository: sourceRepository,
      });
    } catch (error) {
      conflicts.push(
        issue(
          "repository_inspection_failed",
          `Repository inspection failed: ${error instanceof Error ? error.message : String(error)}`,
          "Restore repository access and inspect the handoff again.",
        ),
      );
    }
    if (!currentRepository || typeof currentRepository !== "object") {
      if (
        !conflicts.some(({ code }) => code === "repository_inspection_failed")
      ) {
        conflicts.push(
          issue(
            "repository_state_unavailable",
            "Current repository state is unavailable.",
            "Open or rescan the target repository before importing.",
          ),
        );
      }
    } else if (typeof currentRepository.id !== "string") {
      conflicts.push(
        issue(
          "repository_state_unavailable",
          "Current repository identity is unavailable.",
          "Rescan the target repository before importing.",
        ),
      );
    } else if (currentRepository.id !== sourceRepository.id) {
      conflicts.push(
        issue(
          "repository_identity_mismatch",
          `The current repository (${currentRepository.id}) does not match the handoff repository (${sourceRepository.id}).`,
          "Open the matching project or export a handoff for this repository.",
        ),
      );
    } else {
      for (const [field, code, label] of [
        ["branch", "repository_branch_changed", "branch"],
        ["worktreeId", "repository_worktree_changed", "worktree"],
        ["commitSha", "repository_commit_changed", "commit"],
      ]) {
        const fieldIsKnown =
          field === "commitSha"
            ? knownGitHash(currentRepository[field])
            : nonemptyString(currentRepository[field]);
        if (!fieldIsKnown) {
          conflicts.push(
            issue(
              "repository_state_unavailable",
              `The current repository ${label} is unavailable.`,
              "Refresh the target repository inspection before importing.",
              { field },
            ),
          );
        } else if (currentRepository[field] !== sourceRepository[field]) {
          stale.push(
            issue(
              code,
              `The referenced repository ${label} changed from ${sourceRepository[field]} to ${currentRepository[field]}.`,
              "Review the current Git state, refresh affected context, and re-run relevant tests before resuming.",
              {
                field,
                expected: sourceRepository[field],
                actual: currentRepository[field],
              },
            ),
          );
        }
      }
      if (!Array.isArray(currentRepository.files)) {
        conflicts.push(
          issue(
            "repository_file_state_unavailable",
            "Current repository file-object state is unavailable.",
            "Rescan referenced Git objects before importing.",
          ),
        );
      } else {
        const currentFiles = new Map(
          currentRepository.files.map((file) => [
            file.relativePath,
            file.objectHash,
          ]),
        );
        for (const file of sourceRepository.files) {
          const currentHash = currentFiles.get(file.relativePath);
          if (
            !currentFiles.has(file.relativePath) ||
            !knownGitHash(currentHash)
          ) {
            conflicts.push(
              issue(
                "repository_file_state_unavailable",
                `The current Git object for ${file.relativePath} is unavailable.`,
                "Fetch or rescan this file's Git object before importing.",
                { relativePath: file.relativePath },
              ),
            );
          } else if (currentHash !== file.objectHash) {
            stale.push(
              issue(
                "repository_file_changed",
                `The Git object for ${file.relativePath} changed.`,
                "Re-read this file and recompute any decisions or diffs that depend on it.",
                {
                  relativePath: file.relativePath,
                  expected: file.objectHash,
                  actual: currentHash,
                },
              ),
            );
          }
        }
      }
    }

    if (researchIsApplicable) {
      let currentResearch;
      try {
        currentResearch = await inspectResearch({
          projectId: input.projectId,
          research: envelope.payload.research,
        });
      } catch (error) {
        conflicts.push(
          issue(
            "research_inspection_failed",
            `Research inspection failed: ${error instanceof Error ? error.message : String(error)}`,
            "Restore research storage access and inspect the handoff again.",
          ),
        );
      }
      if (!currentResearch || !Array.isArray(currentResearch.objects)) {
        if (
          !conflicts.some(({ code }) => code === "research_inspection_failed")
        ) {
          conflicts.push(
            issue(
              "research_state_unavailable",
              "Current research object state is unavailable.",
              "Restore or rescan research storage before importing.",
            ),
          );
        }
      } else {
        const currentObjects = new Map(
          currentResearch.objects.map((object) => [object.id, object]),
        );
        for (const sourceObject of envelope.payload.research.objects) {
          const currentObject = currentObjects.get(sourceObject.id);
          if (
            !currentObject ||
            !nonemptyString(currentObject.version) ||
            !knownContentHash(currentObject.contentHash)
          ) {
            conflicts.push(
              issue(
                "research_object_state_unavailable",
                `Current state for research object ${sourceObject.id} is unavailable.`,
                "Restore or rescan this research object before importing.",
                { objectId: sourceObject.id },
              ),
            );
          } else if (
            currentObject.version !== sourceObject.version ||
            currentObject.contentHash !== sourceObject.contentHash
          ) {
            stale.push(
              issue(
                "research_object_changed",
                `Research object ${sourceObject.id} changed.`,
                "Open the current research object version and reassess its recorded task impact.",
                {
                  objectId: sourceObject.id,
                  expectedVersion: sourceObject.version,
                  actualVersion: currentObject.version,
                },
              ),
            );
          }
        }
      }
    }

    if (providerIsApplicable) {
      let capabilities;
      try {
        capabilities = normalizeCapabilities(
          await getProviderCapabilities({ projectId: input.projectId }),
        );
      } catch (error) {
        conflicts.push(
          issue(
            "provider_capability_inspection_failed",
            `Provider capability inspection failed: ${error instanceof Error ? error.message : String(error)}`,
            "Select an available provider and inspect the handoff again.",
          ),
        );
      }
      if (!capabilities) {
        if (
          !conflicts.some(
            ({ code }) => code === "provider_capability_inspection_failed",
          )
        ) {
          conflicts.push(
            issue(
              "provider_capability_state_unavailable",
              "Current provider capabilities are unavailable.",
              "Select and inspect a target provider before importing.",
            ),
          );
        }
      } else {
        for (const capability of envelope.payload.providerRequirements
          .capabilities) {
          if (!capabilities.has(capability)) {
            conflicts.push(
              issue(
                "provider_capability_missing",
                `The selected provider does not support required capability ${capability}.`,
                "Choose a provider with this capability or re-export after adapting the remaining work.",
                { capability },
              ),
            );
          }
        }
      }
    }

    let permissionInspection;
    try {
      permissionInspection = await inspectPermissions({
        projectId: input.projectId,
        historicalPermissions: envelope.payload.permissions,
      });
    } catch (error) {
      conflicts.push(
        issue(
          "permission_inspection_failed",
          `Target permission inspection failed: ${error instanceof Error ? error.message : String(error)}`,
          "Restore target permission policy access and inspect again.",
        ),
      );
    }
    const currentPermissions =
      permissionInspection?.current ??
      permissionInspection?.permissions ??
      (isPermissionRecord(permissionInspection) ? permissionInspection : null);
    if (permissionInspection?.compatible === false) {
      conflicts.push(
        issue(
          "target_permissions_incompatible",
          `Current target permissions are incompatible${permissionInspection.reason ? `: ${permissionInspection.reason}` : "."}`,
          "Adjust target permissions explicitly or revise the remaining work before importing.",
        ),
      );
    } else if (
      !conflicts.some(({ code }) => code === "permission_inspection_failed") &&
      !isPermissionRecord(currentPermissions)
    ) {
      conflicts.push(
        issue(
          "target_permission_state_unavailable",
          "Validated current target permissions are unavailable.",
          "Load the target project's current permission policy and inspect again.",
        ),
      );
    } else if (
      isPermissionRecord(currentPermissions) &&
      permissionInspection?.compatible !== true &&
      !permissionsCover(currentPermissions, envelope.payload.permissions)
    ) {
      conflicts.push(
        issue(
          "target_permissions_incompatible",
          "Current target permissions do not cover the handoff's historical execution scope.",
          "Review and explicitly authorize an appropriate target permission scope.",
        ),
      );
    }

    let approvalInspection;
    try {
      approvalInspection = await inspectApprovals({
        projectId: input.projectId,
        historicalApprovals: envelope.payload.approvals,
      });
    } catch (error) {
      conflicts.push(
        issue(
          "approval_inspection_failed",
          `Target approval inspection failed: ${error instanceof Error ? error.message : String(error)}`,
          "Restore target approval policy access and inspect again.",
        ),
      );
    }
    if (approvalInspection?.compatible !== true) {
      if (
        !conflicts.some(({ code }) => code === "approval_inspection_failed")
      ) {
        conflicts.push(
          issue(
            approvalInspection?.compatible === false
              ? "target_approvals_incompatible"
              : "target_approval_state_unavailable",
            approvalInspection?.compatible === false
              ? `Current target approvals are incompatible${approvalInspection.reason ? `: ${approvalInspection.reason}` : "."}`
              : "Validated current target approval state is unavailable.",
            "Obtain fresh target-project approvals for any resumed effects, then inspect again.",
          ),
        );
      }
    }
    const historicalApprovalIds = new Set(
      envelope.payload.approvals.map((approval) => approval.id),
    );
    const authorizedApprovalIds = Array.isArray(
      approvalInspection?.currentApprovalIds,
    )
      ? approvalInspection.currentApprovalIds.filter(
          (approvalId) =>
            typeof approvalId === "string" &&
            !historicalApprovalIds.has(approvalId),
        )
      : [];
    const authority =
      conflicts.length === 0 &&
      isPermissionRecord(currentPermissions) &&
      approvalInspection?.compatible === true
        ? {
            source: "target-project",
            permissions: currentPermissions,
            authorizedApprovalIds,
          }
        : null;

    return {
      compatible: conflicts.length === 0,
      stale,
      conflicts,
      explanations: [...conflicts, ...stale],
      schemaVersion: envelope.schemaVersion,
      migrated: input.envelope.schemaVersion !== envelope.schemaVersion,
      envelope,
      payload: envelope.payload,
      authority,
    };
  }

  async function importHandoff(inputOrProjectId, possibleEnvelope) {
    const input =
      typeof inputOrProjectId === "string"
        ? { projectId: inputOrProjectId, envelope: possibleEnvelope }
        : inputOrProjectId;
    const inspection = input.inspection ?? (await inspectImport(input));
    if (!inspection.compatible || !inspection.envelope) {
      const explanation = inspection.conflicts
        .map((conflict) => conflict.message)
        .join(" ");
      throw new Error(`Cly Dev handoff import refused. ${explanation}`);
    }
    if (inspection.stale.length) {
      throw new Error(
        "Cly Dev handoff import refused. The source state is stale and must be reconciled before resume.",
      );
    }
    if (typeof materializeImport !== "function") {
      throw new Error(
        "Cly Dev handoff import refused. A resumable-state materializer is required.",
      );
    }
    const { record, duplicate } = await repository.recordImport(
      input.projectId,
      inspection.envelope,
      {
        compatible: inspection.compatible,
        stale: inspection.stale,
        conflicts: inspection.conflicts,
        explanations: inspection.explanations,
        authority: inspection.authority,
      },
    );
    const materialization = await materializeImport({
      projectId: input.projectId,
      record,
      payload: inspection.payload,
      inspection,
    });
    return {
      record: materialization.record,
      duplicate,
      inspection,
      payload: inspection.payload,
      authority: inspection.authority,
      ...(materialization.materialized
        ? { materialized: materialization.materialized }
        : {}),
    };
  }

  return { exportHandoff, inspectImport, importHandoff };
}
