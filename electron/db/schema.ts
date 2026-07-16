import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const schemaMigrations = sqliteTable("schema_migrations", {
  version: integer("version").primaryKey(),
  appliedAt: text("applied_at").notNull(),
});

export const config = sqliteTable(
  "config",
  {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [check("config_value_json", sql`json_valid(${table.value})`)],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    path: text("path").notNull(),
    normalizedPath: text("normalized_path").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("open"),
    sortOrder: integer("sort_order").notNull().default(0),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("projects_metadata_json", sql`json_valid(${table.metadata})`),
    index("idx_projects_status_order").on(table.status, table.sortOrder),
    uniqueIndex("projects_normalized_path_unique").on(table.normalizedPath),
  ],
);

export const chats = sqliteTable(
  "chats",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    check("chats_metadata_json", sql`json_valid(${table.metadata})`),
    index("idx_chats_project_updated").on(
      table.projectId,
      table.deletedAt,
      table.updatedAt,
    ),
  ],
);

export const agentConfigurations = sqliteTable(
  "agent_configurations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    maxParallel: integer("max_parallel").notNull(),
    maxInputTokens: integer("max_input_tokens").notNull(),
    maxOutputTokens: integer("max_output_tokens").notNull(),
    maxCostMinorUnits: integer("max_cost_minor_units").notNull(),
    maxRuntimeMs: integer("max_runtime_ms").notNull(),
    partialFailurePolicy: text("partial_failure_policy").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("agent_configurations_project_name_unique").on(
      table.projectId,
      table.name,
    ),
    uniqueIndex("agent_configurations_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    index("idx_agent_configurations_project_updated").on(
      table.projectId,
      table.updatedAt,
      table.id,
    ),
    check(
      "agent_configurations_parallel_positive",
      sql`${table.maxParallel} >= 1`,
    ),
    check(
      "agent_configurations_failure_policy",
      sql`${table.partialFailurePolicy} IN ('continue', 'cancel_remaining')`,
    ),
    check(
      "agent_configurations_revision_positive",
      sql`${table.revision} >= 1`,
    ),
  ],
);

export const agentRoleConfigurations = sqliteTable(
  "agent_role_configurations",
  {
    configurationId: text("configuration_id").notNull(),
    projectId: text("project_id").notNull(),
    id: text("id").notNull(),
    position: integer("position").notNull(),
    role: text("role").notNull(),
    instanceCount: integer("instance_count").notNull(),
    maxParallel: integer("max_parallel").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    reasoningLevel: text("reasoning_level").notNull(),
    maxInputTokens: integer("max_input_tokens").notNull(),
    maxOutputTokens: integer("max_output_tokens").notNull(),
    maxCostMinorUnits: integer("max_cost_minor_units").notNull(),
    maxRuntimeMs: integer("max_runtime_ms").notNull(),
    allowedToolsJson: text("allowed_tools_json").notNull(),
    allowedContextSourcesJson: text("allowed_context_sources_json").notNull(),
    allowedFileGlobsJson: text("allowed_file_globs_json").notNull(),
    permissionsJson: text("permissions_json").notNull(),
    approvalCheckpointsJson: text("approval_checkpoints_json").notNull(),
    fallbackModel: text("fallback_model"),
  },
  (table) => [
    foreignKey({
      columns: [table.configurationId, table.projectId],
      foreignColumns: [agentConfigurations.id, agentConfigurations.projectId],
      name: "agent_roles_configuration_project_fk",
    }).onDelete("cascade"),
    uniqueIndex("agent_roles_configuration_id_unique").on(
      table.configurationId,
      table.id,
    ),
    uniqueIndex("agent_roles_position_unique").on(
      table.configurationId,
      table.position,
    ),
    index("idx_agent_roles_configuration").on(
      table.projectId,
      table.configurationId,
      table.position,
    ),
    check(
      "agent_roles_parallel_valid",
      sql`${table.maxParallel} >= 1 AND ${table.maxParallel} <= ${table.instanceCount}`,
    ),
    check("agent_roles_tools_json", sql`json_valid(${table.allowedToolsJson})`),
    check(
      "agent_roles_context_json",
      sql`json_valid(${table.allowedContextSourcesJson})`,
    ),
    check(
      "agent_roles_globs_json",
      sql`json_valid(${table.allowedFileGlobsJson})`,
    ),
    check(
      "agent_roles_permissions_json",
      sql`json_valid(${table.permissionsJson})`,
    ),
    check(
      "agent_roles_checkpoints_json",
      sql`json_valid(${table.approvalCheckpointsJson})`,
    ),
  ],
);

