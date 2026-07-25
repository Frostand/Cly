CREATE TABLE IF NOT EXISTS research_decisions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  decision_text TEXT NOT NULL,
  reason TEXT NOT NULL,
  alternatives_json TEXT NOT NULL DEFAULT '[]',
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  affected_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'Active',
  outcome TEXT,
  superseded_by TEXT,
  origin TEXT NOT NULL DEFAULT 'Researcher',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(id, project_id),
  FOREIGN KEY (superseded_by, project_id) REFERENCES research_decisions(id, project_id),
  CHECK(status IN ('Active','Superseded','Unresolved')),
  CHECK(origin IN ('Researcher','Team','Agent-assisted')),
  CHECK(json_valid(alternatives_json) AND json_type(alternatives_json) = 'array'),
  CHECK(json_valid(evidence_ids_json) AND json_type(evidence_ids_json) = 'array'),
  CHECK(json_valid(affected_ids_json) AND json_type(affected_ids_json) = 'array')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_research_decisions_project_updated
  ON research_decisions(project_id, updated_at DESC, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS research_decision_transitions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (decision_id) REFERENCES research_decisions(id) ON DELETE CASCADE,
  CHECK(action IN ('created','updated','superseded')),
  CHECK(before_json IS NULL OR json_valid(before_json)),
  CHECK(json_valid(after_json))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_research_decision_transitions_project_decision
  ON research_decision_transitions(project_id, decision_id, created_at, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS planner_steps (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  rationale TEXT NOT NULL,
  impact TEXT NOT NULL,
  effort TEXT NOT NULL,
  urgency TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  claim_id TEXT,
  experiment_id TEXT,
  agent_preset TEXT NOT NULL,
  context_pack TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Recommended',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CHECK(category IN ('Claim','Experiment','Source','Integrity','Notebook','Code')),
  CHECK(impact IN ('High','Medium','Low')),
  CHECK(effort IN ('Small','Medium','Large')),
  CHECK(urgency IN ('Now','Soon','Later')),
  CHECK(status IN ('Recommended','Accepted','Deferred','Dismissed','In progress')),
  CHECK(json_valid(evidence_ids_json) AND json_type(evidence_ids_json) = 'array')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planner_steps_project_status
  ON planner_steps(project_id, status, updated_at DESC, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS planner_step_transitions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (step_id) REFERENCES planner_steps(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS research_workflow_audits (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  status TEXT NOT NULL,
  areas_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CHECK(score BETWEEN 0 AND 100),
  CHECK(json_valid(areas_json) AND json_type(areas_json) = 'array')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_research_workflow_audits_project_created
  ON research_workflow_audits(project_id, created_at DESC, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS research_workflow_findings (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  audit_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open',
  object_ids_json TEXT NOT NULL DEFAULT '[]',
  area TEXT,
  affected_claim_ids_json TEXT NOT NULL DEFAULT '[]',
  recommended_fix TEXT,
  assignee TEXT,
  deferred_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (audit_id) REFERENCES research_workflow_audits(id) ON DELETE CASCADE,
  CHECK(severity IN ('Blocking','High','Warning','Passed')),
  CHECK(status IN ('Open','Assigned','Resolved','Deferred','Ignored')),
  CHECK(status <> 'Assigned' OR length(trim(coalesce(assignee, ''))) > 0),
  CHECK(status <> 'Deferred' OR length(trim(coalesce(deferred_reason, ''))) > 0),
  CHECK(json_valid(object_ids_json) AND json_type(object_ids_json) = 'array'),
  CHECK(json_valid(affected_claim_ids_json) AND json_type(affected_claim_ids_json) = 'array')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_research_workflow_findings_project_audit
  ON research_workflow_findings(project_id, audit_id, status, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS research_workflow_finding_transitions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL,
  assignee TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (finding_id) REFERENCES research_workflow_findings(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_research_workflow_finding_transitions_project_finding
  ON research_workflow_finding_transitions(project_id, finding_id, created_at, id);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS research_decision_transitions_immutable_update
BEFORE UPDATE ON research_decision_transitions BEGIN SELECT RAISE(ABORT, 'Decision transitions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS research_decision_transitions_immutable_delete
BEFORE DELETE ON research_decision_transitions BEGIN SELECT RAISE(ABORT, 'Decision transitions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS planner_step_transitions_immutable_update
BEFORE UPDATE ON planner_step_transitions BEGIN SELECT RAISE(ABORT, 'Planner transitions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS research_workflow_finding_transitions_immutable_update
BEFORE UPDATE ON research_workflow_finding_transitions BEGIN SELECT RAISE(ABORT, 'Finding transitions are immutable'); END;
