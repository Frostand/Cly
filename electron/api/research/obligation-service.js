import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { createResearchRepository } from "./repository.js";

const nonEmptyString = z.string().trim().min(1).max(10_000);
const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/, "Use an ISO date or UTC timestamp.")
  .nullable()
  .default(null);
const stringList = z
  .array(z.string().trim().min(1).max(500))
  .max(100)
  .transform((values) => [...new Set(values)]);

export const datasetObligationInputSchema = z
  .object({
    consentProtocolScope: nonEmptyString.max(20_000),
    approvedPurposes: stringList,
    permittedCollaborators: stringList,
    externalProcessing: z.enum(["allowed", "review", "blocked"]),
    permittedProviders: stringList,
    residency: stringList,
    retentionExpiresAt: optionalDate,
    deletionDueAt: optionalDate,
    license: nonEmptyString.max(500),
    owner: nonEmptyString.max(500),
    reviewDate: optionalDate,
    provenanceSource: nonEmptyString.max(4_000),
    notes: z.string().trim().max(20_000).default(""),
    actorId: nonEmptyString.max(200).default("local-user"),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.retentionExpiresAt &&
      value.deletionDueAt &&
      new Date(value.deletionDueAt) < new Date(value.retentionExpiresAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "Deletion cannot be due before retention ends.",
        path: ["deletionDueAt"],
      });
    }
    for (const key of ["retentionExpiresAt", "deletionDueAt", "reviewDate"]) {
      const date = value[key];
      if (date && Number.isNaN(new Date(date).getTime())) {
        context.addIssue({
          code: "custom",
          message: "Date is invalid.",
          path: [key],
        });
      }
    }
  });

export const obligationOperationSchema = z
  .object({
    kind: z.enum(["export", "provider-transmission", "integration"]),
    integration: z.string().trim().min(1).max(200).optional(),
    objectIds: z
      .array(z.string().trim().min(1).max(500))
      .max(2_000)
      .default([]),
    purpose: z.string().trim().min(1).max(1_000).nullable().default(null),
    collaborators: stringList.default([]),
    provider: z.string().trim().min(1).max(200).nullable().default(null),
    residency: z.string().trim().min(1).max(200).nullable().default(null),
    license: z.string().trim().min(1).max(500).nullable().default(null),
    external: z.boolean().default(true),
  })
  .strict();

