CREATE TABLE IF NOT EXISTS planner_plans (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  input_summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT planner_plans_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT planner_plans_input_summary_json CHECK(json_valid(input_summary_json)),
  CONSTRAINT planner_plans_project_fingerprint_unique UNIQUE(project_id, fingerprint),
  CONSTRAINT planner_plans_project_id_unique UNIQUE(id, project_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planner_plans_project_created ON planner_plans(project_id, created_at DESC, id DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS planner_recommendations (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  expected_benefit TEXT NOT NULL,
  priority TEXT NOT NULL,
  effort TEXT NOT NULL,
  rank_score INTEGER NOT NULL,
  dependencies_json TEXT NOT NULL,
  proposed_action_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recommended',
  requires_explicit_approval INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT planner_recommendations_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT planner_recommendations_plan_fk FOREIGN KEY (plan_id, project_id) REFERENCES planner_plans(id, project_id) ON DELETE cascade,
  CONSTRAINT planner_recommendations_category CHECK(category IN ('blocking-dependency','verification','reproducibility','evidence-gap','stale-artifact','conflict','workflow')),
  CONSTRAINT planner_recommendations_priority CHECK(priority IN ('critical','high','medium','low')),
  CONSTRAINT planner_recommendations_effort CHECK(effort IN ('small','medium','large')),
  CONSTRAINT planner_recommendations_status CHECK(status IN ('recommended','accepted','deferred','dismissed')),
  CONSTRAINT planner_recommendations_dependencies_json CHECK(json_valid(dependencies_json) AND json_type(dependencies_json) = 'array'),
  CONSTRAINT planner_recommendations_proposed_action_json CHECK(json_valid(proposed_action_json) AND json_type(proposed_action_json) = 'object'),
  CONSTRAINT planner_recommendations_approval_required CHECK(requires_explicit_approval = 1),
  CONSTRAINT planner_recommendations_project_id_unique UNIQUE(id, project_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planner_recommendations_project_rank ON planner_recommendations(project_id, rank_score DESC, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS planner_recommendation_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  evidence_kind TEXT NOT NULL,
  object_id TEXT,
  relationship_id TEXT,
  provenance_event_id TEXT,
  audit_finding_id TEXT,
  workflow_reference TEXT,
  label TEXT NOT NULL,
  rationale TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT planner_evidence_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT planner_evidence_recommendation_fk FOREIGN KEY (recommendation_id, project_id) REFERENCES planner_recommendations(id, project_id) ON DELETE cascade,
  CONSTRAINT planner_evidence_object_fk FOREIGN KEY (object_id) REFERENCES research_objects(id) ON DELETE set null,
  CONSTRAINT planner_evidence_relationship_fk FOREIGN KEY (relationship_id) REFERENCES research_relationships(id) ON DELETE set null,
  CONSTRAINT planner_evidence_provenance_fk FOREIGN KEY (provenance_event_id) REFERENCES provenance_events(id) ON DELETE set null,
  CONSTRAINT planner_evidence_kind CHECK(evidence_kind IN ('source','graph','audit','workflow')),
  CONSTRAINT planner_evidence_unique UNIQUE(recommendation_id, evidence_kind, object_id, relationship_id, provenance_event_id, audit_finding_id, workflow_reference)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planner_evidence_project_recommendation ON planner_recommendation_evidence(project_id, recommendation_id, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS planner_decisions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT planner_decisions_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT planner_decisions_recommendation_fk FOREIGN KEY (recommendation_id, project_id) REFERENCES planner_recommendations(id, project_id) ON DELETE cascade,
  CONSTRAINT planner_decisions_action CHECK(action IN ('accept','edit','defer','dismiss')),
  CONSTRAINT planner_decisions_reason CHECK(action NOT IN ('defer','dismiss') OR length(trim(coalesce(reason, ''))) > 0),
  CONSTRAINT planner_decisions_before_json CHECK(json_valid(before_json)),
  CONSTRAINT planner_decisions_after_json CHECK(json_valid(after_json)),
  CONSTRAINT planner_decisions_project_id_unique UNIQUE(id, project_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planner_decisions_project_recommendation ON planner_decisions(project_id, recommendation_id, created_at, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS planner_graph_records (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT planner_graph_records_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT planner_graph_records_recommendation_fk FOREIGN KEY (recommendation_id, project_id) REFERENCES planner_recommendations(id, project_id) ON DELETE cascade,
  CONSTRAINT planner_graph_records_decision_fk FOREIGN KEY (decision_id, project_id) REFERENCES planner_decisions(id, project_id) ON DELETE cascade,
  CONSTRAINT planner_graph_records_evidence_fk FOREIGN KEY (evidence_id) REFERENCES planner_recommendation_evidence(id) ON DELETE cascade,
  CONSTRAINT planner_graph_records_relation CHECK(relation IN ('accepted-because-of','edited-because-of','deferred-because-of','dismissed-despite')),
  CONSTRAINT planner_graph_records_unique UNIQUE(decision_id, evidence_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planner_graph_records_project_recommendation ON planner_graph_records(project_id, recommendation_id, created_at, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS planner_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT planner_audit_events_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT planner_audit_events_recommendation_fk FOREIGN KEY (recommendation_id, project_id) REFERENCES planner_recommendations(id, project_id) ON DELETE cascade,
  CONSTRAINT planner_audit_events_decision_fk FOREIGN KEY (decision_id, project_id) REFERENCES planner_decisions(id, project_id) ON DELETE cascade,
  CONSTRAINT planner_audit_events_metadata_json CHECK(json_valid(metadata_json)),
  CONSTRAINT planner_audit_events_decision_unique UNIQUE(decision_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planner_audit_project_created ON planner_audit_events(project_id, created_at, id);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS planner_decisions_immutable_update BEFORE UPDATE ON planner_decisions BEGIN SELECT RAISE(ABORT, 'Planner decisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS planner_decisions_immutable_delete BEFORE DELETE ON planner_decisions BEGIN SELECT RAISE(ABORT, 'Planner decisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS planner_graph_records_immutable_update BEFORE UPDATE ON planner_graph_records BEGIN SELECT RAISE(ABORT, 'Planner graph records are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS planner_graph_records_immutable_delete BEFORE DELETE ON planner_graph_records BEGIN SELECT RAISE(ABORT, 'Planner graph records are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS planner_audit_events_immutable_update BEFORE UPDATE ON planner_audit_events BEGIN SELECT RAISE(ABORT, 'Planner audit events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS planner_audit_events_immutable_delete BEFORE DELETE ON planner_audit_events BEGIN SELECT RAISE(ABORT, 'Planner audit events are immutable'); END;
