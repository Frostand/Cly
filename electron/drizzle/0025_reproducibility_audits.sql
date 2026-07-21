CREATE TABLE IF NOT EXISTS reproducibility_audits (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  input_sha256 TEXT NOT NULL,
  score INTEGER NOT NULL,
  status TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  findings_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT reproducibility_audits_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT reproducibility_audits_project_id_unique UNIQUE(id, project_id),
  CONSTRAINT reproducibility_audits_input_sha256 CHECK(length(input_sha256) = 64 AND input_sha256 NOT GLOB '*[^0-9a-f]*'),
  CONSTRAINT reproducibility_audits_score CHECK(score BETWEEN 0 AND 100),
  CONSTRAINT reproducibility_audits_status CHECK(status IN ('Not reproducible', 'Partially reproducible', 'Mostly reproducible', 'Artifact-ready', 'Publication-ready')),
  CONSTRAINT reproducibility_audits_summary_json CHECK(json_valid(summary_json) AND json_type(summary_json) = 'object'),
  CONSTRAINT reproducibility_audits_findings_json CHECK(json_valid(findings_json) AND json_type(findings_json) = 'array')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reproducibility_audits_project_created
  ON reproducibility_audits(project_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reproducibility_finding_dispositions (
  audit_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  status TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  note TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (audit_id, finding_id),
  CONSTRAINT reproducibility_finding_dispositions_audit_project_fk
    FOREIGN KEY (audit_id, project_id) REFERENCES reproducibility_audits(id, project_id) ON DELETE cascade,
  CONSTRAINT reproducibility_finding_dispositions_status CHECK(status IN ('Assigned', 'Resolved', 'Ignored'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reproducibility_finding_dispositions_project
  ON reproducibility_finding_dispositions(project_id, audit_id, status);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS reproducibility_audits_immutable_update
BEFORE UPDATE ON reproducibility_audits
BEGIN
  SELECT RAISE(ABORT, 'Reproducibility audit reports are immutable');
END;
