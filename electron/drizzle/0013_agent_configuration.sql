CREATE TABLE IF NOT EXISTS agent_configurations (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  max_parallel INTEGER NOT NULL,
  max_input_tokens INTEGER NOT NULL,
  max_output_tokens INTEGER NOT NULL,
  max_cost_minor_units INTEGER NOT NULL,
  max_runtime_ms INTEGER NOT NULL,
  partial_failure_policy TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT agent_configurations_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT agent_configurations_project_name_unique UNIQUE(project_id, name),
  CONSTRAINT agent_configurations_id_project_unique UNIQUE(id, project_id),
  CONSTRAINT agent_configurations_parallel_positive CHECK(max_parallel >= 1),
  CONSTRAINT agent_configurations_budget_nonnegative CHECK(
    max_input_tokens >= 0 AND max_output_tokens >= 0 AND
    max_cost_minor_units >= 0 AND max_runtime_ms > 0
  ),
  CONSTRAINT agent_configurations_failure_policy CHECK(
    partial_failure_policy IN ('continue', 'cancel_remaining')
  ),
  CONSTRAINT agent_configurations_revision_positive CHECK(revision >= 1)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_agent_configurations_project_updated
  ON agent_configurations(project_id, updated_at DESC, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_role_configurations (
  configuration_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  role TEXT NOT NULL,
  instance_count INTEGER NOT NULL,
  max_parallel INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  reasoning_level TEXT NOT NULL,
  max_input_tokens INTEGER NOT NULL,
  max_output_tokens INTEGER NOT NULL,
  max_cost_minor_units INTEGER NOT NULL,
  max_runtime_ms INTEGER NOT NULL,
  allowed_tools_json TEXT NOT NULL,
  allowed_context_sources_json TEXT NOT NULL,
  allowed_file_globs_json TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  approval_checkpoints_json TEXT NOT NULL,
  fallback_model TEXT,
  PRIMARY KEY (configuration_id, id),
  CONSTRAINT agent_roles_configuration_project_fk
    FOREIGN KEY (configuration_id, project_id)
    REFERENCES agent_configurations(id, project_id) ON DELETE cascade,
  CONSTRAINT agent_roles_position_unique UNIQUE(configuration_id, position),
  CONSTRAINT agent_roles_role CHECK(
    role IN ('orchestrator', 'implementation', 'review', 'literature', 'analysis', 'experiment', 'custom')
  ),
  CONSTRAINT agent_roles_instance_positive CHECK(instance_count >= 1),
  CONSTRAINT agent_roles_parallel_valid CHECK(
    max_parallel >= 1 AND max_parallel <= instance_count
  ),
  CONSTRAINT agent_roles_reasoning CHECK(reasoning_level IN ('low', 'medium', 'high')),
  CONSTRAINT agent_roles_budget_nonnegative CHECK(
    max_input_tokens >= 0 AND max_output_tokens >= 0 AND
    max_cost_minor_units >= 0 AND max_runtime_ms > 0
  ),
  CONSTRAINT agent_roles_tools_json CHECK(
    json_valid(allowed_tools_json) AND json_type(allowed_tools_json) = 'array'
  ),
  CONSTRAINT agent_roles_context_json CHECK(
    json_valid(allowed_context_sources_json) AND json_type(allowed_context_sources_json) = 'array'
  ),
  CONSTRAINT agent_roles_globs_json CHECK(
    json_valid(allowed_file_globs_json) AND json_type(allowed_file_globs_json) = 'array'
  ),
  CONSTRAINT agent_roles_permissions_json CHECK(
    json_valid(permissions_json) AND json_type(permissions_json) = 'object'
  ),
  CONSTRAINT agent_roles_checkpoints_json CHECK(
    json_valid(approval_checkpoints_json) AND json_type(approval_checkpoints_json) = 'array'
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_agent_roles_configuration
  ON agent_role_configurations(project_id, configuration_id, position);