export const lineageSuggestions = sqliteTable(
  "lineage_suggestions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    logicalKey: text("logical_key").notNull(),
    revision: integer("revision").notNull().default(1),
    lifecycleState: text("lifecycle_state").notNull().default("current"),
    supersedesSuggestionId: text("supersedes_suggestion_id"),
    chainJson: text("chain_json").notNull(),
    confidence: real("confidence").notNull(),
    rationale: text("rationale").notNull(),
    origin: text("origin").notNull().default("inferred"),
    reviewState: text("review_state").notNull().default("unreviewed"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "lineage_suggestions_chain_json",
      sql`json_valid(${table.chainJson})`,
    ),
    uniqueIndex("lineage_suggestions_current_logical_unique")
      .on(table.projectId, table.logicalKey)
      .where(sql`${table.lifecycleState} = 'current'`),
    uniqueIndex("lineage_suggestions_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    foreignKey({
      columns: [table.supersedesSuggestionId, table.projectId],
      foreignColumns: [table.id, table.projectId],
      name: "lineage_suggestions_supersedes_project_fk",
    }),
    index("idx_lineage_suggestions_project_review").on(
      table.projectId,
      table.reviewState,
      table.updatedAt,
    ),
  ],
);

export const lineageEvidence = sqliteTable(
  "lineage_evidence",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    suggestionId: text("suggestion_id").notNull(),
    evidenceType: text("evidence_type").notNull(),
    path: text("path"),
    coordinates: text("coordinates").notNull(),
    excerpt: text("excerpt"),
    contentHash: text("content_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "lineage_evidence_coordinates_json",
      sql`json_valid(${table.coordinates})`,
    ),
    uniqueIndex("lineage_evidence_suggestion_hash_unique").on(
      table.suggestionId,
      table.contentHash,
    ),
    index("idx_lineage_evidence_project_suggestion").on(
      table.projectId,
      table.suggestionId,
    ),
    foreignKey({
      columns: [table.suggestionId, table.projectId],
      foreignColumns: [lineageSuggestions.id, lineageSuggestions.projectId],
      name: "lineage_evidence_suggestion_project_fk",
    }).onDelete("cascade"),
  ],
);

export const lineageScanMeasurements = sqliteTable(
  "lineage_scan_measurements",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    scanDurationMs: integer("scan_duration_ms").notNull(),
    timeToFirstChainMs: integer("time_to_first_chain_ms"),
    suggestionCount: integer("suggestion_count").notNull(),
    acceptedCount: integer("accepted_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    correctionCount: integer("correction_count").notNull().default(0),
    manualConfigJson: text("manual_config_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "lineage_scan_measurements_manual_config_json",
      sql`json_valid(${table.manualConfigJson})`,
    ),
    index("idx_lineage_scan_measurements_project_created").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    sortOrder: integer("sort_order").notNull(),
    payload: text("payload").notNull(),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check("chat_messages_payload_json", sql`json_valid(${table.payload})`),
    check("chat_messages_metadata_json", sql`json_valid(${table.metadata})`),
    index("idx_chat_messages_chat_order").on(table.chatId, table.sortOrder),
  ],
);

export const researchObjects = sqliteTable(
  "research_objects",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    payload: text("payload").notNull().default("{}"),
    origin: text("origin").notNull().default("human"),
    reviewState: text("review_state").notNull().default("unreviewed"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("research_objects_payload_json", sql`json_valid(${table.payload})`),
    index("idx_research_objects_project_type").on(table.projectId, table.type),
  ],
);

export const literatureReadingLists = sqliteTable(
  "literature_reading_lists",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    description: text("description").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("literature_reading_lists_project_name_unique").on(
      table.projectId,
      table.normalizedName,
    ),
    index("idx_literature_reading_lists_project").on(
      table.projectId,
      table.updatedAt,
    ),
  ],
);

