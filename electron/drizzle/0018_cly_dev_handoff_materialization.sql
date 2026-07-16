ALTER TABLE cly_dev_handoffs ADD COLUMN materialized_session_id TEXT;
--> statement-breakpoint
ALTER TABLE cly_dev_handoffs ADD COLUMN materialized_at TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX cly_dev_handoffs_materialized_session_unique
  ON cly_dev_handoffs(project_id, materialized_session_id)
  WHERE materialized_session_id IS NOT NULL;
