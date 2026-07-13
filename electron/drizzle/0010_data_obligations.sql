CREATE TABLE IF NOT EXISTS dataset_obligations (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  dataset_object_id TEXT NOT NULL,
  consent_protocol_scope TEXT NOT NULL,
  approved_purposes_json TEXT NOT NULL DEFAULT '[]',
  permitted_collaborators_json TEXT NOT NULL DEFAULT '[]',
  external_processing TEXT NOT NULL DEFAULT 'review',
  permitted_providers_json TEXT NOT NULL DEFAULT '[]',
  residency_json TEXT NOT NULL DEFAULT '[]',
  retention_expires_at TEXT,
  deletion_due_at TEXT,
  license TEXT NOT NULL,
  owner TEXT NOT NULL,
  review_date TEXT,
  provenance_source TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT dataset_obligations_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT dataset_obligations_dataset_fk
    FOREIGN KEY (dataset_object_id) REFERENCES research_objects(id) ON DELETE cascade,
  CONSTRAINT dataset_obligations_approved_purposes_json CHECK(json_valid(approved_purposes_json) AND json_type(approved_purposes_json) = 'array'),
  CONSTRAINT dataset_obligations_permitted_collaborators_json CHECK(json_valid(permitted_collaborators_json) AND json_type(permitted_collaborators_json) = 'array'),
  CONSTRAINT dataset_obligations_permitted_providers_json CHECK(json_valid(permitted_providers_json) AND json_type(permitted_providers_json) = 'array'),
  CONSTRAINT dataset_obligations_residency_json CHECK(json_valid(residency_json) AND json_type(residency_json) = 'array'),
  CONSTRAINT dataset_obligations_external_processing CHECK(external_processing IN ('allowed', 'review', 'blocked')),
  CONSTRAINT dataset_obligations_revision CHECK(revision >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS dataset_obligations_project_dataset_unique
  ON dataset_obligations(project_id, dataset_object_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_dataset_obligations_project_review
  ON dataset_obligations(project_id, review_date, deletion_due_at);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS dataset_obligations_dataset_project_insert
BEFORE INSERT ON dataset_obligations
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM research_objects
  WHERE id = NEW.dataset_object_id AND project_id = NEW.project_id AND type = 'source'
)
BEGIN
  SELECT RAISE(ABORT, 'Dataset obligation source must belong to its project.');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS dataset_obligations_dataset_project_update
BEFORE UPDATE OF project_id, dataset_object_id ON dataset_obligations
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM research_objects
  WHERE id = NEW.dataset_object_id AND project_id = NEW.project_id AND type = 'source'
)
BEGIN
  SELECT RAISE(ABORT, 'Dataset obligation source must belong to its project.');
END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS obligation_alerts (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  source_obligation_id TEXT,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  affected_object_ids_json TEXT NOT NULL,
  rationale TEXT NOT NULL,
  resolution TEXT NOT NULL,
  operation_json TEXT,
  state TEXT NOT NULL DEFAULT 'open',
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  resolution_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT obligation_alerts_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT obligation_alerts_obligation_fk
    FOREIGN KEY (source_obligation_id) REFERENCES dataset_obligations(id) ON DELETE cascade,
  CONSTRAINT obligation_alerts_affected_json CHECK(json_valid(affected_object_ids_json) AND json_type(affected_object_ids_json) = 'array'),
  CONSTRAINT obligation_alerts_operation_json CHECK(operation_json IS NULL OR json_valid(operation_json)),
  CONSTRAINT obligation_alerts_severity CHECK(severity IN ('info', 'warning', 'critical')),
  CONSTRAINT obligation_alerts_state CHECK(state IN ('open', 'acknowledged', 'resolved'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_obligation_alerts_project_state
  ON obligation_alerts(project_id, state, severity, updated_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS obligation_operation_approvals (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  evaluation_hash TEXT NOT NULL,
  operation_json TEXT NOT NULL,
  warning_alert_ids_json TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  rationale TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  CONSTRAINT obligation_operation_approvals_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT obligation_operation_approvals_operation_json CHECK(json_valid(operation_json)),
  CONSTRAINT obligation_operation_approvals_warning_json CHECK(json_valid(warning_alert_ids_json) AND json_type(warning_alert_ids_json) = 'array'),
  CONSTRAINT obligation_operation_approvals_state CHECK(state IN ('approved', 'revoked'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_obligation_operation_approvals_lookup
  ON obligation_operation_approvals(project_id, evaluation_hash, state, created_at);
