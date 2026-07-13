-- cly:ensure-column provenance_events sequence INTEGER
--> statement-breakpoint
-- cly:ensure-column provenance_events previous_hash TEXT
--> statement-breakpoint
-- cly:ensure-column provenance_events event_hash TEXT
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS provenance_heads (
  project_id TEXT PRIMARY KEY NOT NULL,
  event_count INTEGER NOT NULL,
  last_sequence INTEGER NOT NULL,
  last_hash TEXT NOT NULL,
  CONSTRAINT provenance_heads_project_id_projects_id_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_provenance_project_sequence
  ON provenance_events (project_id, sequence);
