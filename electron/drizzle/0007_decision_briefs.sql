CREATE TABLE IF NOT EXISTS decision_briefs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  start_sequence INTEGER NOT NULL,
  cutoff_sequence INTEGER NOT NULL,
  generated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT decision_briefs_project_id_projects_id_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT decision_briefs_interval_valid CHECK(cutoff_sequence >= start_sequence),
  CONSTRAINT decision_briefs_interval_unique UNIQUE(project_id, start_sequence, cutoff_sequence)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_decision_briefs_project_cutoff
  ON decision_briefs (project_id, cutoff_sequence DESC, created_at DESC, id DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS decision_brief_findings (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  brief_id TEXT NOT NULL,
  category TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  owner TEXT,
  deferred_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT decision_brief_findings_project_id_projects_id_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT decision_brief_findings_brief_fk
    FOREIGN KEY (brief_id) REFERENCES decision_briefs(id) ON DELETE cascade,
  CONSTRAINT decision_brief_findings_category CHECK(category IN ('failed-run', 'stale-artifact-or-claim', 'contradictory-evidence', 'missing-provenance', 'unresolved-decision', 'recommended-next-action')),
  CONSTRAINT decision_brief_findings_status CHECK(status IN ('open', 'assigned', 'resolved', 'deferred')),
  CONSTRAINT decision_brief_findings_deferred_reason CHECK(status <> 'deferred' OR length(trim(coalesce(deferred_reason, ''))) > 0),
  CONSTRAINT decision_brief_findings_assigned_owner CHECK(status <> 'assigned' OR length(trim(coalesce(owner, ''))) > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_decision_brief_findings_project_brief_order
  ON decision_brief_findings (project_id, brief_id, sort_order, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS decision_brief_finding_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  provenance_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT decision_brief_finding_evidence_project_id_projects_id_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT decision_brief_finding_evidence_finding_fk
    FOREIGN KEY (finding_id) REFERENCES decision_brief_findings(id) ON DELETE cascade,
  CONSTRAINT decision_brief_finding_evidence_object_fk
    FOREIGN KEY (object_id) REFERENCES research_objects(id),
  CONSTRAINT decision_brief_finding_evidence_event_fk
    FOREIGN KEY (provenance_event_id) REFERENCES provenance_events(id),
  CONSTRAINT decision_brief_finding_evidence_unique UNIQUE(finding_id, object_id, provenance_event_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_decision_brief_finding_evidence_project_finding
  ON decision_brief_finding_evidence (project_id, finding_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS decision_brief_finding_transitions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL,
  owner TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  CONSTRAINT decision_brief_finding_transitions_project_id_projects_id_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT decision_brief_finding_transitions_finding_fk
    FOREIGN KEY (finding_id) REFERENCES decision_brief_findings(id) ON DELETE cascade,
  CONSTRAINT decision_brief_finding_transitions_status CHECK(from_status IN ('open', 'assigned', 'resolved', 'deferred') AND to_status IN ('open', 'assigned', 'resolved', 'deferred')),
  CONSTRAINT decision_brief_finding_transitions_deferred_reason CHECK(to_status <> 'deferred' OR length(trim(coalesce(reason, ''))) > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_decision_brief_finding_transitions_project_finding
  ON decision_brief_finding_transitions (project_id, finding_id, created_at, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS decision_brief_measurements (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  brief_id TEXT NOT NULL,
  meeting_number INTEGER NOT NULL,
  target_meetings INTEGER NOT NULL DEFAULT 4,
  surfaced_decision_count INTEGER NOT NULL,
  assigned_or_resolved_count INTEGER NOT NULL,
  assignment_or_resolution_rate REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  CONSTRAINT decision_brief_measurements_project_id_projects_id_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT decision_brief_measurements_brief_fk
    FOREIGN KEY (brief_id) REFERENCES decision_briefs(id) ON DELETE cascade,
  CONSTRAINT decision_brief_measurements_meeting_number CHECK(meeting_number BETWEEN 1 AND 4),
  CONSTRAINT decision_brief_measurements_target_meetings CHECK(target_meetings = 4),
  CONSTRAINT decision_brief_measurements_counts CHECK(surfaced_decision_count >= 0 AND assigned_or_resolved_count >= 0 AND assigned_or_resolved_count <= surfaced_decision_count),
  CONSTRAINT decision_brief_measurements_rate CHECK(assignment_or_resolution_rate >= 0 AND assignment_or_resolution_rate <= 1)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_decision_brief_measurements_project_brief
  ON decision_brief_measurements (project_id, brief_id, recorded_at DESC, id DESC);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS decision_briefs_immutable_update
BEFORE UPDATE ON decision_briefs
BEGIN
  SELECT RAISE(ABORT, 'Decision briefs are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS decision_briefs_immutable_delete
BEFORE DELETE ON decision_briefs
BEGIN
  SELECT RAISE(ABORT, 'Decision briefs are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS decision_brief_finding_evidence_project_matches_on_insert
BEFORE INSERT ON decision_brief_finding_evidence
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM decision_brief_findings
    WHERE id = NEW.finding_id AND project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'Decision brief evidence finding must belong to its project.') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM research_objects
    WHERE id = NEW.object_id AND project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'Decision brief evidence object must belong to its project.') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM provenance_events
    WHERE id = NEW.provenance_event_id AND project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'Decision brief evidence event must belong to its project.') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS decision_brief_finding_transitions_immutable_update
BEFORE UPDATE ON decision_brief_finding_transitions
BEGIN
  SELECT RAISE(ABORT, 'Decision brief transitions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS decision_brief_finding_transitions_immutable_delete
BEFORE DELETE ON decision_brief_finding_transitions
BEGIN
  SELECT RAISE(ABORT, 'Decision brief transitions are immutable');
END;
