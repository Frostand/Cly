import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
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
