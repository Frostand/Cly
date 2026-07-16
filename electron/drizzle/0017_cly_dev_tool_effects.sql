CREATE TABLE IF NOT EXISTS cly_dev_tool_effects (
  stable_execution_key TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT,
  error_json TEXT,
  claimed_at TEXT NOT NULL,
  completed_at TEXT,
  failed_at TEXT,
  FOREIGN KEY (session_id, project_id) REFERENCES cly_dev_sessions(id, project_id) ON DELETE cascade,
  CHECK(status IN ('claimed','completed','failed')),
  CHECK(result_json IS NULL OR json_valid(result_json)),
  CHECK(error_json IS NULL OR json_valid(error_json)),
  CHECK(
    (status = 'claimed' AND result_json IS NULL AND error_json IS NULL AND completed_at IS NULL AND failed_at IS NULL)
    OR (status = 'completed' AND result_json IS NOT NULL AND error_json IS NULL AND completed_at IS NOT NULL AND failed_at IS NULL)
    OR (status = 'failed' AND result_json IS NULL AND error_json IS NOT NULL AND completed_at IS NULL AND failed_at IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_cly_dev_tool_effects_project_session_status
  ON cly_dev_tool_effects(project_id, session_id, status, claimed_at);
