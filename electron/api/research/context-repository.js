import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  contextApprovalSchema,
  contextItemCreateSchema,
  contextLifecycleSchema,
  contextManifestRequestSchema,
  contextPackInputSchema,
  contextPersistManifestSchema,
  contextProposalSchema,
  contextRevokeApprovalSchema,
  contextTransmissionApprovalSchema,
} from "./context-schema.js";
import { createObligationService } from "./obligation-service.js";

const parseJson = (value, fallback = []) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stable(nested)]),
    );
  }
  return value;
};
export const canonicalJson = (value) => JSON.stringify(stable(value));
export const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const mapRevision = (row) =>
  row
    ? {
        id: row.id,
        projectId: row.project_id,
        itemId: row.item_id,
        revision: row.revision,
        originClass: row.origin_class,
        referenceId: row.reference_id,
        content: row.content,
        confidence: row.confidence,
        evidenceRefs: parseJson(row.evidence_refs_json),
        lastCheckedAt: row.last_checked_at,
        producerProcess: row.producer_process,
        producerModel: row.producer_model,
        verificationState: row.verification_state,
        sensitivity: row.sensitivity,
        createdAt: row.created_at,
      }
    : null;

const mapItem = (db, row) => {
  if (!row) return null;
  const revisions = db
    .prepare(
      "SELECT * FROM agent_context_revisions WHERE project_id = ? AND item_id = ? ORDER BY revision DESC",
    )
    .all(row.project_id, row.id)
    .map(mapRevision);
  const approvedRevisionIds = new Set(
    db
      .prepare(
        `SELECT after_revision_id, action, metadata_json
         FROM agent_context_audit_events
         WHERE project_id = ? AND item_id = ?
           AND action IN ('context.created', 'context.revision_approved')
         ORDER BY created_at, id`,
      )
      .all(row.project_id, row.id)
      .filter(
        (event) =>
          event.action === "context.revision_approved" ||
          parseJson(event.metadata_json, {}).approved === true,
      )
      .map((event) => event.after_revision_id)
      .filter(Boolean),
  );
  if (row.approved_revision_id)
    approvedRevisionIds.add(row.approved_revision_id);
  return {
    id: row.id,
    projectId: row.project_id,
    label: row.label,
    approvedRevisionId: row.approved_revision_id,
    pinned: Boolean(row.pinned),
    locked: Boolean(row.locked),
    deletedAt: row.deleted_at,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedRevision:
      revisions.find((revision) => revision.id === row.approved_revision_id) ??
      null,
    proposedRevisions: revisions.filter(
      (revision) => !approvedRevisionIds.has(revision.id),
    ),
    previouslyApprovedRevisions: revisions.filter(
      (revision) =>
        revision.id !== row.approved_revision_id &&
        approvedRevisionIds.has(revision.id),
    ),
    revisions,
  };
};

const mapPack = (db, row) =>
  row
    ? {
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        configurationId: row.configuration_id,
        roleId: row.role_id,
        revision: row.revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        entries: db
          .prepare(
            `SELECT entry.*, revision.origin_class, revision.reference_id,
                    revision.content, revision.verification_state
             FROM agent_context_pack_entries entry
             JOIN agent_context_revisions revision
               ON revision.id = entry.revision_id AND revision.project_id = entry.project_id
             WHERE entry.pack_id = ? AND entry.project_id = ? ORDER BY entry.position`,
          )
          .all(row.id, row.project_id)
          .map((entry) => ({
            position: entry.position,
            itemId: entry.item_id,
            revisionId: entry.revision_id,
            originClass: entry.origin_class,
            referenceId: entry.reference_id,
            representation: entry.representation,
            selectionReason: entry.selection_reason,
            sensitivity: entry.sensitivity,
            verificationState: entry.verification_state,
          })),
      }
    : null;

const mapManifest = (db, row) =>
  row
    ? {
        id: row.id,
        projectId: row.project_id,
        packId: row.pack_id,
        configurationId: row.configuration_id,
        roleId: row.role_id,
        provider: row.provider,
        model: row.model,
        schemaVersion: row.schema_version,
        idempotencyKey: row.idempotency_key,
        canonicalPayload: row.canonical_payload,
        sha256: row.sha256,
        totalTokens: row.total_tokens,
        entryCount: row.entry_count,
        excluded: parseJson(row.excluded_json),
        privacyWarnings: parseJson(row.privacy_warnings_json),
        selectedObjectIds: parseJson(row.selected_object_ids_json),
        obligationOperation: parseJson(row.obligation_operation_json, {}),
        obligationOperationHash: row.obligation_operation_hash,
        obligationEvaluationHash: row.obligation_evaluation_hash,
        transmissionApprovalId: row.transmission_approval_id,
        createdAt: row.created_at,
        entries: db
          .prepare(
            "SELECT * FROM agent_context_manifest_entries WHERE manifest_id = ? AND project_id = ? ORDER BY position",
          )
          .all(row.id, row.project_id)
          .map((entry) => ({
            position: entry.position,
            itemId: entry.item_id,
            revisionId: entry.revision_id,
            kind: entry.kind,
            referenceId: entry.reference_id,
            representation: entry.representation,
            tokenEstimate: entry.token_estimate,
            selectionReason: entry.selection_reason,
            sensitivity: entry.sensitivity,
          })),
      }
    : null;