export const literatureReadingListSources = sqliteTable(
  "literature_reading_list_sources",
  {
    readingListId: text("reading_list_id")
      .notNull()
      .references(() => literatureReadingLists.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => researchObjects.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    addedAt: text("added_at").notNull(),
  },
  (table) => [
    uniqueIndex("literature_reading_list_sources_list_source_unique").on(
      table.readingListId,
      table.sourceId,
    ),
    index("idx_literature_reading_list_sources_project_source").on(
      table.projectId,
      table.sourceId,
    ),
  ],
);

export const researchRelationships = sqliteTable(
  "research_relationships",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fromObjectId: text("from_object_id")
      .notNull()
      .references(() => researchObjects.id, { onDelete: "cascade" }),
    toObjectId: text("to_object_id")
      .notNull()
      .references(() => researchObjects.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    origin: text("origin").notNull().default("human"),
    reviewState: text("review_state").notNull().default("unreviewed"),
    confidence: real("confidence"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_research_relationships_project_from").on(
      table.projectId,
      table.fromObjectId,
    ),
    index("idx_research_relationships_project_to").on(
      table.projectId,
      table.toObjectId,
    ),
    uniqueIndex("research_relationship_unique").on(
      table.projectId,
      table.fromObjectId,
      table.toObjectId,
      table.type,
    ),
  ],
);

export const datasetObligations = sqliteTable(
  "dataset_obligations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    datasetObjectId: text("dataset_object_id")
      .notNull()
      .references(() => researchObjects.id, { onDelete: "cascade" }),
    consentProtocolScope: text("consent_protocol_scope").notNull(),
    approvedPurposesJson: text("approved_purposes_json")
      .notNull()
      .default("[]"),
    permittedCollaboratorsJson: text("permitted_collaborators_json")
      .notNull()
      .default("[]"),
    externalProcessing: text("external_processing").notNull().default("review"),
    permittedProvidersJson: text("permitted_providers_json")
      .notNull()
      .default("[]"),
    residencyJson: text("residency_json").notNull().default("[]"),
    retentionExpiresAt: text("retention_expires_at"),
    deletionDueAt: text("deletion_due_at"),
    license: text("license").notNull(),
    owner: text("owner").notNull(),
    reviewDate: text("review_date"),
    provenanceSource: text("provenance_source").notNull(),
    notes: text("notes").notNull().default(""),
    revision: integer("revision").notNull().default(1),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "dataset_obligations_approved_purposes_json",
      sql`json_valid(${table.approvedPurposesJson}) AND json_type(${table.approvedPurposesJson}) = 'array'`,
    ),
    check(
      "dataset_obligations_permitted_collaborators_json",
      sql`json_valid(${table.permittedCollaboratorsJson}) AND json_type(${table.permittedCollaboratorsJson}) = 'array'`,
    ),
    check(
      "dataset_obligations_permitted_providers_json",
      sql`json_valid(${table.permittedProvidersJson}) AND json_type(${table.permittedProvidersJson}) = 'array'`,
    ),
    check(
      "dataset_obligations_residency_json",
      sql`json_valid(${table.residencyJson}) AND json_type(${table.residencyJson}) = 'array'`,
    ),
    check(
      "dataset_obligations_external_processing",
      sql`${table.externalProcessing} IN ('allowed', 'review', 'blocked')`,
    ),
    check("dataset_obligations_revision", sql`${table.revision} >= 1`),
    uniqueIndex("dataset_obligations_project_dataset_unique").on(
      table.projectId,
      table.datasetObjectId,
    ),
    index("idx_dataset_obligations_project_review").on(
      table.projectId,
      table.reviewDate,
      table.deletionDueAt,
    ),
  ],
);

export const obligationAlerts = sqliteTable(
  "obligation_alerts",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceObligationId: text("source_obligation_id").references(
      () => datasetObligations.id,
      { onDelete: "cascade" },
    ),
    category: text("category").notNull(),
    severity: text("severity").notNull(),
    affectedObjectIdsJson: text("affected_object_ids_json").notNull(),
    rationale: text("rationale").notNull(),
    resolution: text("resolution").notNull(),
    operationJson: text("operation_json"),
    state: text("state").notNull().default("open"),
    acknowledgedBy: text("acknowledged_by"),
    acknowledgedAt: text("acknowledged_at"),
    resolutionNote: text("resolution_note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "obligation_alerts_affected_json",
      sql`json_valid(${table.affectedObjectIdsJson}) AND json_type(${table.affectedObjectIdsJson}) = 'array'`,
    ),
    check(
      "obligation_alerts_operation_json",
      sql`${table.operationJson} IS NULL OR json_valid(${table.operationJson})`,
    ),
    check(
      "obligation_alerts_severity",
      sql`${table.severity} IN ('info', 'warning', 'critical')`,
    ),
    check(
      "obligation_alerts_state",
      sql`${table.state} IN ('open', 'acknowledged', 'resolved')`,
    ),
    index("idx_obligation_alerts_project_state").on(
      table.projectId,
      table.state,
      table.severity,
      table.updatedAt,
    ),
  ],
);

