// @vitest-environment node

import { getTableName } from "drizzle-orm";
import { getTableConfig, SQLiteDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  agentConfigurations,
  agentContextAuditEvents,
  agentContextItems,
  agentContextManifestEntries,
  agentContextManifests,
  agentContextPackEntries,
  agentContextPacks,
  agentContextRevisions,
  agentContextTransmissionApprovals,
  agentRoleConfigurations,
  clyDevHandoffs,
  clyDevToolEffects,
} from "./schema.js";

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

describe("Cly Dev execution Drizzle schema", () => {
  it("matches the durable tool-effect claim lifecycle in migration 0017", () => {
    expect(tableContract(clyDevToolEffects)).toMatchObject({
      checkSql: {
        cly_dev_tool_effects_error_json:
          "error_json IS NULL OR json_valid(error_json)",
        cly_dev_tool_effects_lifecycle:
          "(status = 'claimed' AND result_json IS NULL AND error_json IS NULL AND completed_at IS NULL AND failed_at IS NULL) OR (status = 'completed' AND result_json IS NOT NULL AND error_json IS NULL AND completed_at IS NOT NULL AND failed_at IS NULL) OR (status = 'failed' AND result_json IS NULL AND error_json IS NOT NULL AND completed_at IS NULL AND failed_at IS NOT NULL)",
        cly_dev_tool_effects_result_json:
          "result_json IS NULL OR json_valid(result_json)",
        cly_dev_tool_effects_status:
          "status IN ('claimed', 'completed', 'failed')",
      },
      foreignKeys: [
        {
          columns: ["session_id", "project_id"],
          foreignColumns: ["id", "project_id"],
          foreignTable: "cly_dev_sessions",
          name: "cly_dev_tool_effects_session_project_fk",
          onDelete: "cascade",
        },
      ],
      indexes: {
        idx_cly_dev_tool_effects_project_session_status: [
          { name: "project_id", order: "asc" },
          { name: "session_id", order: "asc" },
          { name: "status", order: "asc" },
          { name: "claimed_at", order: "asc" },
        ],
      },
    });
  });

  it("matches the project-scoped handoff materialization linkage in migration 0018", () => {
    expect(
      getTableConfig(clyDevHandoffs).columns.map((column) => column.name),
    ).toEqual(
      expect.arrayContaining(["materialized_session_id", "materialized_at"]),
    );
    expect(tableContract(clyDevHandoffs)).toMatchObject({
      indexes: {
        cly_dev_handoffs_import_identity_unique: [
          { name: "project_id", order: "asc" },
          { name: "integrity_digest", order: "asc" },
        ],
        cly_dev_handoffs_materialized_session_unique: [
          { name: "project_id", order: "asc" },
          { name: "materialized_session_id", order: "asc" },
        ],
        idx_cly_dev_handoffs_project_created: [
          { name: "project_id", order: "asc" },
          { name: "direction", order: "asc" },
          { name: "created_at", order: "desc" },
          { name: "id", order: "asc" },
        ],
      },
    });
  });
});

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
        agent_roles_reasoning_effort:
          "reasoning_effort IS NULL OR reasoning_effort IN ('low', 'medium', 'high', 'xhigh', 'max', 'ultra')",
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