const globRegex = (pattern) => {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      if (pattern[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (character === "*") source += "[^/]*";
    else if (character === "?") source += "[^/]";
    else source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${source}$`);
};

const tokenEstimate = (content) =>
  Math.max(1, Math.ceil(Buffer.byteLength(content, "utf8") / 4));
const summarize = (content) =>
  content.length <= 800 ? content : `${content.slice(0, 797)}…`;
const conflict = () => new Error("Agent context revision conflict.");

export function createContextRepository({
  db,
  now = () => new Date().toISOString(),
  createId = randomUUID,
  obligationService = createObligationService(db),
} = {}) {
  const ensureProject = (projectId) => {
    const project = db
      .prepare("SELECT id, path, metadata FROM projects WHERE id = ?")
      .get(projectId);
    if (!project) throw new Error("Project was not found.");
    return project;
  };

  const audit = (projectId, action, actor, fields = {}) => {
    db.prepare(
      `INSERT INTO agent_context_audit_events
       (id, project_id, item_id, pack_id, manifest_id, action, actor_id,
        producer_process, producer_model, before_revision_id, after_revision_id,
        metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      createId(),
      projectId,
      fields.itemId ?? null,
      fields.packId ?? null,
      fields.manifestId ?? null,
      action,
      actor?.actorId ?? "system",
      actor?.producerProcess ?? "cly-core",
      actor?.producerModel ?? null,
      fields.beforeRevisionId ?? null,
      fields.afterRevisionId ?? null,
      JSON.stringify(fields.metadata ?? {}),
      fields.createdAt ?? now(),
    );
  };

  const validateFile = (project, referenceId, allowedGlobs = null) => {
    const normalized = referenceId.replaceAll("\\", "/");
    if (
      path.isAbsolute(referenceId) ||
      normalized.split("/").some((part) => part === "..")
    )
      throw new Error(
        "File context must use a confined project-relative path.",
      );
    const root = realpathSync(project.path);
    const target = realpathSync(path.resolve(root, normalized));
    if (target !== root && !target.startsWith(`${root}${path.sep}`))
      throw new Error("File context resolves outside the project root.");
    const relative = path.relative(root, target).replaceAll(path.sep, "/");
    if (
      allowedGlobs &&
      !allowedGlobs.some((pattern) => globRegex(pattern).test(relative))
    )
      throw new Error(`File “${relative}” is not allowed for this role.`);
    return relative;
  };

  const validateReference = (projectId, project, originClass, referenceId) => {
    if (originClass === "graph_object") {
      if (
        !db
          .prepare(
            "SELECT id FROM research_objects WHERE id = ? AND project_id = ?",
          )
          .get(referenceId, projectId)
      )
        throw new Error("Research object does not belong to the project.");
    } else if (originClass === "source_passage") {
      const objectId = referenceId.split("#", 1)[0];
      if (
        !db
          .prepare(
            "SELECT id FROM research_objects WHERE id = ? AND project_id = ? AND type = 'source'",
          )
          .get(objectId, projectId)
      )
        throw new Error("Source passage does not belong to the project.");
    } else if (originClass === "conversation") {
      if (
        !db
          .prepare("SELECT id FROM chats WHERE id = ? AND project_id = ?")
          .get(referenceId, projectId)
      )
        throw new Error("Conversation does not belong to the project.");
    } else if (originClass === "file") validateFile(project, referenceId);
  };

  const validateEvidence = (projectId, project, refs) => {
    for (const reference of refs) {
      if (reference.startsWith("research-object:")) {
        validateReference(
          projectId,
          project,
          "graph_object",
          reference.slice("research-object:".length),
        );
      } else if (reference.startsWith("conversation:")) {
        validateReference(
          projectId,
          project,
          "conversation",
          reference.slice("conversation:".length),
        );
      } else if (reference.startsWith("file:")) {
        validateFile(project, reference.slice("file:".length));
      }
    }
  };

  const insertRevision = (projectId, itemId, input) => {
    const revision = db
      .prepare(
        "SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM agent_context_revisions WHERE project_id = ? AND item_id = ?",
      )
      .get(projectId, itemId).revision;
    const revisionId = createId();
    db.prepare(
      `INSERT INTO agent_context_revisions
       (id, project_id, item_id, revision, origin_class, reference_id, content,
        confidence, evidence_refs_json, last_checked_at, producer_process,
        producer_model, verification_state, sensitivity, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      revisionId,
      projectId,
      itemId,
      revision,
      input.originClass,
      input.referenceId,
      input.content,
      input.confidence,
      JSON.stringify([...new Set(input.evidenceRefs)]),
      input.lastCheckedAt,
      input.producerProcess,
      input.producerModel,
      input.verificationState,
      input.sensitivity,
      now(),
    );
    return revisionId;
  };

  const getItem = (projectId, itemId) =>
    mapItem(
      db,
      db
        .prepare(
          "SELECT * FROM agent_context_items WHERE id = ? AND project_id = ?",
        )
        .get(itemId, projectId),
    );

  const getPack = (projectId, packId) =>
    mapPack(
      db,
      db
        .prepare(
          "SELECT * FROM agent_context_packs WHERE id = ? AND project_id = ?",
        )
        .get(packId, projectId),
    );

  const getPolicy = (projectId, configurationId, roleId) => {
    const role = db
      .prepare(
        `SELECT role.*, configuration.revision AS configuration_revision
         FROM agent_role_configurations role
         JOIN agent_configurations configuration
           ON configuration.id = role.configuration_id AND configuration.project_id = role.project_id
         WHERE role.project_id = ? AND role.configuration_id = ? AND role.id = ?`,
      )
      .get(projectId, configurationId, roleId);
    if (!role)
      throw new Error("Configuration role does not belong to the project.");
    return {
      ...role,
      allowedContextSources: parseJson(role.allowed_context_sources_json),
      allowedFileGlobs: parseJson(role.allowed_file_globs_json),
      permissions: parseJson(role.permissions_json, {}),
    };
  };

  const selectedObjectIdsFor = (revision) => {
    const ids = [];
    if (revision.origin_class === "graph_object")
      ids.push(revision.reference_id);
    if (revision.origin_class === "source_passage")
      ids.push(revision.reference_id.split("#", 1)[0]);
    for (const reference of parseJson(revision.evidence_refs_json)) {
      if (reference.startsWith("research-object:"))
        ids.push(reference.slice("research-object:".length));
    }
    return ids;
  };

  const sourceAllowed = (policy, revision) => {
    const allowed = new Set(policy.allowedContextSources);
    return (
      allowed.has("project") ||
      allowed.has(revision.origin_class) ||
      allowed.has(`context:${revision.origin_class}`) ||
      allowed.has(revision.reference_id) ||
      selectedObjectIdsFor(revision).some(
        (id) =>
          allowed.has(`research-object:${id}`) || allowed.has(`source:${id}`),
      )
    );
  };

  const buildPreview = (projectId, rawInput) => {
    const input = contextManifestRequestSchema.parse(rawInput);
    const project = ensureProject(projectId);
    const pack = getPack(projectId, input.packId);
    if (!pack) throw new Error("Context pack does not belong to the project.");
    if (
      pack.configurationId !== input.configurationId ||
      pack.roleId !== input.roleId
    )
      throw new Error("Context pack policy binding does not match.");
    const policy = getPolicy(projectId, input.configurationId, input.roleId);
    if (policy.provider !== input.provider || policy.model !== input.model)
      throw new Error(
        "Provider/model destination is not allowed for this role.",
      );
    const metadata = parseJson(project.metadata, {});
    const selected = [];
    const excluded = [];
    const restrictedReferenceIds = [];
    const selectedObjectIds = [];
    const rows = db
      .prepare(
        `SELECT entry.*, revision.origin_class, revision.reference_id,
                revision.content, revision.evidence_refs_json,
                revision.verification_state, item.deleted_at, item.locked,
                item.approved_revision_id
         FROM agent_context_pack_entries entry
         JOIN agent_context_revisions revision
           ON revision.id = entry.revision_id AND revision.project_id = entry.project_id
         JOIN agent_context_items item
           ON item.id = entry.item_id AND item.project_id = entry.project_id
         WHERE entry.pack_id = ? AND entry.project_id = ? ORDER BY entry.position`,
      )
      .all(pack.id, projectId);
    for (const row of rows) {
      const safeExcluded = (reason) =>
        excluded.push({ referenceId: row.reference_id, reason });
      if (row.sensitivity === "local_only") {
        safeExcluded(
          "Local-only context is never eligible for provider transmission.",
        );
        continue;
      }
      if (row.deleted_at) {
        safeExcluded("Deleted context is not eligible for transmission.");
        continue;
      }
      if (row.approved_revision_id !== row.revision_id)
        throw new Error(
          "Outbound context packs may include only each item's current approved revision.",
        );
      if (["stale", "conflicted"].includes(row.verification_state)) {
        safeExcluded(`${row.verification_state} context requires review.`);
        continue;
      }
      if (!sourceAllowed(policy, row)) {
        safeExcluded("The selected role does not allow this context source.");
        continue;
      }
      if (row.origin_class === "file") {
        if (!policy.permissions.canReadFiles)
          throw new Error("The selected role cannot read files.");
        validateFile(project, row.reference_id, policy.allowedFileGlobs);
      }
      const rendered =
        row.representation === "summary" ? summarize(row.content) : row.content;
      const entry = {
        itemId: row.item_id,
        kind: row.origin_class,
        referenceId: row.reference_id,
        revisionId: row.revision_id,
        representation: row.representation,
        tokenEstimate: tokenEstimate(rendered),
        selectionReason: row.selection_reason,
        sensitivity: row.sensitivity,
        content: rendered,
      };
      selected.push(entry);
      selectedObjectIds.push(...selectedObjectIdsFor(row));
      if (row.sensitivity === "restricted")
        restrictedReferenceIds.push(row.reference_id);
    }
    const exactObjectIds = [...new Set(selectedObjectIds)].sort();
    const obligationOperation = {
      kind: "provider-transmission",
      integration: "agent-context",
      objectIds: exactObjectIds,
      purpose: input.purpose,
      collaborators: [...new Set(input.collaborators)].sort(),
      provider: input.provider,
      residency: input.residency,
      license: input.license,
      external: true,
    };
    const obligationOperationHash = sha256(canonicalJson(obligationOperation));
    const obligationEvaluation =
      exactObjectIds.length === 0
        ? {
            decision: "allow",
            complete: true,
            evaluationHash: sha256(
              canonicalJson({
                projectId,
                operation: obligationOperation,
                decision: "allow",
              }),
            ),
            alerts: [],
          }
        : obligationService.safeEvaluateOperation(
            projectId,
            obligationOperation,
          );
    const privacyWarnings = [];
    if (metadata.localOnly === true)
      privacyWarnings.push({
        code: "PROJECT_LOCAL_ONLY",
        message: "This project is marked local-only and cannot be transmitted.",
        referenceIds: selected.map((entry) => entry.referenceId),
      });
    if (restrictedReferenceIds.length > 0)
      privacyWarnings.push({
        code: "RESTRICTED_APPROVAL_REQUIRED",
        message: "Restricted context requires durable exact-scope approval.",
        referenceIds: [...new Set(restrictedReferenceIds)].sort(),
      });
    for (const alert of obligationEvaluation.alerts ?? [])
      privacyWarnings.push({
        code: `OBLIGATION_${String(alert.severity ?? "warning").toUpperCase()}`,
        message: alert.rationale,
        referenceIds: alert.affectedObjectIds ?? exactObjectIds,
      });
    const payload = {
      schemaVersion: 1,
      destination: { provider: input.provider, model: input.model },
      policy: {
        configurationId: input.configurationId,
        configurationRevision: policy.configuration_revision,
        roleId: input.roleId,
      },
      obligationOperation,
      entries: selected,
    };
    const canonicalPayload = canonicalJson(payload);
    return {
      packId: input.packId,
      configurationId: input.configurationId,
      roleId: input.roleId,
      provider: input.provider,
      model: input.model,
      canonicalPayload,
      sha256: sha256(canonicalPayload),
      entryCount: selected.length,
      totalTokens: selected.reduce(
        (total, entry) => total + entry.tokenEstimate,
        0,
      ),
      entries: selected.map(({ content: _content, ...entry }) => entry),
      excluded,
      privacyWarnings,
      selectedObjectIds: exactObjectIds,
      obligationOperation,
      obligationOperationHash,
      restrictedReferenceIds: [...new Set(restrictedReferenceIds)].sort(),
      obligationEvaluation,
    };
  };

  const verifyApproval = (projectId, preview, approvalId) => {
    if (preview.restrictedReferenceIds.length === 0) return null;
    if (!approvalId)
      throw new Error("Restricted context requires transmission approval.");
    const approval = db
      .prepare(
        "SELECT * FROM agent_context_transmission_approvals WHERE id = ? AND project_id = ?",
      )
      .get(approvalId, projectId);
    if (!approval || approval.state !== "approved")
      throw new Error("Transmission approval is missing or revoked.");
    if (approval.expires_at) {
      const expiresAt = new Date(approval.expires_at);
      if (Number.isNaN(expiresAt.getTime()))
        throw new Error("Transmission approval expiry is invalid.");
      if (expiresAt <= new Date(now()))
        throw new Error("Transmission approval has expired.");
    }
    if (
      approval.manifest_sha256 !== preview.sha256 ||
      approval.provider !== preview.provider ||
      approval.model !== preview.model ||
      canonicalJson(
        parseJson(approval.restricted_reference_ids_json).sort(),
      ) !== canonicalJson(preview.restrictedReferenceIds)
    )
      throw new Error(
        "Transmission approval scope does not match the manifest.",
      );
    return approval.id;
  };

  return {
    getItem,
    listItems(projectId) {
      ensureProject(projectId);
      return db
        .prepare(
          "SELECT * FROM agent_context_items WHERE project_id = ? ORDER BY updated_at DESC, id",
        )
        .all(projectId)
        .map((row) => mapItem(db, row));
    },
    listPacks(projectId) {
      ensureProject(projectId);
      return db
        .prepare(
          "SELECT * FROM agent_context_packs WHERE project_id = ? ORDER BY updated_at DESC, id",
        )
        .all(projectId)
        .map((row) => mapPack(db, row));
    },
    listManifests(projectId) {
      ensureProject(projectId);
      return db
        .prepare(
          "SELECT * FROM agent_context_manifests WHERE project_id = ? ORDER BY created_at DESC, id",
        )
        .all(projectId)
        .map((row) => mapManifest(db, row));
    },
    listAudit(projectId) {
      ensureProject(projectId);
      return db
        .prepare(
          "SELECT * FROM agent_context_audit_events WHERE project_id = ? ORDER BY created_at, id",
        )
        .all(projectId)
        .map((row) => ({
          id: row.id,
          action: row.action,
          itemId: row.item_id,
          packId: row.pack_id,
          manifestId: row.manifest_id,
          actorId: row.actor_id,
          producerProcess: row.producer_process,
          producerModel: row.producer_model,
          beforeRevisionId: row.before_revision_id,
          afterRevisionId: row.after_revision_id,
          metadata: parseJson(row.metadata_json, {}),
          createdAt: row.created_at,
        }));
    },
    snapshot(projectId) {
      return {
        items: this.listItems(projectId),
        packs: this.listPacks(projectId),
        manifests: this.listManifests(projectId),
      };
    },
    createItem(projectId, rawInput) {
      const input = contextItemCreateSchema.parse(rawInput);
      const project = ensureProject(projectId);
      validateReference(
        projectId,
        project,
        input.revision.originClass,
        input.revision.referenceId,
      );
      validateEvidence(projectId, project, input.revision.evidenceRefs);
      const itemId = input.id ?? createId();
      const createdAt = now();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          `INSERT INTO agent_context_items
           (id, project_id, label, version, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, ?)`,
        ).run(itemId, projectId, input.label, createdAt, createdAt);
        const revisionId = insertRevision(projectId, itemId, input.revision);
        audit(projectId, "context.created", input.actor, {
          itemId,
          afterRevisionId: revisionId,
          metadata: { approved: input.approve },
          createdAt,
        });
        if (input.approve) {
          db.prepare(
            "UPDATE agent_context_items SET approved_revision_id = ? WHERE id = ? AND project_id = ?",
          ).run(revisionId, itemId, projectId);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return getItem(projectId, itemId);
    },
    proposeRevision(projectId, itemId, rawInput) {
      const input = contextProposalSchema.parse(rawInput);
      const project = ensureProject(projectId);
      validateReference(
        projectId,
        project,
        input.revision.originClass,
        input.revision.referenceId,
      );
      validateEvidence(projectId, project, input.revision.evidenceRefs);
      db.exec("BEGIN IMMEDIATE");
      try {
        const item = db
          .prepare(
            "SELECT * FROM agent_context_items WHERE id = ? AND project_id = ?",
          )
          .get(itemId, projectId);
        if (!item)
          throw new Error("Context item does not belong to the project.");
        if (item.locked) throw new Error("Locked context cannot be revised.");
        if (item.deleted_at)
          throw new Error("Deleted context cannot be revised.");
        if (item.version !== input.expectedVersion) throw conflict();
        const revisionId = insertRevision(projectId, itemId, input.revision);
        const updated = db
          .prepare(
            `UPDATE agent_context_items SET version = version + 1, updated_at = ?
             WHERE id = ? AND project_id = ? AND version = ?`,
          )
          .run(now(), itemId, projectId, input.expectedVersion);
        if (updated.changes !== 1) throw conflict();
        audit(projectId, "context.revision_proposed", input.actor, {
          itemId,
          beforeRevisionId: item.approved_revision_id,
          afterRevisionId: revisionId,
        });
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return getItem(projectId, itemId);
    },
    approveRevision(projectId, itemId, revisionId, rawInput) {
      const input = contextApprovalSchema.parse(rawInput);
      ensureProject(projectId);
      db.exec("BEGIN IMMEDIATE");
      try {
        const item = db
          .prepare(
            "SELECT * FROM agent_context_items WHERE id = ? AND project_id = ?",
          )
          .get(itemId, projectId);
        if (!item)
          throw new Error("Context item does not belong to the project.");
        if (item.locked) throw new Error("Locked context cannot be approved.");
        if (item.deleted_at)
          throw new Error("Deleted context cannot be approved.");
        if (item.version !== input.expectedVersion) throw conflict();
        if (
          !db
            .prepare(
              "SELECT id FROM agent_context_revisions WHERE id = ? AND item_id = ? AND project_id = ?",
            )
            .get(revisionId, itemId, projectId)
        )
          throw new Error("Revision does not belong to the context item.");
        const approvedAt = now();
        audit(projectId, "context.revision_approved", input.actor, {
          itemId,
          beforeRevisionId: item.approved_revision_id,
          afterRevisionId: revisionId,
          createdAt: approvedAt,
        });
        const result = db
          .prepare(
            `UPDATE agent_context_items SET approved_revision_id = ?, version = version + 1, updated_at = ?
             WHERE id = ? AND project_id = ? AND version = ?`,
          )
          .run(
            revisionId,
            approvedAt,
            itemId,
            projectId,
            input.expectedVersion,
          );
        if (result.changes !== 1) throw conflict();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return getItem(projectId, itemId);
    },
    setLifecycle(projectId, itemId, rawInput) {
      const input = contextLifecycleSchema.parse(rawInput);
      ensureProject(projectId);
      db.exec("BEGIN IMMEDIATE");
      try {
        const item = db
          .prepare(
            "SELECT * FROM agent_context_items WHERE id = ? AND project_id = ?",
          )
          .get(itemId, projectId);
        if (!item)
          throw new Error("Context item does not belong to the project.");
        if (item.version !== input.expectedVersion) throw conflict();
        if (item.locked && !["unlock"].includes(input.action))
          throw new Error("Locked context must be unlocked before mutation.");
        if (item.deleted_at && !["restore"].includes(input.action))
          throw new Error("Deleted context must be restored before mutation.");
        const changes = {
          pin: [1, item.locked, item.deleted_at],
          unpin: [0, item.locked, item.deleted_at],
          lock: [item.pinned, 1, item.deleted_at],
          unlock: [item.pinned, 0, item.deleted_at],
          delete: [item.pinned, item.locked, now()],
          restore: [item.pinned, item.locked, null],
        }[input.action];
        const result = db
          .prepare(
            `UPDATE agent_context_items SET pinned = ?, locked = ?, deleted_at = ?,
             version = version + 1, updated_at = ?
             WHERE id = ? AND project_id = ? AND version = ?`,
          )
          .run(...changes, now(), itemId, projectId, input.expectedVersion);
        if (result.changes !== 1) throw conflict();
        audit(projectId, `context.${input.action}`, input.actor, {
          itemId,
          beforeRevisionId: item.approved_revision_id,
          afterRevisionId: item.approved_revision_id,
        });
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return getItem(projectId, itemId);
    },
    savePack(projectId, rawInput) {
      const input = contextPackInputSchema.parse(rawInput);
      ensureProject(projectId);
      getPolicy(projectId, input.configurationId, input.roleId);
      const packId = input.id ?? createId();
      const existing = getPack(projectId, packId);
      if (existing && input.expectedRevision !== existing.revision)
        throw conflict();
      if (!existing && input.expectedRevision !== undefined) throw conflict();
      if (
        new Set(input.entries.map((entry) => entry.revisionId)).size !==
        input.entries.length
      )
        throw new Error("Context pack revisions must be unique.");
      for (const entry of input.entries) {
        const revision = db
          .prepare(
            `SELECT revision.sensitivity, item.deleted_at,
                    item.approved_revision_id
             FROM agent_context_revisions revision
             JOIN agent_context_items item
               ON item.id = revision.item_id AND item.project_id = revision.project_id
             WHERE revision.id = ? AND revision.item_id = ? AND revision.project_id = ?`,
          )
          .get(entry.revisionId, entry.itemId, projectId);
        if (!revision)
          throw new Error(
            "Context pack revision does not belong to the item and project.",
          );
        if (revision.deleted_at)
          throw new Error("Deleted context cannot be added to a pack.");
        if (revision.approved_revision_id !== entry.revisionId)
          throw new Error(
            "Outbound context packs may include only each item's current approved revision.",
          );
        if (revision.sensitivity !== entry.sensitivity)
          throw new Error(
            "Context pack sensitivity must match the immutable revision.",
          );
      }
      db.exec("BEGIN IMMEDIATE");
      try {
        const timestamp = now();
        if (existing) {
          const updated = db
            .prepare(
              `UPDATE agent_context_packs SET name = ?, configuration_id = ?, role_id = ?,
               revision = revision + 1, updated_at = ?
               WHERE id = ? AND project_id = ? AND revision = ?`,
            )
            .run(
              input.name,
              input.configurationId,
              input.roleId,
              timestamp,
              packId,
              projectId,
              input.expectedRevision,
            );
          if (updated.changes !== 1) throw conflict();
          db.prepare(
            "DELETE FROM agent_context_pack_entries WHERE pack_id = ? AND project_id = ?",
          ).run(packId, projectId);
        } else {
          db.prepare(
            `INSERT INTO agent_context_packs
             (id, project_id, name, configuration_id, role_id, revision, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
          ).run(
            packId,
            projectId,
            input.name,
            input.configurationId,
            input.roleId,
            timestamp,
            timestamp,
          );
        }
        const insert = db.prepare(
          `INSERT INTO agent_context_pack_entries
           (pack_id, project_id, position, item_id, revision_id, representation,
            selection_reason, sensitivity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        input.entries.forEach((entry, position) => {
          insert.run(
            packId,
            projectId,
            position,
            entry.itemId,
            entry.revisionId,
            entry.representation,
            entry.selectionReason,
            entry.sensitivity,
          );
        });
        audit(
          projectId,
          existing ? "context.pack_updated" : "context.pack_created",
          input.actor,
          {
            packId,
            metadata: { revision: (existing?.revision ?? 0) + 1 },
          },
        );
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return getPack(projectId, packId);
    },
    previewManifest: buildPreview,
    createTransmissionApproval(projectId, rawInput) {
      const input = contextTransmissionApprovalSchema.parse(rawInput);
      ensureProject(projectId);
      const id = createId();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          `INSERT INTO agent_context_transmission_approvals
           (id, project_id, manifest_sha256, provider, model,
            restricted_reference_ids_json, actor_id, rationale, state,
            expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?)`,
        ).run(
          id,
          projectId,
          input.manifestSha256,
          input.provider,
          input.model,
          JSON.stringify([...new Set(input.restrictedReferenceIds)].sort()),
          input.actorId,
          input.rationale,
          input.expiresAt,
          now(),
        );
        audit(
          projectId,
          "context.transmission_approved",
          {
            actorId: input.actorId,
            producerProcess: "cly-ui",
            producerModel: null,
          },
          {
            metadata: {
              approvalId: id,
              manifestSha256: input.manifestSha256,
            },
          },
        );
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return { id, projectId, ...input, state: "approved" };
    },
    revokeTransmissionApproval(projectId, approvalId, rawInput) {
      const input = contextRevokeApprovalSchema.parse(rawInput);
      ensureProject(projectId);
      db.exec("BEGIN IMMEDIATE");
      try {
        const revokedAt = now();
        audit(
          projectId,
          "context.transmission_approval_revoked",
          {
            actorId: input.actorId,
            producerProcess: "cly-ui",
            producerModel: null,
          },
          {
            metadata: { approvalId, rationale: input.rationale },
            createdAt: revokedAt,
          },
        );
        const result = db
          .prepare(
            `UPDATE agent_context_transmission_approvals
             SET state = 'revoked', revoked_at = ?
             WHERE id = ? AND project_id = ? AND state = 'approved'`,
          )
          .run(revokedAt, approvalId, projectId);
        if (result.changes !== 1)
          throw new Error(
            "Transmission approval was not found or already revoked.",
          );
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return { id: approvalId, state: "revoked" };
    },
    persistManifest(projectId, rawInput) {
      const input = contextPersistManifestSchema.parse(rawInput);
      const {
        idempotencyKey: _idempotencyKey,
        expectedSha256: _expectedSha256,
        transmissionApprovalId: _transmissionApprovalId,
        ...previewInput
      } = input;
      const preview = buildPreview(projectId, previewInput);
      if (preview.sha256 !== input.expectedSha256)
        throw new Error("Manifest preview hash no longer matches.");
      if (
        preview.privacyWarnings.some(
          (warning) => warning.code === "PROJECT_LOCAL_ONLY",
        )
      )
        throw new Error("Local-only projects cannot be transmitted.");
      if (
        !preview.obligationEvaluation.complete ||
        preview.obligationEvaluation.decision !== "allow"
      )
        throw new Error("Provider transmission is blocked by obligations.");
      const approvalId = verifyApproval(
        projectId,
        preview,
        input.transmissionApprovalId,
      );
      const existing = db
        .prepare(
          "SELECT * FROM agent_context_manifests WHERE project_id = ? AND idempotency_key = ?",
        )
        .get(projectId, input.idempotencyKey);
      if (existing) {
        if (
          existing.sha256 !== preview.sha256 ||
          existing.pack_id !== input.packId ||
          existing.transmission_approval_id !== approvalId
        )
          throw new Error("Manifest idempotency key collision.");
        return mapManifest(db, existing);
      }
      const manifestId = createId();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare(
          `INSERT INTO agent_context_manifests
           (id, project_id, pack_id, configuration_id, role_id, provider, model,
            schema_version, idempotency_key, canonical_payload, sha256, total_tokens,
            entry_count, excluded_json, privacy_warnings_json, selected_object_ids_json,
            obligation_operation_json, obligation_operation_hash,
            obligation_evaluation_hash, transmission_approval_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          manifestId,
          projectId,
          input.packId,
          input.configurationId,
          input.roleId,
          input.provider,
          input.model,
          input.idempotencyKey,
          preview.canonicalPayload,
          preview.sha256,
          preview.totalTokens,
          preview.entries.length,
          JSON.stringify(preview.excluded),
          JSON.stringify(preview.privacyWarnings),
          JSON.stringify(preview.selectedObjectIds),
          canonicalJson(preview.obligationOperation),
          preview.obligationOperationHash,
          preview.obligationEvaluation.evaluationHash,
          approvalId,
          now(),
        );
        const insert = db.prepare(
          `INSERT INTO agent_context_manifest_entries
           (manifest_id, project_id, position, item_id, revision_id, kind,
            reference_id, representation, token_estimate, selection_reason, sensitivity)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        preview.entries.forEach((entry, position) => {
          insert.run(
            manifestId,
            projectId,
            position,
            entry.itemId,
            entry.revisionId,
            entry.kind,
            entry.referenceId,
            entry.representation,
            entry.tokenEstimate,
            entry.selectionReason,
            entry.sensitivity,
          );
        });
        audit(
          projectId,
          "context.manifest_persisted",
          {
            actorId: "system",
            producerProcess: "cly-core",
            producerModel: null,
          },
          {
            manifestId,
            packId: input.packId,
            metadata: { sha256: preview.sha256 },
          },
        );
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return mapManifest(
        db,
        db
          .prepare(
            "SELECT * FROM agent_context_manifests WHERE id = ? AND project_id = ?",
          )
          .get(manifestId, projectId),
      );
    },
    loadManifestForEgress(projectId, manifestId, expected) {
      const project = ensureProject(projectId);
      const manifest = mapManifest(
        db,
        db
          .prepare(
            "SELECT * FROM agent_context_manifests WHERE id = ? AND project_id = ?",
          )
          .get(manifestId, projectId),
      );
      if (!manifest)
        throw new Error("Persisted context manifest was not found.");
      const sealed = db
        .prepare(
          `SELECT 1 FROM agent_context_audit_events
           WHERE project_id = ? AND manifest_id = ?
             AND action = 'context.manifest_persisted'`,
        )
        .get(projectId, manifest.id);
      if (!sealed)
        throw new Error("Persisted context manifest is not durably sealed.");
      if (parseJson(project.metadata, {}).localOnly === true)
        throw new Error(
          "Persisted context manifest cannot leave a local-only project.",
        );
      if (sha256(manifest.canonicalPayload) !== manifest.sha256)
        throw new Error("Persisted context manifest integrity check failed.");
      const canonicalPayload = JSON.parse(manifest.canonicalPayload);
      if (canonicalJson(canonicalPayload) !== manifest.canonicalPayload)
        throw new Error(
          "Persisted context manifest payload is not canonical JSON.",
        );
      const canonicalEntries = canonicalPayload.entries;
      if (
        !Array.isArray(canonicalEntries) ||
        manifest.entryCount !== canonicalEntries.length ||
        manifest.entries.length !== manifest.entryCount ||
        manifest.totalTokens !==
          manifest.entries.reduce(
            (total, entry) => total + entry.tokenEstimate,
            0,
          ) ||
        manifest.entries.some((entry, position) => entry.position !== position)
      )
        throw new Error(
          "Persisted context manifest child rows are incomplete or unsealed.",
        );
      const currentPolicy = getPolicy(
        projectId,
        manifest.configurationId,
        manifest.roleId,
      );
      const canonicalPolicy = canonicalPayload.policy;
      if (
        canonicalPayload.schemaVersion !== manifest.schemaVersion ||
        canonicalPayload.destination?.provider !== manifest.provider ||
        canonicalPayload.destination?.model !== manifest.model ||
        canonicalPolicy?.configurationId !== manifest.configurationId ||
        canonicalPolicy?.roleId !== manifest.roleId ||
        currentPolicy.provider !== manifest.provider ||
        currentPolicy.model !== manifest.model ||
        currentPolicy.configuration_revision !==
          canonicalPolicy.configurationRevision
      )
        throw new Error(
          "Persisted context manifest policy is stale; preview it again.",
        );
      const durableCanonicalEntries = [];
      const derivedSelectedObjectIds = [];
      for (const entry of manifest.entries) {
        const revision = db
          .prepare(
            `SELECT revision.*, item.deleted_at, item.approved_revision_id
             FROM agent_context_revisions revision
             JOIN agent_context_items item
               ON item.id = revision.item_id AND item.project_id = revision.project_id
             WHERE revision.id = ? AND revision.item_id = ? AND revision.project_id = ?`,
          )
          .get(entry.revisionId, entry.itemId, projectId);
        if (!revision)
          throw new Error(
            "Persisted context manifest revision binding is invalid.",
          );
        if (revision.deleted_at)
          throw new Error(
            "Persisted context manifest references context that is now deleted.",
          );
        if (revision.approved_revision_id !== entry.revisionId)
          throw new Error(
            "Persisted context manifest revision is no longer the current approved revision.",
          );
        if (
          revision.origin_class !== entry.kind ||
          revision.reference_id !== entry.referenceId ||
          revision.sensitivity !== entry.sensitivity
        )
          throw new Error(
            "Persisted context manifest child revision metadata is invalid.",
          );
        if (!sourceAllowed(currentPolicy, revision))
          throw new Error(
            "Persisted context manifest source is no longer allowed by the role policy.",
          );
        if (revision.origin_class === "file") {
          if (!currentPolicy.permissions.canReadFiles)
            throw new Error(
              "Persisted context manifest file access is no longer allowed by the role policy.",
            );
          validateFile(
            project,
            revision.reference_id,
            currentPolicy.allowedFileGlobs,
          );
        }
        const content =
          entry.representation === "summary"
            ? summarize(revision.content)
            : revision.content;
        const derivedTokenEstimate = tokenEstimate(content);
        if (entry.tokenEstimate !== derivedTokenEstimate)
          throw new Error(
            "Persisted context manifest token estimates are not server-derived.",
          );
        durableCanonicalEntries.push({
          itemId: entry.itemId,
          kind: entry.kind,
          referenceId: entry.referenceId,
          revisionId: entry.revisionId,
          representation: entry.representation,
          tokenEstimate: derivedTokenEstimate,
          selectionReason: entry.selectionReason,
          sensitivity: entry.sensitivity,
          content,
        });
        derivedSelectedObjectIds.push(...selectedObjectIdsFor(revision));
      }
      if (
        canonicalJson(durableCanonicalEntries) !==
        canonicalJson(canonicalEntries)
      )
        throw new Error(
          "Persisted context manifest child rows do not match its canonical entries.",
        );
      if (
        manifest.totalTokens !==
        durableCanonicalEntries.reduce(
          (total, entry) => total + entry.tokenEstimate,
          0,
        )
      )
        throw new Error(
          "Persisted context manifest total tokens are not server-derived.",
        );
      if (
        manifest.sha256 !== expected.sha256 ||
        manifest.provider !== expected.provider ||
        manifest.model !== expected.model ||
        manifest.configurationId !== expected.configurationId ||
        manifest.roleId !== expected.roleId
      )
        throw new Error("Persisted context manifest egress binding mismatch.");
      if (
        canonicalJson(manifest.obligationOperation) !==
          canonicalJson(canonicalPayload.obligationOperation) ||
        sha256(canonicalJson(manifest.obligationOperation)) !==
          manifest.obligationOperationHash ||
        manifest.obligationOperation.kind !== "provider-transmission" ||
        manifest.obligationOperation.integration !== "agent-context" ||
        manifest.obligationOperation.external !== true ||
        typeof manifest.obligationOperation.purpose !== "string" ||
        !Array.isArray(manifest.obligationOperation.collaborators) ||
        !manifest.obligationOperation.collaborators.every(
          (collaborator) => typeof collaborator === "string",
        ) ||
        canonicalJson(manifest.obligationOperation.collaborators) !==
          canonicalJson(
            [...new Set(manifest.obligationOperation.collaborators)].sort(),
          ) ||
        !Array.isArray(manifest.obligationOperation.objectIds) ||
        (manifest.obligationOperation.residency !== null &&
          typeof manifest.obligationOperation.residency !== "string") ||
        (manifest.obligationOperation.license !== null &&
          typeof manifest.obligationOperation.license !== "string") ||
        manifest.obligationOperation.provider !== manifest.provider ||
        canonicalJson([...new Set(derivedSelectedObjectIds)].sort()) !==
          canonicalJson(manifest.selectedObjectIds) ||
        canonicalJson(manifest.obligationOperation.objectIds) !==
          canonicalJson(manifest.selectedObjectIds)
      )
        throw new Error(
          "Persisted context manifest obligation operation binding is invalid.",
        );
      const rebuiltCanonicalPayload = {
        schemaVersion: manifest.schemaVersion,
        destination: {
          provider: manifest.provider,
          model: manifest.model,
        },
        policy: {
          configurationId: manifest.configurationId,
          configurationRevision: currentPolicy.configuration_revision,
          roleId: manifest.roleId,
        },
        obligationOperation: {
          kind: manifest.obligationOperation.kind,
          integration: manifest.obligationOperation.integration,
          objectIds: manifest.obligationOperation.objectIds,
          purpose: manifest.obligationOperation.purpose,
          collaborators: manifest.obligationOperation.collaborators,
          provider: manifest.obligationOperation.provider,
          residency: manifest.obligationOperation.residency,
          license: manifest.obligationOperation.license,
          external: manifest.obligationOperation.external,
        },
        entries: durableCanonicalEntries,
      };
      if (canonicalJson(rebuiltCanonicalPayload) !== manifest.canonicalPayload)
        throw new Error(
          "Persisted context manifest has unknown or non-durable canonical fields.",
        );
      const restrictedReferenceIds = manifest.entries
        .filter((entry) => entry.sensitivity === "restricted")
        .map((entry) => entry.referenceId)
        .sort();
      verifyApproval(
        projectId,
        {
          sha256: manifest.sha256,
          provider: manifest.provider,
          model: manifest.model,
          restrictedReferenceIds,
        },
        manifest.transmissionApprovalId,
      );
      const evaluation =
        manifest.selectedObjectIds.length === 0
          ? {
              decision: "allow",
              complete: true,
              evaluationHash: sha256(
                canonicalJson({
                  projectId,
                  operation: manifest.obligationOperation,
                  decision: "allow",
                }),
              ),
            }
          : obligationService.safeEvaluateOperation(
              projectId,
              manifest.obligationOperation,
            );
      if (!evaluation.complete || evaluation.decision !== "allow")
        throw new Error(
          "Provider transmission is no longer allowed by obligations.",
        );
      if (evaluation.evaluationHash !== manifest.obligationEvaluationHash)
        throw new Error(
          "Provider transmission obligations changed; preview the manifest again.",
        );
      return manifest;
    },
  };
}
