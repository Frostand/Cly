CREATE TABLE IF NOT EXISTS cost_entries (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source TEXT NOT NULL,
  provider_entry_id TEXT,
  dedup_key TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  category TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  confidence_bps INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT cost_entries_project_id_projects_id_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT cost_entries_run_id_research_objects_id_fk
    FOREIGN KEY (run_id) REFERENCES research_objects(id) ON DELETE cascade,
  CONSTRAINT cost_entries_source CHECK(source IN ('manual', 'aws-cur')),
  CONSTRAINT cost_entries_amount_minor_integer CHECK(typeof(amount_minor) = 'integer'),
  CONSTRAINT cost_entries_currency CHECK(length(currency) = 3 AND currency = upper(currency)),
  CONSTRAINT cost_entries_category CHECK(category IN ('gpu', 'cloud', 'storage', 'model-api', 'agent', 'rerun', 'other')),
  CONSTRAINT cost_entries_time_range CHECK(ended_at >= started_at),
  CONSTRAINT cost_entries_confidence CHECK(confidence_bps BETWEEN 0 AND 10000),
  CONSTRAINT cost_entries_raw_json CHECK(json_valid(raw_json)),
  CONSTRAINT cost_entries_project_dedup_unique UNIQUE(project_id, dedup_key)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_cost_entries_project_created
  ON cost_entries (project_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_cost_entries_project_run
  ON cost_entries (project_id, run_id, started_at, id);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS cost_entries_project_run_on_insert
BEFORE INSERT ON cost_entries
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM research_objects
  WHERE id = NEW.run_id AND project_id = NEW.project_id AND type = 'run'
)
BEGIN
  SELECT RAISE(ABORT, 'Cost entry run must belong to its project.');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS cost_entries_project_run_on_update
BEFORE UPDATE OF project_id, run_id ON cost_entries
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM research_objects
  WHERE id = NEW.run_id AND project_id = NEW.project_id AND type = 'run'
)
BEGIN
  SELECT RAISE(ABORT, 'Cost entry run must belong to its project.');
END;