const parseJsonArray = (value) => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const mapObligation = (row) => ({
  id: row.id,
  projectId: row.project_id,
  datasetObjectId: row.dataset_object_id,
  datasetTitle: row.dataset_title,
  consentProtocolScope: row.consent_protocol_scope,
  approvedPurposes: parseJsonArray(row.approved_purposes_json),
  permittedCollaborators: parseJsonArray(row.permitted_collaborators_json),
  externalProcessing: row.external_processing,
  permittedProviders: parseJsonArray(row.permitted_providers_json),
  residency: parseJsonArray(row.residency_json),
  retentionExpiresAt: row.retention_expires_at ?? null,
  deletionDueAt: row.deletion_due_at ?? null,
  license: row.license,
  owner: row.owner,
  reviewDate: row.review_date ?? null,
  provenanceSource: row.provenance_source,
  notes: row.notes,
  revision: row.revision,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapAlert = (row) => ({
  id: row.id,
  projectId: row.project_id,
  sourceObligationId: row.source_obligation_id ?? null,
  sourceDatasetTitle: row.dataset_title ?? null,
  category: row.category,
  severity: row.severity,
  affectedObjectIds: parseJsonArray(row.affected_object_ids_json),
  rationale: row.rationale,
  resolution: row.resolution,
  operation: row.operation_json ? JSON.parse(row.operation_json) : null,
  state: row.state,
  acknowledgedBy: row.acknowledged_by ?? null,
  acknowledgedAt: row.acknowledged_at ?? null,
  resolutionNote: row.resolution_note ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

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

const digest = (value) =>
  createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
const normalized = (value) => value.trim().toLocaleLowerCase();
const includesNormalized = (values, value) =>
  values.some((candidate) => normalized(candidate) === normalized(value));

function buildPropagation(database, projectId, obligations) {
  const objects = database
    .prepare(
      "SELECT id, type, title FROM research_objects WHERE project_id = ? ORDER BY id",
    )
    .all(projectId);
  const objectIds = new Set(objects.map((object) => object.id));
  const adjacency = new Map(objects.map((object) => [object.id, new Set()]));
  const relationships = database
    .prepare(
      "SELECT from_object_id, to_object_id, type FROM research_relationships WHERE project_id = ? ORDER BY id",
    )
    .all(projectId);
  for (const relationship of relationships) {
    if (
      !objectIds.has(relationship.from_object_id) ||
      !objectIds.has(relationship.to_object_id)
    ) {
      continue;
    }
    adjacency.get(relationship.from_object_id).add(relationship.to_object_id);
    if (relationship.type === "generated-by") {
      adjacency.get(relationship.to_object_id).add(relationship.from_object_id);
    }
  }
  const inheritedByObject = new Map();
  const affectedByObligation = new Map();
  for (const obligation of obligations) {
    const visited = new Set();
    const queue = [obligation.datasetObjectId];
    while (queue.length > 0) {
      const objectId = queue.shift();
      if (!objectId || visited.has(objectId) || !objectIds.has(objectId))
        continue;
      visited.add(objectId);
      const inherited = inheritedByObject.get(objectId) ?? [];
      if (!inherited.some((item) => item.id === obligation.id))
        inherited.push(obligation);
      inheritedByObject.set(objectId, inherited);
      for (const next of adjacency.get(objectId) ?? []) {
        if (!visited.has(next)) queue.push(next);
      }
    }
    affectedByObligation.set(obligation.id, [...visited].sort());
  }
  return { objects, inheritedByObject, affectedByObligation };
}

export function createObligationService(
  database,
  {
    clock = () => new Date().toISOString(),
    createId = randomUUID,
    appendProvenance = (event) =>
      createResearchRepository(database).appendProvenance(event),
  } = {},
) {
  const ensureProject = (projectId) => {
    const project = database
      .prepare("SELECT id FROM projects WHERE id = ?")
      .get(projectId);
    if (!project) throw new Error("Research project does not exist.");
  };

  const listObligations = (projectId) => {
    ensureProject(projectId);
    return database
      .prepare(
        `SELECT obligation.*, object.title AS dataset_title
         FROM dataset_obligations obligation
         JOIN research_objects object
           ON object.id = obligation.dataset_object_id
          AND object.project_id = obligation.project_id
         WHERE obligation.project_id = ?
         ORDER BY object.title, obligation.id`,
      )
      .all(projectId)
      .map(mapObligation);
  };

  const saveAlert = (alert) => {
    const now = clock();
    database
      .prepare(
        `INSERT INTO obligation_alerts
          (id, project_id, source_obligation_id, category, severity,
           affected_object_ids_json, rationale, resolution, operation_json,
           state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           severity = excluded.severity,
           affected_object_ids_json = excluded.affected_object_ids_json,
           rationale = excluded.rationale,
           resolution = excluded.resolution,
           operation_json = excluded.operation_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        alert.id,
        alert.projectId,
        alert.sourceObligationId ?? null,
        alert.category,
        alert.severity,
        JSON.stringify(alert.affectedObjectIds),
        alert.rationale,
        alert.resolution,
        alert.operation ? JSON.stringify(alert.operation) : null,
        now,
        now,
      );
  };

  const createFinding = ({
    projectId,
    obligation,
    category,
    severity,
    affectedObjectIds,
    rationale,
    resolution,
    operation = null,
    discriminator = "standing",
  }) => ({
    id: `obl-alert-${digest({ projectId, obligationId: obligation?.id, category, discriminator }).slice(0, 24)}`,
    projectId,
    sourceObligationId: obligation?.id ?? null,
    sourceDatasetTitle: obligation?.datasetTitle ?? null,
    category,
    severity,
    affectedObjectIds,
    rationale,
    resolution,
    operation,
    state: "open",
  });

  const temporalFindings = (projectId, obligations, propagation, now) => {
    const findings = [];
    const today = new Date(now).getTime();
    const horizon = today + 30 * 24 * 60 * 60 * 1_000;
    for (const obligation of obligations) {
      const affectedObjectIds =
        propagation.affectedByObligation.get(obligation.id) ?? [];
      const dateRule = (value, category, noun, criticalWhenPast) => {
        if (!value) return;
        const due = new Date(value).getTime();
        if (due > horizon) return;
        const past = due <= today;
        findings.push(
          createFinding({
            projectId,
            obligation,
            category,
            severity: past && criticalWhenPast ? "critical" : "warning",
            affectedObjectIds,
            rationale: past
              ? `${noun} passed on ${value}.`
              : `${noun} is due within 30 days (${value}).`,
            resolution:
              past && criticalWhenPast
                ? "Stop use and export until the owner records disposition or updates the obligation."
                : "Ask the obligation owner to review and record the next action.",
            discriminator: value,
          }),
        );
      };
      dateRule(
        obligation.reviewDate,
        "review-expiry",
        "Obligation review",
        false,
      );
      dateRule(
        obligation.retentionExpiresAt,
        "retention",
        "Retention period",
        true,
      );
      dateRule(obligation.deletionDueAt, "deletion", "Deletion deadline", true);
    }
    return findings;
  };

  const listAlerts = (projectId, { includeResolved = false } = {}) => {
    const obligations = listObligations(projectId);
    const propagation = buildPropagation(database, projectId, obligations);
    for (const finding of temporalFindings(
      projectId,
      obligations,
      propagation,
      clock(),
    )) {
      saveAlert(finding);
    }
    return database
      .prepare(
        `SELECT alert.*, object.title AS dataset_title
         FROM obligation_alerts alert
         LEFT JOIN dataset_obligations obligation ON obligation.id = alert.source_obligation_id
         LEFT JOIN research_objects object
           ON object.id = obligation.dataset_object_id
          AND object.project_id = obligation.project_id
         WHERE alert.project_id = ? ${includeResolved ? "" : "AND alert.state <> 'resolved'"}
         ORDER BY CASE alert.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                  alert.updated_at DESC, alert.id`,
      )
      .all(projectId)
      .map(mapAlert);
  };

  const evaluateOperation = (
    projectId,
    rawOperation,
    { ignoreApprovals = false } = {},
  ) => {
    const operation = obligationOperationSchema.parse(rawOperation);
    const obligations = listObligations(projectId);
    if (obligations.length === 0) {
      return {
        projectId,
        decision: "allow",
        complete: true,
        evaluationHash: digest({ projectId, operation, obligations: [] }),
        operation,
        alerts: [],
        approval: null,
        inheritedRestrictions: {},
        evaluatedAt: clock(),
      };
    }
    const propagation = buildPropagation(database, projectId, obligations);
    const selectedObjectIds = operation.objectIds.length
      ? [...new Set(operation.objectIds)]
      : propagation.objects.map((object) => object.id);
    const missing = selectedObjectIds.filter(
      (objectId) =>
        !propagation.objects.some((object) => object.id === objectId),
    );
    if (missing.length)
      throw new Error("Operation references objects outside this project.");
    const applicable = obligations.filter((obligation) =>
      selectedObjectIds.some((objectId) =>
        propagation.inheritedByObject
          .get(objectId)
          ?.some((item) => item.id === obligation.id),
      ),
    );
    const operationKey = digest(operation);
    const alerts = temporalFindings(
      projectId,
      applicable,
      propagation,
      clock(),
    );
    const add = (obligation, category, severity, rationale, resolution) => {
      const affectedObjectIds = selectedObjectIds.filter((objectId) =>
        propagation.inheritedByObject
          .get(objectId)
          ?.some((item) => item.id === obligation.id),
      );
      alerts.push(
        createFinding({
          projectId,
          obligation,
          category,
          severity,
          affectedObjectIds,
          rationale,
          resolution,
          operation,
          discriminator: operationKey,
        }),
      );
    };
    for (const obligation of applicable) {
      if (operation.external && obligation.externalProcessing === "blocked") {
        add(
          obligation,
          "external-processing",
          "critical",
          `${obligation.datasetTitle} prohibits external processing for this operation.`,
          "Use an approved local workflow or change the recorded obligation with supporting authority.",
        );
      } else if (
        operation.external &&
        obligation.externalProcessing === "review"
      ) {
        add(
          obligation,
          "external-processing",
          "warning",
          `${obligation.datasetTitle} requires human review before external processing.`,
          "A human must review the affected objects and record approval for this exact operation.",
        );
      }
      if (
        operation.external &&
        operation.kind === "provider-transmission" &&
        obligation.permittedProviders.length > 0 &&
        (!operation.provider ||
          !includesNormalized(
            obligation.permittedProviders,
            operation.provider,
          ))
      ) {
        add(
          obligation,
          "provider",
          "critical",
          operation.provider
            ? `${operation.provider} is not an approved provider for ${obligation.datasetTitle}.`
            : `No provider was identified for data derived from ${obligation.datasetTitle}.`,
          "Select a permitted provider or keep processing local.",
        );
      }
      if (obligation.approvedPurposes.length > 0) {
        if (!operation.purpose) {
          add(
            obligation,
            "purpose",
            "warning",
            `The operation does not state a purpose for ${obligation.datasetTitle}.`,
            "State an approved purpose and record human review.",
          );
        } else if (
          !includesNormalized(obligation.approvedPurposes, operation.purpose)
        ) {
          add(
            obligation,
            "purpose",
            "critical",
            `“${operation.purpose}” is not an approved purpose for ${obligation.datasetTitle}.`,
            "Use an approved purpose or update the obligation from authoritative documentation.",
          );
        }
      }
      const unpermittedCollaborators = operation.collaborators.filter(
        (collaborator) =>
          !includesNormalized(obligation.permittedCollaborators, collaborator),
      );
      if (unpermittedCollaborators.length > 0) {
        add(
          obligation,
          "collaborator",
          "critical",
          `${unpermittedCollaborators.join(", ")} are not permitted collaborators for ${obligation.datasetTitle}.`,
          "Remove unpermitted collaborators or update the obligation from authoritative documentation.",
        );
      } else if (
        operation.external &&
        operation.kind === "export" &&
        obligation.permittedCollaborators.length > 0 &&
        operation.collaborators.length === 0
      ) {
        add(
          obligation,
          "collaborator",
          "warning",
          `The export recipient was not identified for ${obligation.datasetTitle}.`,
          "Identify the recipient and record human review before export.",
        );
      }
      if (
        operation.external &&
        obligation.residency.length > 0 &&
        (!operation.residency ||
          !includesNormalized(obligation.residency, operation.residency))
      ) {
        add(
          obligation,
          "residency",
          operation.residency ? "critical" : "warning",
          operation.residency
            ? `${operation.residency} is outside the recorded residency locations for ${obligation.datasetTitle}.`
            : `Processing residency is unknown for ${obligation.datasetTitle}.`,
          "Choose a recorded residency location and verify the provider configuration.",
        );
      }
      if (
        operation.license &&
        normalized(operation.license) !== normalized(obligation.license)
      ) {
        add(
          obligation,
          "license",
          "critical",
          `The requested ${operation.license} license conflicts with ${obligation.license} for ${obligation.datasetTitle}.`,
          "Use compatible terms or exclude affected objects.",
        );
      } else if (operation.kind === "export" && !operation.license) {
        add(
          obligation,
          "license",
          "warning",
          `The export does not declare how the ${obligation.license} terms for ${obligation.datasetTitle} will be preserved.`,
          "Review the license terms and record approval for the exact export.",
        );
      }
    }
    const deduplicatedAlerts = [
      ...new Map(alerts.map((alert) => [alert.id, alert])).values(),
    ];
    for (const alert of deduplicatedAlerts) saveAlert(alert);
    const inheritedRestrictions = Object.fromEntries(
      selectedObjectIds
        .map((objectId) => [
          objectId,
          (propagation.inheritedByObject.get(objectId) ?? []).map(
            (obligation) => ({
              obligationId: obligation.id,
              datasetObjectId: obligation.datasetObjectId,
              datasetTitle: obligation.datasetTitle,
              consentProtocolScope: obligation.consentProtocolScope,
              approvedPurposes: obligation.approvedPurposes,
              externalProcessing: obligation.externalProcessing,
              residency: obligation.residency,
              retentionExpiresAt: obligation.retentionExpiresAt,
              deletionDueAt: obligation.deletionDueAt,
              license: obligation.license,
              owner: obligation.owner,
              reviewDate: obligation.reviewDate,
            }),
          ),
        ])
        .filter(([, values]) => values.length > 0),
    );
    const evaluationHash = digest({
      projectId,
      operation,
      alerts: deduplicatedAlerts.map((alert) => alert.id).sort(),
      obligations: applicable.map((item) => [
        item.id,
        item.revision,
        item.updatedAt,
      ]),
    });
    const blockers = deduplicatedAlerts.filter(
      (alert) => alert.severity === "critical",
    );
    const warnings = deduplicatedAlerts.filter(
      (alert) => alert.severity === "warning",
    );
    const approval =
      blockers.length === 0 && warnings.length > 0 && !ignoreApprovals
        ? database
            .prepare(
              `SELECT * FROM obligation_operation_approvals
               WHERE project_id = ? AND evaluation_hash = ? AND state = 'approved'
               ORDER BY created_at DESC, id DESC LIMIT 1`,
            )
            .get(projectId, evaluationHash)
        : null;
    return {
      projectId,
      decision:
        blockers.length > 0
          ? "block"
          : warnings.length > 0 && !approval
            ? "review"
            : "allow",
      complete: true,
      evaluationHash,
      operation,
      alerts: deduplicatedAlerts,
      approval: approval
        ? {
            id: approval.id,
            actorId: approval.actor_id,
            rationale: approval.rationale,
            createdAt: approval.created_at,
          }
        : null,
      inheritedRestrictions,
      evaluatedAt: clock(),
    };
  };

  return {
    listObligations,
    saveObligation(projectId, datasetObjectId, rawInput) {
      ensureProject(projectId);
      const input = datasetObligationInputSchema.parse(rawInput);
      const dataset = database
        .prepare(
          "SELECT id, type FROM research_objects WHERE id = ? AND project_id = ? AND type = 'source'",
        )
        .get(datasetObjectId, projectId);
      if (!dataset)
        throw new Error("Dataset source does not belong to the project.");
      const existing = database
        .prepare(
          "SELECT * FROM dataset_obligations WHERE project_id = ? AND dataset_object_id = ?",
        )
        .get(projectId, datasetObjectId);
      const id = existing?.id ?? createId();
      const now = clock();
      database.exec("BEGIN IMMEDIATE");
      try {
        database
          .prepare(
            `INSERT INTO dataset_obligations
              (id, project_id, dataset_object_id, consent_protocol_scope,
               approved_purposes_json, permitted_collaborators_json,
               external_processing, permitted_providers_json, residency_json,
               retention_expires_at, deletion_due_at, license, owner, review_date,
               provenance_source, notes, revision, created_by, updated_by,
               created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
             ON CONFLICT(project_id, dataset_object_id) DO UPDATE SET
               consent_protocol_scope = excluded.consent_protocol_scope,
               approved_purposes_json = excluded.approved_purposes_json,
               permitted_collaborators_json = excluded.permitted_collaborators_json,
               external_processing = excluded.external_processing,
               permitted_providers_json = excluded.permitted_providers_json,
               residency_json = excluded.residency_json,
               retention_expires_at = excluded.retention_expires_at,
               deletion_due_at = excluded.deletion_due_at,
               license = excluded.license,
               owner = excluded.owner,
               review_date = excluded.review_date,
               provenance_source = excluded.provenance_source,
               notes = excluded.notes,
               revision = dataset_obligations.revision + 1,
               updated_by = excluded.updated_by,
               updated_at = excluded.updated_at`,
          )
          .run(
            id,
            projectId,
            datasetObjectId,
            input.consentProtocolScope,
            JSON.stringify(input.approvedPurposes),
            JSON.stringify(input.permittedCollaborators),
            input.externalProcessing,
            JSON.stringify(input.permittedProviders),
            JSON.stringify(input.residency),
            input.retentionExpiresAt,
            input.deletionDueAt,
            input.license,
            input.owner,
            input.reviewDate,
            input.provenanceSource,
            input.notes,
            input.actorId,
            input.actorId,
            now,
            now,
          );
        appendProvenance({
          action: existing
            ? "dataset-obligation.updated"
            : "dataset-obligation.created",
          actorType: "human",
          actorId: input.actorId,
          objectId: datasetObjectId,
          projectId,
          metadata: {
            obligationId: id,
            revision: (existing?.revision ?? 0) + 1,
          },
        });
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      return listObligations(projectId).find((item) => item.id === id);
    },
    getSummary(projectId) {
      const obligations = listObligations(projectId);
      const propagation = buildPropagation(database, projectId, obligations);
      return {
        obligations,
        alerts: listAlerts(projectId),
        inheritedRestrictions: Object.fromEntries(
          [...propagation.inheritedByObject.entries()].map(
            ([objectId, values]) => [
              objectId,
              values.map((obligation) => ({
                obligationId: obligation.id,
                datasetObjectId: obligation.datasetObjectId,
                datasetTitle: obligation.datasetTitle,
                consentProtocolScope: obligation.consentProtocolScope,
                approvedPurposes: obligation.approvedPurposes,
                externalProcessing: obligation.externalProcessing,
                residency: obligation.residency,
                retentionExpiresAt: obligation.retentionExpiresAt,
                deletionDueAt: obligation.deletionDueAt,
                license: obligation.license,
                owner: obligation.owner,
                reviewDate: obligation.reviewDate,
              })),
            ],
          ),
        ),
      };
    },
    listAlerts,
    transitionAlert(projectId, alertId, { state, actorId, note }) {
      ensureProject(projectId);
      const alert = database
        .prepare(
          "SELECT * FROM obligation_alerts WHERE id = ? AND project_id = ?",
        )
        .get(alertId, projectId);
      if (!alert)
        throw new Error("Obligation alert does not belong to the project.");
      if (state === "acknowledged" && alert.severity === "critical") {
        throw new Error(
          "Critical conflicts must be resolved, not acknowledged.",
        );
      }
      const now = clock();
      database
        .prepare(
          `UPDATE obligation_alerts SET state = ?, acknowledged_by = ?,
           acknowledged_at = ?, resolution_note = ?, updated_at = ?
           WHERE id = ? AND project_id = ?`,
        )
        .run(state, actorId, now, note, now, alertId, projectId);
      appendProvenance({
        action: `obligation-alert.${state}`,
        actorType: "human",
        actorId,
        projectId,
        metadata: { alertId, note },
      });
      return listAlerts(projectId, { includeResolved: true }).find(
        (item) => item.id === alertId,
      );
    },
    evaluateOperation,
    safeEvaluateOperation(projectId, operation) {
      try {
        return evaluateOperation(projectId, operation);
      } catch (error) {
        const rationale =
          error instanceof Error
            ? error.message
            : "Obligation evaluation failed.";
        return {
          projectId,
          decision: "block",
          complete: false,
          evaluationHash: digest({ projectId, operation, rationale }),
          operation,
          alerts: [
            {
              id: `obl-alert-evaluation-${digest({ projectId, operation, rationale }).slice(0, 20)}`,
              projectId,
              sourceObligationId: null,
              sourceDatasetTitle: null,
              category: "evaluation",
              severity: "critical",
              affectedObjectIds: operation?.objectIds ?? [],
              rationale: `Cly could not complete obligation evaluation: ${rationale}`,
              resolution:
                "Retry after restoring local obligation data. Do not export or transmit in the meantime.",
              operation,
              state: "open",
            },
          ],
          approval: null,
          inheritedRestrictions: {},
          evaluatedAt: clock(),
        };
      }
    },
    approveOperation(projectId, rawOperation, { actorId, rationale }) {
      const operation = obligationOperationSchema.parse(rawOperation);
      const evaluation = evaluateOperation(projectId, operation, {
        ignoreApprovals: true,
      });
      if (evaluation.decision === "block") {
        throw new Error("Hard obligation conflicts cannot be approved.");
      }
      const warningIds = evaluation.alerts
        .filter((alert) => alert.severity === "warning")
        .map((alert) => alert.id);
      if (warningIds.length === 0)
        throw new Error("This operation does not require approval.");
      const id = createId();
      const now = clock();
      database
        .prepare(
          `INSERT INTO obligation_operation_approvals
           (id, project_id, evaluation_hash, operation_json, warning_alert_ids_json,
            actor_id, rationale, state, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?)`,
        )
        .run(
          id,
          projectId,
          evaluation.evaluationHash,
          JSON.stringify(operation),
          JSON.stringify(warningIds),
          nonEmptyString.max(200).parse(actorId),
          nonEmptyString.parse(rationale),
          now,
        );
      appendProvenance({
        action: "obligation-operation.approved",
        actorType: "human",
        actorId,
        projectId,
        metadata: {
          approvalId: id,
          evaluationHash: evaluation.evaluationHash,
          kind: operation.kind,
          integration: operation.integration,
          warningAlertIds: warningIds,
          rationale,
        },
      });
      return {
        approval: { id, actorId, rationale, createdAt: now },
        evaluation: evaluateOperation(projectId, operation),
      };
    },
  };
}