export const obligationOperationApprovals = sqliteTable(
  "obligation_operation_approvals",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    evaluationHash: text("evaluation_hash").notNull(),
    operationJson: text("operation_json").notNull(),
    warningAlertIdsJson: text("warning_alert_ids_json").notNull(),
    actorId: text("actor_id").notNull(),
    rationale: text("rationale").notNull(),
    state: text("state").notNull().default("approved"),
    createdAt: text("created_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    check(
      "obligation_operation_approvals_operation_json",
      sql`json_valid(${table.operationJson})`,
    ),
    check(
      "obligation_operation_approvals_warning_json",
      sql`json_valid(${table.warningAlertIdsJson}) AND json_type(${table.warningAlertIdsJson}) = 'array'`,
    ),
    check(
      "obligation_operation_approvals_state",
      sql`${table.state} IN ('approved', 'revoked')`,
    ),
    index("idx_obligation_operation_approvals_lookup").on(
      table.projectId,
      table.evaluationHash,
      table.state,
      table.createdAt,
    ),
  ],
);

export const provenanceEvents = sqliteTable(
  "provenance_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    objectId: text("object_id").references(() => researchObjects.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    sequence: integer("sequence"),
    previousHash: text("previous_hash"),
    eventHash: text("event_hash"),
  },
  (table) => [
    check(
      "provenance_events_metadata_json",
      sql`json_valid(${table.metadata})`,
    ),
    index("idx_provenance_events_project_created").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const preregistrationSnapshots = sqliteTable(
  "preregistration_snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    experimentId: text("experiment_id")
      .notNull()
      .references(() => researchObjects.id),
    version: integer("version").notNull(),
    amendsSnapshotId: text("amends_snapshot_id"),
    contentJson: text("content_json").notNull(),
    contentHash: text("content_hash").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    origin: text("origin").notNull().default("human"),
    provenanceEventId: text("provenance_event_id")
      .notNull()
      .references(() => provenanceEvents.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.amendsSnapshotId],
      foreignColumns: [table.id],
      name: "preregistration_snapshots_parent_fk",
    }),
    check("preregistration_snapshots_version", sql`${table.version} >= 1`),
    check(
      "preregistration_snapshots_version_parent",
      sql`(${table.version} = 1 AND ${table.amendsSnapshotId} IS NULL) OR (${table.version} > 1 AND ${table.amendsSnapshotId} IS NOT NULL)`,
    ),
    check(
      "preregistration_snapshots_content_json",
      sql`json_valid(${table.contentJson})`,
    ),
    check(
      "preregistration_snapshots_actor_type",
      sql`${table.actorType} IN ('human', 'agent', 'system', 'integration')`,
    ),
    check(
      "preregistration_snapshots_origin",
      sql`${table.origin} IN ('human', 'imported', 'inferred', 'system')`,
    ),
    uniqueIndex(
      "preregistration_snapshots_project_experiment_version_unique",
    ).on(table.projectId, table.experimentId, table.version),
    uniqueIndex("preregistration_snapshots_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    uniqueIndex("preregistration_snapshots_event_unique").on(
      table.provenanceEventId,
    ),
    index("idx_preregistration_snapshots_project_experiment").on(
      table.projectId,
      table.experimentId,
      table.version,
    ),
  ],
);

export const preregistrationEvaluations = sqliteTable(
  "preregistration_evaluations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => preregistrationSnapshots.id),
    actorId: text("actor_id").notNull(),
    provenanceEventId: text("provenance_event_id")
      .notNull()
      .references(() => provenanceEvents.id),
    evaluatedAt: text("evaluated_at").notNull(),
  },
  (table) => [
    uniqueIndex("preregistration_evaluations_snapshot_unique").on(
      table.snapshotId,
    ),
    uniqueIndex("preregistration_evaluations_event_unique").on(
      table.provenanceEventId,
    ),
  ],
);

