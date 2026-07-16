// @vitest-environment node

import { getTableName } from "drizzle-orm";
import { getTableConfig, SQLiteDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { agentConfigurations, agentRoleConfigurations } from "./schema.js";

const dialect = new SQLiteDialect();

const indexColumnContract = (
  column: ReturnType<
    typeof getTableConfig
  >["indexes"][number]["config"]["columns"][number],
) => {
  if ("name" in column) {
    return {
      name: column.name,
      order:
        "indexConfig" in column ? (column.indexConfig?.order ?? "asc") : "asc",
    };
  }
  const expression = dialect
    .sqlToQuery(column)
    .sql.replaceAll('"', "")
    .replace(/\s+/g, " ")
    .trim();
  const match = expression.match(/(?:^|\.)([^. ]+) (ASC|DESC)$/i);
  return {
    name: match?.[1],
    order: match?.[2]?.toLowerCase(),
  };
};

const tableContract = (table: Parameters<typeof getTableConfig>[0]) => {
  const config = getTableConfig(table);
  const checkSql = Object.fromEntries(
    config.checks.map((item) => [
      item.name,
      dialect
        .sqlToQuery(item.value)
        .sql.replaceAll(`"${config.name}".`, "")
        .replaceAll('"', "")
        .replace(/\s+/g, " ")
        .trim(),
    ]),
  );
  return {
    checkSql,
    foreignKeys: config.foreignKeys
      .map((item) => {
        const reference = item.reference();
        return {
          columns: reference.columns.map((column) => column.name),
          foreignColumns: reference.foreignColumns.map((column) => column.name),
          foreignTable: getTableName(reference.foreignTable),
          name: item.getName(),
          onDelete: item.onDelete,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name)),
    indexes: Object.fromEntries(
      config.indexes.map((item) => [
        item.config.name,
        item.config.columns.map(indexColumnContract),
      ]),
    ),
    primaryKeys: config.primaryKeys.map((item) =>
      item.columns.map((column) => column.name),
    ),
    uniqueConstraints: Object.fromEntries(
      config.uniqueConstraints.map((item) => [
        item.name,
        item.columns.map((column) => column.name),
      ]),
    ),
  };
};

describe("agent configuration Drizzle schema", () => {
  it("matches migration 0013 for configuration constraints and indexes", () => {
    expect(tableContract(agentConfigurations)).toEqual({
      checkSql: {
        agent_configurations_budget_nonnegative:
          "max_input_tokens >= 0 AND max_output_tokens >= 0 AND max_cost_minor_units >= 0 AND max_runtime_ms > 0",
        agent_configurations_failure_policy:
          "partial_failure_policy IN ('continue', 'cancel_remaining')",
        agent_configurations_parallel_positive: "max_parallel >= 1",
        agent_configurations_revision_positive: "revision >= 1",
      },
      foreignKeys: [
        {
          columns: ["project_id"],
          foreignColumns: ["id"],
          foreignTable: "projects",
          name: "agent_configurations_project_fk",
          onDelete: "cascade",
        },
      ],
      indexes: {
        idx_agent_configurations_project_updated: [
          { name: "project_id", order: "asc" },
          { name: "updated_at", order: "desc" },
          { name: "id", order: "asc" },
        ],
      },
      primaryKeys: [],
      uniqueConstraints: {
        agent_configurations_id_project_unique: ["id", "project_id"],
        agent_configurations_project_name_unique: ["project_id", "name"],
      },
    });
  });

  it("matches migration 0013 for role constraints and indexes", () => {
    expect(tableContract(agentRoleConfigurations)).toEqual({
      checkSql: {
        agent_roles_budget_nonnegative:
          "max_input_tokens >= 0 AND max_output_tokens >= 0 AND max_cost_minor_units >= 0 AND max_runtime_ms > 0",
        agent_roles_checkpoints_json:
          "json_valid(approval_checkpoints_json) AND json_type(approval_checkpoints_json) = 'array'",
        agent_roles_context_json:
          "json_valid(allowed_context_sources_json) AND json_type(allowed_context_sources_json) = 'array'",
        agent_roles_globs_json:
          "json_valid(allowed_file_globs_json) AND json_type(allowed_file_globs_json) = 'array'",
        agent_roles_instance_positive: "instance_count >= 1",
        agent_roles_parallel_valid:
          "max_parallel >= 1 AND max_parallel <= instance_count",
        agent_roles_permissions_json:
          "json_valid(permissions_json) AND json_type(permissions_json) = 'object'",
        agent_roles_reasoning: "reasoning_level IN ('low', 'medium', 'high')",
        agent_roles_role:
          "role IN ('orchestrator', 'implementation', 'review', 'literature', 'analysis', 'experiment', 'custom')",
        agent_roles_tools_json:
          "json_valid(allowed_tools_json) AND json_type(allowed_tools_json) = 'array'",
      },
      foreignKeys: [
        {
          columns: ["configuration_id", "project_id"],
          foreignColumns: ["id", "project_id"],
          foreignTable: "agent_configurations",
          name: "agent_roles_configuration_project_fk",
          onDelete: "cascade",
        },
      ],
      indexes: {
        idx_agent_roles_configuration: [
          { name: "project_id", order: "asc" },
          { name: "configuration_id", order: "asc" },
          { name: "position", order: "asc" },
        ],
      },
      primaryKeys: [["configuration_id", "id"]],
      uniqueConstraints: {
        agent_roles_position_unique: ["configuration_id", "position"],
      },
    });
  });
});
