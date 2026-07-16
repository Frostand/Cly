import { hashHandoffPayload } from "./canonical-json.js";
import {
  CLY_DEV_HANDOFF_MINIMUM_READER_VERSION,
  CLY_DEV_HANDOFF_PROTOCOL,
  CLY_DEV_HANDOFF_SCHEMA_VERSION,
  clyDevHandoffPayloadSchema,
  isAbsoluteMachinePath,
  isRestrictedHandoffKey,
  validateHandoffEnvelope,
} from "./handoff-schema.js";

const OMIT = Symbol("omit-restricted-handoff-value");

function redactRestricted(value) {
  if (isAbsoluteMachinePath(value)) return OMIT;
  if (value === null || typeof value !== "object") return value;
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
        id: approval.id,
        state: approval.state,
        title: approval.title ?? approval.payload?.title,
        requestedAction:
          approval.requestedAction ?? approval.payload?.requestedAction,
        requestedAt: approval.requestedAt,
        ...(approval.resolvedAt ? { resolvedAt: approval.resolvedAt } : {}),
      }),
    ),
    permissions: aggregate.permissions ?? {
      filesystem: "read-only",
      network: "disabled",
      commands: [],
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
    providerRequirements: aggregate.providerRequirements ?? {
      capabilities: [],
    },
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
  const capabilities = value?.capabilities ?? value ?? [];
  return new Set(
    capabilities instanceof Set ? capabilities : Array.from(capabilities),
  );
};

export function createClyDevHandoffService({
  repository,
  now = () => new Date().toISOString(),
  inspectRepository,
  inspectResearch,
  getProviderCapabilities,
  getAggregate,
} = {}) {
  if (!repository) throw new Error("A Cly Dev handoff repository is required.");

  async function exportHandoff(input) {
    let aggregate = input.aggregate;
    if (!aggregate && !input.payload && getAggregate) {
      aggregate = await getAggregate(input.projectId, input.sessionId);
    }
    const source = input.payload ?? payloadFromAggregate(aggregate ?? {});
    const redacted = redactRestricted(source);
    if (input.includeMessages === false) {
      redacted.messages = [];
      redacted.conversationSync = "excluded";
    }
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
    const currentRepository = inspectRepository
      ? await inspectRepository({
          projectId: input.projectId,
          repository: sourceRepository,
        })
      : null;
    if (currentRepository) {
      if (currentRepository.id !== sourceRepository.id) {
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
          if (currentRepository[field] !== sourceRepository[field]) {
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
        const currentFiles = new Map(
          (currentRepository.files ?? []).map((file) => [
            file.relativePath,
            file.objectHash,
          ]),
        );
        for (const file of sourceRepository.files) {
          if (currentFiles.get(file.relativePath) !== file.objectHash) {
            stale.push(
              issue(
                "repository_file_changed",
                `The Git object for ${file.relativePath} changed or is unavailable.`,
                "Re-read this file and recompute any decisions or diffs that depend on it.",
                {
                  relativePath: file.relativePath,
                  expected: file.objectHash,
                  actual: currentFiles.get(file.relativePath) ?? null,
                },
              ),
            );
          }
        }
      }
    }

    const currentResearch = inspectResearch
      ? await inspectResearch({
          projectId: input.projectId,
          research: envelope.payload.research,
        })
      : null;
    if (currentResearch) {
      const currentObjects = new Map(
        (currentResearch.objects ?? []).map((object) => [object.id, object]),
      );
      for (const sourceObject of envelope.payload.research.objects) {
        const currentObject = currentObjects.get(sourceObject.id);
        if (
          !currentObject ||
          currentObject.version !== sourceObject.version ||
          currentObject.contentHash !== sourceObject.contentHash
        ) {
          stale.push(
            issue(
              "research_object_changed",
              `Research object ${sourceObject.id} changed or is unavailable.`,
              "Open the current research object version and reassess its recorded task impact.",
              {
                objectId: sourceObject.id,
                expectedVersion: sourceObject.version,
                actualVersion: currentObject?.version ?? null,
              },
            ),
          );
        }
      }
    }

    const capabilities = normalizeCapabilities(
      getProviderCapabilities
        ? await getProviderCapabilities({ projectId: input.projectId })
        : envelope.payload.providerRequirements.capabilities,
    );
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

    return {
      compatible: conflicts.length === 0,
      stale,
      conflicts,
      explanations: [...conflicts, ...stale],
      schemaVersion: envelope.schemaVersion,
      migrated: input.envelope.schemaVersion !== envelope.schemaVersion,
      envelope,
      payload: envelope.payload,
    };
  }

  async function importHandoff(inputOrProjectId, possibleEnvelope) {
    const input =
      typeof inputOrProjectId === "string"
        ? { projectId: inputOrProjectId, envelope: possibleEnvelope }
        : inputOrProjectId;
    const inspection = await inspectImport(input);
    if (!inspection.compatible || !inspection.envelope) {
      const explanation = inspection.conflicts
        .map((conflict) => conflict.message)
        .join(" ");
      throw new Error(`Cly Dev handoff import refused. ${explanation}`);
    }
    const { record, duplicate } = await repository.recordImport(
      input.projectId,
      inspection.envelope,
      {
        compatible: inspection.compatible,
        stale: inspection.stale,
        conflicts: inspection.conflicts,
        explanations: inspection.explanations,
      },
    );
    return {
      record,
      duplicate,
      inspection,
      payload: inspection.payload,
    };
  }

  return { exportHandoff, inspectImport, importHandoff };
}
