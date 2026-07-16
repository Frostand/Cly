import { createHash, randomUUID } from "node:crypto";
import {
  CLY_DEV_PAYLOAD_VERSION,
  CLY_DEV_SCHEMA_VERSION,
  clyDevContextManifestInputSchema,
  clyDevEventInputSchema,
  clyDevSessionAggregateInputSchema,
  clyDevSessionInputSchema,
  clyDevSessionStates,
  clyDevTaskInputSchema,
  clyDevWorkspaceInputSchema,
} from "./session-schema.js";

const states = new Set(clyDevSessionStates);
const json = (value) => JSON.stringify(value);
const parse = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
const transaction = (db, operation) => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

const workspaceFromRow = (row) => ({
  id: row.id,
  projectId: row.project_id,
  schemaVersion: row.schema_version,
  idempotencyKey: row.idempotency_key,
  name: row.name,
  repository: parse(row.repository_json, {}),
  worktree: parse(row.worktree_json, {}),
  machine: parse(row.machine_json, {}),
  localOnly: parse(row.local_only_json, {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const contextManifestFromRow = (row) => {
  const transferable = parse(row.transferable_json, {});
  return {
    id: row.id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    schemaVersion: row.schema_version,
    idempotencyKey: row.idempotency_key,
    localOnly: parse(row.local_only_json, {}),
    transferable,
    createdAt: row.created_at,
  };
};
const taskFromRow = (row) => ({
  id: row.id,
  projectId: row.project_id,
  workspaceId: row.workspace_id,
  schemaVersion: row.schema_version,
  idempotencyKey: row.idempotency_key,
  title: row.title,
  objective: row.objective,
  researchObjectIds: parse(row.research_object_ids_json, []),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const sessionFromRow = (row) => ({
  id: row.id,
  projectId: row.project_id,
  taskId: row.task_id,
  contextManifestId: row.context_manifest_id,
  schemaVersion: row.schema_version,
  idempotencyKey: row.idempotency_key,
  title: row.title,
  provider: parse(row.provider_json, {}),
  providerId: parse(row.provider_json, {}).id,
  model: parse(row.provider_json, {}).model,
  commit: parse(row.commit_json, {}),
  state: row.state,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
const eventFromRow = (row) => ({
  id: row.id,
  projectId: row.project_id,
  sessionId: row.session_id,
  schemaVersion: row.schema_version,
  payloadVersion: row.payload_version,
  sequence: row.sequence,
  idempotencyKey: row.idempotency_key,
  type: row.type,
  transferability: row.transferability,
  occurredAt: row.occurred_at,
  actor: parse(row.actor_json, {}),
  payload: parse(row.payload_json, {}),
  provenance: parse(row.provenance_json, {}),
  outboundEnvelope: row.outbound_envelope_json
    ? parse(row.outbound_envelope_json, null)
    : null,
  outboundSha256: row.outbound_sha256,
  recordedAt: row.recorded_at,
});
const approvalFromRow = (row) => ({
  id: row.id,
  projectId: row.project_id,
  sessionId: row.session_id,
  schemaVersion: row.schema_version,
  payloadVersion: row.payload_version,
  state: row.state,
  requestSequence: row.request_sequence,
  resolutionSequence: row.resolution_sequence,
  payload: parse(row.payload_json, {}),
  requestedAt: row.requested_at,
  resolvedAt: row.resolved_at,
});

const findSession = (db, projectId, sessionId) => {
  const row = db
    .prepare("SELECT * FROM cly_dev_sessions WHERE id = ? AND project_id = ?")
    .get(sessionId, projectId);
  if (!row) throw new Error("Cly Dev session was not found in this project.");
  return row;
};
const buildOutboundContext = (db, projectId, sessionId) => {
  const row = db
    .prepare(
      `SELECT manifests.id AS manifest_id, manifests.schema_version AS manifest_schema_version,
              manifests.transferable_json, workspaces.repository_json,
              workspaces.worktree_json, workspaces.machine_json,
              tasks.research_object_ids_json, sessions.provider_json, sessions.commit_json
       FROM cly_dev_sessions sessions
       JOIN cly_dev_context_manifests manifests
         ON manifests.id = sessions.context_manifest_id AND manifests.project_id = sessions.project_id
       JOIN cly_dev_tasks tasks
         ON tasks.id = sessions.task_id AND tasks.project_id = sessions.project_id
       JOIN cly_dev_workspaces workspaces
         ON workspaces.id = tasks.workspace_id AND workspaces.project_id = tasks.project_id
       WHERE sessions.id = ? AND sessions.project_id = ?`,
    )
    .get(sessionId, projectId);
  if (!row) throw new Error("Cly Dev session was not found in this project.");
  const repository = parse(row.repository_json, {});
  const commit = parse(row.commit_json, {});
  const context = parse(row.transferable_json, {});
  for (const entry of context.entries ?? []) {
    if (
      entry.kind === "repository_file" &&
      (entry.repositoryId !== repository.id || entry.commitSha !== commit.sha)
    ) {
      throw new Error(
        "Repository-file context must match the session repository and full commit identity.",
      );
    }
  }
  const envelope = {
    schemaVersion: CLY_DEV_SCHEMA_VERSION,
    kind: "cly.context_manifest",
    manifest: {
      id: row.manifest_id,
      schemaVersion: row.manifest_schema_version,
      ...context,
    },
    provenance: {
      repository,
      worktree: parse(row.worktree_json, {}),
      commit,
      machine: parse(row.machine_json, {}),
      provider: parse(row.provider_json, {}),
      research: { objectIds: parse(row.research_object_ids_json, []) },
    },
  };
  const bytes = json(envelope);
  return {
    envelope,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
};
const buildOutboundEvent = ({ event, provenance, sequence, sessionId }) => {
  const envelope = {
    schemaVersion: CLY_DEV_SCHEMA_VERSION,
    kind: "cly.session_event",
    sessionId,
    sequence,
    event: {
      schemaVersion: event.schemaVersion,
      payloadVersion: event.payloadVersion,
      idempotencyKey: event.idempotencyKey,
      type: event.type,
      occurredAt: event.occurredAt,
      actor: event.actor,
      payload: event.payload,
    },
    provenance,
  };
  const bytes = json(envelope);
  return {
    envelope,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
};
const nextState = (current, event) => {
  if (event.type === "session.interrupted") return "interrupted";
  if (event.type === "session.resumable") return "resumable";
  if (event.type === "approval.requested") return "awaiting_approval";
  if (
    event.type === "session.state.changed" &&
    states.has(event.payload.state)
  ) {
    return event.payload.state;
  }
  return current;
};

export function createClyDevSessionRepository({
  db,
  now = () => new Date().toISOString(),
}) {
  if (!db) throw new Error("A SQLite database is required.");

  const insertWorkspace = (projectId, input) => {
    const duplicate = db
      .prepare(
        "SELECT * FROM cly_dev_workspaces WHERE project_id = ? AND idempotency_key = ?",
      )
      .get(projectId, input.idempotencyKey);
    if (duplicate) return workspaceFromRow(duplicate);
    const id = input.id ?? randomUUID();
    const timestamp = now();
    db.prepare(
      `INSERT INTO cly_dev_workspaces
       (id, project_id, schema_version, idempotency_key, name, repository_json,
        worktree_json, machine_json, local_only_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      projectId,
      input.schemaVersion,
      input.idempotencyKey,
      input.name,
      json(input.repository),
      json(input.worktree),
      json(input.machine),
      json(input.localOnly),
      timestamp,
      timestamp,
    );
    return workspaceFromRow(
      db
        .prepare(
          "SELECT * FROM cly_dev_workspaces WHERE id = ? AND project_id = ?",
        )
        .get(id, projectId),
    );
  };

  const insertContextManifest = (projectId, workspaceId, input) => {
    const duplicate = db
      .prepare(
        "SELECT * FROM cly_dev_context_manifests WHERE project_id = ? AND idempotency_key = ?",
      )
      .get(projectId, input.idempotencyKey);
    if (duplicate) return contextManifestFromRow(duplicate);
    const workspace = db
      .prepare(
        "SELECT id FROM cly_dev_workspaces WHERE id = ? AND project_id = ?",
      )
      .get(workspaceId, projectId);
    if (!workspace)
      throw new Error("Cly Dev workspace was not found in this project.");
    const id = input.id ?? randomUUID();
    db.prepare(
      `INSERT INTO cly_dev_context_manifests
       (id, project_id, workspace_id, schema_version, idempotency_key,
        local_only_json, transferable_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      projectId,
      workspaceId,
      input.schemaVersion,
      input.idempotencyKey,
      json(input.localOnly),
      json(input.transferable),
      now(),
    );
    return contextManifestFromRow(
      db
        .prepare(
          "SELECT * FROM cly_dev_context_manifests WHERE id = ? AND project_id = ?",
        )
        .get(id, projectId),
    );
  };

  const insertTask = (projectId, workspaceId, input) => {
    const duplicate = db
      .prepare(
        "SELECT * FROM cly_dev_tasks WHERE project_id = ? AND idempotency_key = ?",
      )
      .get(projectId, input.idempotencyKey);
    if (duplicate) return taskFromRow(duplicate);
    const workspace = db
      .prepare(
        "SELECT id FROM cly_dev_workspaces WHERE id = ? AND project_id = ?",
      )
      .get(workspaceId, projectId);
    if (!workspace)
      throw new Error("Cly Dev workspace was not found in this project.");
    const id = input.id ?? randomUUID();
    const timestamp = now();
    db.prepare(
      `INSERT INTO cly_dev_tasks
       (id, project_id, workspace_id, schema_version, idempotency_key, title,
        objective, research_object_ids_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      projectId,
      workspaceId,
      input.schemaVersion,
      input.idempotencyKey,
      input.title,
      input.objective,
      json(input.researchObjectIds),
      timestamp,
      timestamp,
    );
    return taskFromRow(
      db
        .prepare("SELECT * FROM cly_dev_tasks WHERE id = ? AND project_id = ?")
        .get(id, projectId),
    );
  };

  const insertSession = (projectId, taskId, input) => {
    const duplicate = db
      .prepare(
        "SELECT * FROM cly_dev_sessions WHERE project_id = ? AND idempotency_key = ?",
      )
      .get(projectId, input.idempotencyKey);
    if (duplicate) return sessionFromRow(duplicate);
    const task = db
      .prepare(
        "SELECT id, workspace_id FROM cly_dev_tasks WHERE id = ? AND project_id = ?",
      )
      .get(taskId, projectId);
    if (!task) throw new Error("Cly Dev task was not found in this project.");
    const manifest = db
      .prepare(
        "SELECT workspace_id FROM cly_dev_context_manifests WHERE id = ? AND project_id = ?",
      )
      .get(input.contextManifestId, projectId);
    if (!manifest || manifest.workspace_id !== task.workspace_id) {
      throw new Error(
        "The context manifest must belong to the task workspace.",
      );
    }
    const id = input.id ?? randomUUID();
    const timestamp = now();
    db.prepare(
      `INSERT INTO cly_dev_sessions
       (id, project_id, task_id, context_manifest_id, schema_version,
        idempotency_key, title, provider_json, commit_json, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      projectId,
      taskId,
      input.contextManifestId,
      input.schemaVersion,
      input.idempotencyKey,
      input.title,
      json(input.provider),
      json(input.commit),
      input.state,
      timestamp,
      timestamp,
    );
    db.prepare(
      `INSERT INTO cly_dev_session_projections
       (session_id, project_id, schema_version, state, last_sequence, snapshot_json, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    ).run(
      id,
      projectId,
      CLY_DEV_SCHEMA_VERSION,
      input.state,
      json({ process: null }),
      timestamp,
    );
    return sessionFromRow(
      db
        .prepare(
          "SELECT * FROM cly_dev_sessions WHERE id = ? AND project_id = ?",
        )
        .get(id, projectId),
    );
  };

  const repository = {
    createWorkspace(projectId, rawInput) {
      const input = clyDevWorkspaceInputSchema.parse(rawInput);
      return transaction(db, () => insertWorkspace(projectId, input));
    },
    listWorkspaces(projectId) {
      return db
        .prepare(
          "SELECT * FROM cly_dev_workspaces WHERE project_id = ? ORDER BY updated_at DESC, id",
        )
        .all(projectId)
        .map(workspaceFromRow);
    },
    createContextManifest(projectId, workspaceId, rawInput) {
      const input = clyDevContextManifestInputSchema.parse(rawInput);
      return transaction(db, () =>
        insertContextManifest(projectId, workspaceId, input),
      );
    },
    getContextManifest(projectId, manifestId) {
      const row = db
        .prepare(
          "SELECT * FROM cly_dev_context_manifests WHERE id = ? AND project_id = ?",
        )
        .get(manifestId, projectId);
      if (!row)
        throw new Error(
          "Cly Dev context manifest was not found in this project.",
        );
      return contextManifestFromRow(row);
    },
    getOutboundContext(projectId, sessionId) {
      const outbound = buildOutboundContext(db, projectId, sessionId);
      return {
        preview: outbound.envelope,
        egress: outbound.envelope,
        previewBytes: outbound.bytes,
        egressBytes: outbound.bytes,
        previewSha256: outbound.sha256,
        egressSha256: outbound.sha256,
      };
    },
    createTask(projectId, workspaceId, rawInput) {
      const input = clyDevTaskInputSchema.parse(rawInput);
      return transaction(db, () => insertTask(projectId, workspaceId, input));
    },
    listTasks(projectId, workspaceId) {
      const workspace = db
        .prepare(
          "SELECT id FROM cly_dev_workspaces WHERE id = ? AND project_id = ?",
        )
        .get(workspaceId, projectId);
      if (!workspace)
        throw new Error("Cly Dev workspace was not found in this project.");
      return db
        .prepare(
          "SELECT * FROM cly_dev_tasks WHERE project_id = ? AND workspace_id = ? ORDER BY updated_at DESC, id",
        )
        .all(projectId, workspaceId)
        .map(taskFromRow);
    },
    createSession(projectId, taskId, rawInput) {
      const input = clyDevSessionInputSchema.parse(rawInput);
      return transaction(db, () => insertSession(projectId, taskId, input));
    },
    createSessionAggregate(projectId, rawInput) {
      const input = clyDevSessionAggregateInputSchema.parse(rawInput);
      return transaction(db, () => {
        const workspace = insertWorkspace(projectId, input.workspace);
        const contextManifest = insertContextManifest(
          projectId,
          workspace.id,
          input.contextManifest,
        );
        const task = insertTask(projectId, workspace.id, input.task);
        const session = insertSession(projectId, task.id, {
          ...input.session,
          contextManifestId: contextManifest.id,
        });
        return { workspace, contextManifest, task, session };
      });
    },
    listSessions(projectId) {
      return db
        .prepare(
          "SELECT * FROM cly_dev_sessions WHERE project_id = ? ORDER BY updated_at DESC, id",
        )
        .all(projectId)
        .map(sessionFromRow);
    },
    listSessionOverviews(projectId, offset = 0, limit = 50) {
      const boundedOffset = Math.max(0, Number(offset) || 0);
      const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 50));
      const rows = db
        .prepare(
          `SELECT sessions.*, projections.last_sequence,
             (SELECT COUNT(*) FROM cly_dev_approvals approvals
              WHERE approvals.session_id = sessions.id AND approvals.state = 'pending') AS pending_approval_count
           FROM cly_dev_sessions sessions
           JOIN cly_dev_session_projections projections
             ON projections.session_id = sessions.id AND projections.project_id = sessions.project_id
           WHERE sessions.project_id = ? ORDER BY sessions.updated_at DESC, sessions.id
           LIMIT ? OFFSET ?`,
        )
        .all(projectId, boundedLimit + 1, boundedOffset);
      const hasMore = rows.length > boundedLimit;
      return {
        items: rows.slice(0, boundedLimit).map((row) => ({
          ...sessionFromRow(row),
          lastSequence: row.last_sequence,
          pendingApprovalCount: row.pending_approval_count,
          process: null,
        })),
        nextOffset: hasMore ? boundedOffset + boundedLimit : null,
      };
    },
    appendEvent(projectId, sessionId, rawEvent) {
      const event = clyDevEventInputSchema.parse(rawEvent);
      return transaction(db, () => {
        const sessionRow = findSession(db, projectId, sessionId);
        if (
          event.type === "context.manifest.recorded" &&
          event.payload.manifestId !== sessionRow.context_manifest_id
        ) {
          throw new Error(
            "A transferable context event must reference the session context manifest.",
          );
        }
        const duplicate = db
          .prepare(
            "SELECT * FROM cly_dev_session_events WHERE session_id = ? AND idempotency_key = ?",
          )
          .get(sessionId, event.idempotencyKey);
        if (duplicate) return eventFromRow(duplicate);
        const projection = db
          .prepare(
            "SELECT * FROM cly_dev_session_projections WHERE session_id = ? AND project_id = ?",
          )
          .get(sessionId, projectId);
        const provenanceRow = db
          .prepare(
            `SELECT workspaces.repository_json, workspaces.worktree_json, workspaces.machine_json,
                    tasks.research_object_ids_json, sessions.provider_json, sessions.commit_json
             FROM cly_dev_sessions sessions
             JOIN cly_dev_tasks tasks ON tasks.id = sessions.task_id AND tasks.project_id = sessions.project_id
             JOIN cly_dev_workspaces workspaces ON workspaces.id = tasks.workspace_id AND workspaces.project_id = tasks.project_id
             WHERE sessions.id = ? AND sessions.project_id = ?`,
          )
          .get(sessionId, projectId);
        const provenance = {
          repository: parse(provenanceRow.repository_json, {}),
          worktree: parse(provenanceRow.worktree_json, {}),
          commit: parse(provenanceRow.commit_json, {}),
          machine: parse(provenanceRow.machine_json, {}),
          provider: parse(provenanceRow.provider_json, {}),
          research: {
            objectIds: parse(provenanceRow.research_object_ids_json, []),
          },
        };
        const sequence = projection.last_sequence + 1;
        const recordedAt = now();
        const id = randomUUID();
        const outbound =
          event.transferability === "transferable"
            ? event.type === "context.manifest.recorded"
              ? buildOutboundContext(db, projectId, sessionId)
              : buildOutboundEvent({ event, provenance, sequence, sessionId })
            : null;
        db.prepare(
          `INSERT INTO cly_dev_session_events
           (id, project_id, session_id, schema_version, payload_version, sequence,
            idempotency_key, type, transferability, occurred_at, actor_json,
            payload_json, provenance_json, outbound_envelope_json, outbound_sha256, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          projectId,
          sessionId,
          event.schemaVersion,
          event.payloadVersion,
          sequence,
          event.idempotencyKey,
          event.type,
          event.transferability,
          event.occurredAt,
          json(event.actor),
          json(event.payload),
          json(provenance),
          outbound?.bytes ?? null,
          outbound?.sha256 ?? null,
          recordedAt,
        );
        if (event.type === "approval.requested") {
          db.prepare(
            `INSERT INTO cly_dev_approvals
             (id, project_id, session_id, schema_version, payload_version, state,
              request_sequence, resolution_sequence, payload_json, requested_at, resolved_at)
             VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?, NULL)`,
          ).run(
            event.payload.approvalId,
            projectId,
            sessionId,
            CLY_DEV_SCHEMA_VERSION,
            CLY_DEV_PAYLOAD_VERSION,
            sequence,
            json(event.payload),
            event.occurredAt,
          );
        }
        if (event.type === "approval.resolved") {
          const approval = db
            .prepare(
              "SELECT * FROM cly_dev_approvals WHERE session_id = ? AND project_id = ? AND id = ?",
            )
            .get(sessionId, projectId, event.payload.approvalId);
          if (!approval)
            throw new Error(
              "An approval must be durably requested before it is resolved.",
            );
          if (approval.resolution_sequence !== null)
            throw new Error("The approval has already been resolved.");
          db.prepare(
            `UPDATE cly_dev_approvals SET state = ?, resolution_sequence = ?, payload_json = ?, resolved_at = ?
             WHERE session_id = ? AND project_id = ? AND id = ?`,
          ).run(
            event.payload.state,
            sequence,
            json({ ...parse(approval.payload_json, {}), ...event.payload }),
            event.occurredAt,
            sessionId,
            projectId,
            event.payload.approvalId,
          );
        }
        const state = nextState(projection.state, event);
        db.prepare(
          `UPDATE cly_dev_session_projections
           SET state = ?, last_sequence = ?, snapshot_json = ?, updated_at = ?
           WHERE session_id = ? AND project_id = ?`,
        ).run(
          state,
          sequence,
          json({
            process: null,
            lastEvent: {
              sequence,
              type: event.type,
              occurredAt: event.occurredAt,
            },
          }),
          recordedAt,
          sessionId,
          projectId,
        );
        db.prepare(
          "UPDATE cly_dev_sessions SET state = ?, updated_at = ? WHERE id = ? AND project_id = ?",
        ).run(state, recordedAt, sessionId, projectId);
        return eventFromRow(
          db
            .prepare("SELECT * FROM cly_dev_session_events WHERE id = ?")
            .get(id),
        );
      });
    },
    listEvents(projectId, sessionId, afterSequence = 0, limit = 100) {
      findSession(db, projectId, sessionId);
      const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
      return db
        .prepare(
          `SELECT * FROM cly_dev_session_events
           WHERE project_id = ? AND session_id = ? AND sequence > ?
           ORDER BY sequence LIMIT ?`,
        )
        .all(projectId, sessionId, afterSequence, boundedLimit)
        .map(eventFromRow);
    },
    getSnapshot(projectId, sessionId) {
      const session = sessionFromRow(findSession(db, projectId, sessionId));
      const projection = db
        .prepare(
          "SELECT * FROM cly_dev_session_projections WHERE session_id = ? AND project_id = ?",
        )
        .get(sessionId, projectId);
      const approvals = db
        .prepare(
          "SELECT * FROM cly_dev_approvals WHERE project_id = ? AND session_id = ? ORDER BY request_sequence",
        )
        .all(projectId, sessionId)
        .map(approvalFromRow);
      return {
        ...session,
        ...parse(projection.snapshot_json, {}),
        state: projection.state,
        lastSequence: projection.last_sequence,
        approvals,
        process: null,
      };
    },
    recoverInterruptedSessions(projectId) {
      const rows = db
        .prepare(
          `SELECT sessions.id, sessions.state, projections.last_sequence
           FROM cly_dev_sessions sessions JOIN cly_dev_session_projections projections
             ON projections.session_id = sessions.id AND projections.project_id = sessions.project_id
           WHERE sessions.project_id = ? AND sessions.state IN ('running','interrupted')
           ORDER BY sessions.created_at, sessions.id`,
        )
        .all(projectId);
      return rows.map((row) => {
        const interruptionSequence =
          row.last_sequence + (row.state === "running" ? 1 : 0);
        const recoveryEvent = (type) => ({
          schemaVersion: CLY_DEV_SCHEMA_VERSION,
          payloadVersion: CLY_DEV_PAYLOAD_VERSION,
          idempotencyKey: `startup-recovery:${row.id}:${interruptionSequence}:${type.split(".").at(-1)}`,
          type,
          transferability: "local-only",
          occurredAt: now(),
          actor: { kind: "system", id: "cly-startup-recovery" },
          payload: { reason: "application_restart", processRevived: false },
        });
        if (row.state === "running")
          repository.appendEvent(
            projectId,
            row.id,
            recoveryEvent("session.interrupted"),
          );
        repository.appendEvent(
          projectId,
          row.id,
          recoveryEvent("session.resumable"),
        );
        return repository.getSnapshot(projectId, row.id);
      });
    },
  };
  return repository;
}

export function recoverClyDevSessionsOnStartup(db, now) {
  const projectIds = db
    .prepare(
      "SELECT DISTINCT project_id FROM cly_dev_sessions WHERE state IN ('running','interrupted') ORDER BY project_id",
    )
    .all()
    .map((row) => row.project_id);
  const repository = createClyDevSessionRepository({ db, now });
  return projectIds.flatMap((projectId) =>
    repository.recoverInterruptedSessions(projectId),
  );
}