export const analysisDeviations = sqliteTable(
  "analysis_deviations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => preregistrationSnapshots.id),
    fieldPath: text("field_path").notNull(),
    beforeJson: text("before_json").notNull(),
    afterJson: text("after_json").notNull(),
    rationale: text("rationale").notNull(),
    declarationTiming: text("declaration_timing").notNull(),
    actorId: text("actor_id").notNull(),
    provenanceEventId: text("provenance_event_id")
      .notNull()
      .references(() => provenanceEvents.id),
    declaredAt: text("declared_at").notNull(),
  },
  (table) => [
    check(
      "analysis_deviations_before_json",
      sql`json_valid(${table.beforeJson})`,
    ),
    check(
      "analysis_deviations_after_json",
      sql`json_valid(${table.afterJson})`,
    ),
    check(
      "analysis_deviations_changed",
      sql`${table.beforeJson} <> ${table.afterJson}`,
    ),
    check(
      "analysis_deviations_timing",
      sql`${table.declarationTiming} IN ('pre-evaluation', 'retrospective')`,
    ),
    uniqueIndex("analysis_deviations_event_unique").on(table.provenanceEventId),
    uniqueIndex("analysis_deviations_id_project_unique").on(
      table.id,
      table.projectId,
    ),
    index("idx_analysis_deviations_project_snapshot").on(
      table.projectId,
      table.snapshotId,
      table.declaredAt,
      table.id,
    ),
  ],
);

export const analysisDeviationAcknowledgements = sqliteTable(
  "analysis_deviation_acknowledgements",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    deviationId: text("deviation_id")
      .notNull()
      .references(() => analysisDeviations.id),
    state: text("state").notNull().default("acknowledged"),
    actorId: text("actor_id").notNull(),
    provenanceEventId: text("provenance_event_id")
      .notNull()
      .references(() => provenanceEvents.id),
    acknowledgedAt: text("acknowledged_at").notNull(),
  },
  (table) => [
    check("analysis_deviation_ack_state", sql`${table.state} = 'acknowledged'`),
    uniqueIndex("analysis_deviation_ack_deviation_unique").on(
      table.deviationId,
    ),
    uniqueIndex("analysis_deviation_ack_event_unique").on(
      table.provenanceEventId,
    ),
  ],
);

export const costEntries = sqliteTable(
  "cost_entries",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => researchObjects.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    providerEntryId: text("provider_entry_id"),
    dedupKey: text("dedup_key").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    category: text("category").notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at").notNull(),
    confidenceBps: integer("confidence_bps").notNull(),
    description: text("description").notNull().default(""),
    rawJson: text("raw_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check("cost_entries_source", sql`${table.source} IN ('manual', 'aws-cur')`),
    check(
      "cost_entries_amount_minor_integer",
      sql`typeof(${table.amountMinor}) = 'integer'`,
    ),
    check(
      "cost_entries_currency",
      sql`length(${table.currency}) = 3 AND ${table.currency} = upper(${table.currency})`,
    ),
    check(
      "cost_entries_category",
      sql`${table.category} IN ('gpu', 'cloud', 'storage', 'model-api', 'agent', 'rerun', 'other')`,
    ),
    check(
      "cost_entries_time_range",
      sql`${table.endedAt} >= ${table.startedAt}`,
    ),
    check(
      "cost_entries_confidence",
      sql`${table.confidenceBps} BETWEEN 0 AND 10000`,
    ),
    check("cost_entries_raw_json", sql`json_valid(${table.rawJson})`),
    uniqueIndex("cost_entries_project_dedup_unique").on(
      table.projectId,
      table.dedupKey,
    ),
    index("idx_cost_entries_project_created").on(
      table.projectId,
      table.createdAt,
      table.id,
    ),
    index("idx_cost_entries_project_run").on(
      table.projectId,
      table.runId,
      table.startedAt,
      table.id,
    ),
  ],
);

export const experimentDefinitionVersions = sqliteTable(
  "experiment_definition_versions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    experimentId: text("experiment_id")
      .notNull()
      .references(() => researchObjects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    hypothesis: text("hypothesis").notNull(),
    objective: text("objective").notNull().default(""),
    configurationJson: text("configuration_json").notNull(),
    datasetsJson: text("datasets_json").notNull(),
    declaredMetricsJson: text("declared_metrics_json").notNull(),
    definitionHash: text("definition_hash").notNull(),
    provenanceEventId: text("provenance_event_id")
      .notNull()
      .references(() => provenanceEvents.id),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "experiment_definition_versions_configuration_json",
      sql`json_valid(${table.configurationJson})`,
    ),
    check(
      "experiment_definition_versions_datasets_json",
      sql`json_valid(${table.datasetsJson}) AND json_type(${table.datasetsJson}) = 'array'`,
    ),
    check(
      "experiment_definition_versions_declared_metrics_json",
      sql`json_valid(${table.declaredMetricsJson}) AND json_type(${table.declaredMetricsJson}) = 'array'`,
    ),
    check(
      "experiment_definition_versions_version_positive",
      sql`${table.version} >= 1`,
    ),
    uniqueIndex("experiment_definition_versions_project_id_unique").on(
      table.id,
      table.projectId,
    ),
    uniqueIndex("experiment_definition_versions_experiment_version_unique").on(
      table.projectId,
      table.experimentId,
      table.version,
    ),
    index("idx_experiment_definitions_project_experiment").on(
      table.projectId,
      table.experimentId,
      table.version,
    ),
  ],
);

