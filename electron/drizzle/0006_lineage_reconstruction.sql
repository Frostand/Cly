CREATE TABLE IF NOT EXISTS lineage_suggestions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  logical_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  lifecycle_state TEXT NOT NULL DEFAULT 'current',
  supersedes_suggestion_id TEXT,
  chain_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  rationale TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'inferred',
  review_state TEXT NOT NULL DEFAULT 'unreviewed',
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT lineage_suggestions_project_id_projects_id_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT lineage_suggestions_supersedes_project_fk
    FOREIGN KEY (supersedes_suggestion_id, project_id)
    REFERENCES lineage_suggestions(id, project_id),
  CONSTRAINT lineage_suggestions_chain_json CHECK(json_valid(chain_json)),
  CONSTRAINT lineage_suggestions_origin_inferred CHECK(origin = 'inferred'),
  CONSTRAINT lineage_suggestions_review_state CHECK(review_state IN ('unreviewed', 'approved', 'rejected')),
  CONSTRAINT lineage_suggestions_lifecycle_state CHECK(lifecycle_state IN ('current', 'stale', 'superseded')),
  CONSTRAINT lineage_suggestions_revision_positive CHECK(revision >= 1),
  CONSTRAINT lineage_suggestions_id_project_unique UNIQUE(id, project_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS lineage_suggestions_current_logical_unique
  ON lineage_suggestions (project_id, logical_key)
  WHERE lifecycle_state = 'current';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_lineage_suggestions_project_review
  ON lineage_suggestions (project_id, review_state, updated_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS lineage_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  suggestion_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  path TEXT,
  coordinates TEXT NOT NULL,
  excerpt TEXT,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT lineage_evidence_project_id_projects_id_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT lineage_evidence_suggestion_project_fk
    FOREIGN KEY (suggestion_id, project_id)
    REFERENCES lineage_suggestions(id, project_id) ON DELETE cascade,
  CONSTRAINT lineage_evidence_coordinates_json CHECK(json_valid(coordinates))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS lineage_evidence_suggestion_hash_unique
  ON lineage_evidence (suggestion_id, content_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_lineage_evidence_project_suggestion
  ON lineage_evidence (project_id, suggestion_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS lineage_scan_measurements (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  scan_duration_ms INTEGER NOT NULL,
  time_to_first_chain_ms INTEGER,
  suggestion_count INTEGER NOT NULL,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  correction_count INTEGER NOT NULL DEFAULT 0,
  manual_config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  CONSTRAINT lineage_scan_measurements_project_id_projects_id_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT lineage_scan_measurements_manual_config_json CHECK(json_valid(manual_config_json))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_lineage_scan_measurements_project_created
  ON lineage_scan_measurements (project_id, created_at);
