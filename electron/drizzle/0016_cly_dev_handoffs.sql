CREATE TABLE IF NOT EXISTS cly_dev_handoffs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  protocol TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  minimum_reader_version INTEGER NOT NULL,
  canonical_payload_json TEXT NOT NULL,
  integrity_digest TEXT NOT NULL,
  repository_fingerprint_json TEXT NOT NULL,
  research_fingerprint_json TEXT NOT NULL,
  inspection_json TEXT NOT NULL,
  exported_at TEXT NOT NULL,
  imported_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CHECK(direction IN ('export','import')),
  CHECK(protocol = 'cly.dev.handoff'),
  CHECK(schema_version = 1),
  CHECK(minimum_reader_version >= 1 AND minimum_reader_version <= schema_version),
  CHECK(json_valid(canonical_payload_json) AND json_type(canonical_payload_json) = 'object'),
  CHECK(length(integrity_digest) = 64),
  CHECK(json_valid(repository_fingerprint_json) AND json_type(repository_fingerprint_json) = 'object'),
  CHECK(json_valid(research_fingerprint_json) AND json_type(research_fingerprint_json) = 'object'),
  CHECK(json_valid(inspection_json) AND json_type(inspection_json) = 'object'),
  CHECK((direction = 'export' AND imported_at IS NULL) OR (direction = 'import' AND imported_at IS NOT NULL)),
  UNIQUE(id, project_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS cly_dev_handoffs_import_identity_unique
  ON cly_dev_handoffs(project_id, integrity_digest)
  WHERE direction = 'import';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_cly_dev_handoffs_project_created
  ON cly_dev_handoffs(project_id, direction, created_at DESC, id);