export const experimentRuns = sqliteTable(
  "experiment_runs",
  {
    id: text("id")
      .primaryKey()
      .references(() => researchObjects.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    experimentId: text("experiment_id")
      .notNull()
      .references(() => researchObjects.id, { onDelete: "cascade" }),
    definitionVersionId: text("definition_version_id")
      .notNull()
      .references(() => experimentDefinitionVersions.id),
    status: text("status").notNull(),
    commitSha: text("commit_sha").notNull(),
    configurationJson: text("configuration_json").notNull(),
    datasetsJson: text("datasets_json").notNull(),
    codeRefsJson: text("code_refs_json").notNull(),
    inputFingerprint: text("input_fingerprint").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    exitCode: integer("exit_code"),
    provenanceEventId: text("provenance_event_id")
      .notNull()
      .references(() => provenanceEvents.id),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "experiment_runs_status",
      sql`${table.status} IN ('planned', 'running', 'completed', 'failed', 'cancelled')`,
    ),
    check(
      "experiment_runs_configuration_json",
      sql`json_valid(${table.configurationJson})`,
    ),
    check(
      "experiment_runs_datasets_json",
      sql`json_valid(${table.datasetsJson}) AND json_type(${table.datasetsJson}) = 'array'`,
    ),
    check(
      "experiment_runs_code_refs_json",
      sql`json_valid(${table.codeRefsJson}) AND json_type(${table.codeRefsJson}) = 'array'`,
    ),
    uniqueIndex("experiment_runs_project_id_unique").on(
      table.id,
      table.projectId,
    ),
    index("idx_experiment_runs_project_experiment").on(
      table.projectId,
      table.experimentId,
      table.startedAt,
    ),
  ],
);

export const runMetrics = sqliteTable(
  "run_metrics",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => experimentRuns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    value: real("value").notNull(),
    unit: text("unit"),
    step: integer("step"),
    loggedAt: text("logged_at").notNull(),
    provenanceEventId: text("provenance_event_id")
      .notNull()
      .references(() => provenanceEvents.id),
  },
  (table) => [
    check(
      "run_metrics_step_nonnegative",
      sql`${table.step} IS NULL OR ${table.step} >= 0`,
    ),
    uniqueIndex("run_metrics_run_name_step_unique").on(
      table.runId,
      table.name,
      table.step,
    ),
    index("idx_run_metrics_project_run").on(
      table.projectId,
      table.runId,
      table.name,
      table.step,
    ),
  ],
);

export const runArtifacts = sqliteTable(
  "run_artifacts",
  {
    id: text("id")
      .primaryKey()
      .references(() => researchObjects.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => experimentRuns.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    path: text("path").notNull(),
    mediaType: text("media_type").notNull(),
    contentHash: text("content_hash").notNull(),
    generatorPath: text("generator_path"),
    generatorHash: text("generator_hash"),
    inputFingerprint: text("input_fingerprint").notNull(),
    state: text("state").notNull().default("current"),
    staleReasonsJson: text("stale_reasons_json").notNull().default("[]"),
    provenanceEventId: text("provenance_event_id")
      .notNull()
      .references(() => provenanceEvents.id),
    generatedAt: text("generated_at").notNull(),
    checkedAt: text("checked_at").notNull(),
  },
  (table) => [
    check(
      "run_artifacts_kind",
      sql`${table.kind} IN ('figure', 'table', 'file')`,
    ),
    check("run_artifacts_state", sql`${table.state} IN ('current', 'stale')`),
    check(
      "run_artifacts_stale_reasons_json",
      sql`json_valid(${table.staleReasonsJson}) AND json_type(${table.staleReasonsJson}) = 'array'`,
    ),
    uniqueIndex("run_artifacts_project_id_unique").on(
      table.id,
      table.projectId,
    ),
    uniqueIndex("run_artifacts_project_path_unique").on(
      table.projectId,
      table.path,
    ),
    index("idx_run_artifacts_project_run").on(
      table.projectId,
      table.runId,
      table.state,
      table.generatedAt,
    ),
  ],
);
