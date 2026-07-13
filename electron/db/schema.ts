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