describe("agent context Drizzle schema", () => {
  it("declares every migration table with its checks, indexes, and relational bindings", () => {
    const contracts = Object.fromEntries(
      [
        agentContextItems,
        agentContextRevisions,
        agentContextPacks,
        agentContextPackEntries,
        agentContextTransmissionApprovals,
        agentContextManifests,
        agentContextManifestEntries,
        agentContextAuditEvents,
      ].map((table) => [getTableName(table), tableContract(table)]),
    );

    expect(Object.keys(contracts)).toEqual([
      "agent_context_items",
      "agent_context_revisions",
      "agent_context_packs",
      "agent_context_pack_entries",
      "agent_context_transmission_approvals",
      "agent_context_manifests",
      "agent_context_manifest_entries",
      "agent_context_audit_events",
    ]);
    expect(contracts.agent_context_items.indexes).toMatchObject({
      idx_agent_context_items_project_updated: [
        { name: "project_id", order: "asc" },
        { name: "updated_at", order: "desc" },
        { name: "id", order: "asc" },
      ],
    });
    expect(contracts.agent_context_revisions).toMatchObject({
      checkSql: {
        agent_context_revisions_evidence_json:
          "json_valid(evidence_refs_json) AND json_type(evidence_refs_json) = 'array'",
        agent_context_revisions_number: "revision >= 1",
        agent_context_revisions_sensitivity:
          "sensitivity IN ('standard','restricted','local_only')",
      },
      indexes: {
        idx_agent_context_revisions_item: [
          { name: "project_id", order: "asc" },
          { name: "item_id", order: "asc" },
          { name: "revision", order: "desc" },
        ],
      },
    });
    expect(contracts.agent_context_packs.foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ["configuration_id", "role_id"],
          foreignColumns: ["configuration_id", "id"],
          foreignTable: "agent_role_configurations",
          name: "agent_context_packs_configuration_role_fk",
        }),
      ]),
    );
    expect(contracts.agent_context_pack_entries).toMatchObject({
      checkSql: {
        agent_context_pack_entries_position: "position >= 0",
        agent_context_pack_entries_representation:
          "representation IN ('raw','summary')",
        agent_context_pack_entries_sensitivity:
          "sensitivity IN ('standard','restricted','local_only')",
      },
      primaryKeys: [["pack_id", "position"]],
    });
    expect(
      contracts.agent_context_transmission_approvals.checkSql,
    ).toMatchObject({
      agent_context_approvals_expiry:
        "expires_at IS NULL OR julianday(expires_at) IS NOT NULL",
      agent_context_approvals_references_json:
        "json_valid(restricted_reference_ids_json) AND json_type(restricted_reference_ids_json) = 'array'",
      agent_context_approvals_revocation_state:
        "(state = 'approved' AND revoked_at IS NULL) OR (state = 'revoked' AND revoked_at IS NOT NULL)",
      agent_context_approvals_state: "state IN ('approved','revoked')",
    });
    expect(contracts.agent_context_manifests.foreignKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          columns: ["configuration_id", "role_id"],
          foreignColumns: ["configuration_id", "id"],
          foreignTable: "agent_role_configurations",
          name: "agent_context_manifests_configuration_role_fk",
        }),
        expect.objectContaining({
          columns: ["transmission_approval_id", "project_id"],
          foreignColumns: ["id", "project_id"],
          foreignTable: "agent_context_transmission_approvals",
          name: "agent_context_manifests_approval_project_fk",
        }),
      ]),
    );
    expect(contracts.agent_context_manifests.checkSql).toMatchObject({
      agent_context_manifests_canonical_entry_count:
        "entry_count = json_array_length(json_extract(canonical_payload, '$.entries'))",
      agent_context_manifests_canonical_json:
        "json_valid(canonical_payload) AND json_type(canonical_payload) = 'object'",
      agent_context_manifests_operation_json:
        "json_valid(obligation_operation_json) AND json_type(obligation_operation_json) = 'object'",
      agent_context_manifests_evaluation_hash:
        "length(obligation_evaluation_hash) = 64 AND obligation_evaluation_hash = lower(obligation_evaluation_hash) AND obligation_evaluation_hash NOT GLOB '*[^0-9a-f]*'",
    });
    expect(contracts.agent_context_manifest_entries).toMatchObject({
      checkSql: {
        agent_context_manifest_entries_kind:
          "kind IN ('approved_fact','inferred_fact','source_passage','file','conversation','graph_object')",
        agent_context_manifest_entries_sensitivity:
          "sensitivity IN ('standard','restricted')",
      },
      primaryKeys: [["manifest_id", "position"]],
    });
    expect(contracts.agent_context_audit_events.checkSql).toEqual({
      agent_context_audit_metadata_json: "json_valid(metadata_json)",
    });
  });
});
