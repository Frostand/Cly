-- cly:ensure-column experiment_runs environment_json TEXT NOT NULL DEFAULT '{}'
--> statement-breakpoint
-- cly:ensure-column experiment_runs dependencies_json TEXT NOT NULL DEFAULT '[]'
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS research_object_staleness (
  object_id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'current',
  reasons_json TEXT NOT NULL DEFAULT '[]',
  explanation TEXT NOT NULL DEFAULT '',
  dependency_path_json TEXT NOT NULL DEFAULT '[]',
  recommendations_json TEXT NOT NULL DEFAULT '[]',
  checked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT research_object_staleness_object_fk
    FOREIGN KEY (object_id) REFERENCES research_objects(id) ON DELETE cascade,
  CONSTRAINT research_object_staleness_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT research_object_staleness_state
    CHECK(state IN ('current', 'stale', 'needs-review')),
  CONSTRAINT research_object_staleness_reasons_json
    CHECK(json_valid(reasons_json) AND json_type(reasons_json) = 'array'),
  CONSTRAINT research_object_staleness_dependency_path_json
    CHECK(json_valid(dependency_path_json) AND json_type(dependency_path_json) = 'array'),
  CONSTRAINT research_object_staleness_recommendations_json
    CHECK(json_valid(recommendations_json) AND json_type(recommendations_json) = 'array'),
  CONSTRAINT research_object_staleness_project_object_unique
    UNIQUE(project_id, object_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_research_object_staleness_project_state
  ON research_object_staleness(project_id, state, updated_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS research_object_staleness_transitions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  explanation TEXT NOT NULL,
  dependency_path_json TEXT NOT NULL,
  recommendations_json TEXT NOT NULL,
  provenance_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT research_object_staleness_transitions_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT research_object_staleness_transitions_object_fk
    FOREIGN KEY (object_id) REFERENCES research_objects(id) ON DELETE cascade,
  CONSTRAINT research_object_staleness_transitions_provenance_fk
    FOREIGN KEY (provenance_event_id) REFERENCES provenance_events(id),
  CONSTRAINT research_object_staleness_transitions_from_state
    CHECK(from_state IN ('current', 'stale', 'needs-review')),
  CONSTRAINT research_object_staleness_transitions_to_state
    CHECK(to_state IN ('current', 'stale', 'needs-review')),
  CONSTRAINT research_object_staleness_transitions_reasons_json
    CHECK(json_valid(reasons_json) AND json_type(reasons_json) = 'array'),
  CONSTRAINT research_object_staleness_transitions_dependency_path_json
    CHECK(json_valid(dependency_path_json) AND json_type(dependency_path_json) = 'array'),
  CONSTRAINT research_object_staleness_transitions_recommendations_json
    CHECK(json_valid(recommendations_json) AND json_type(recommendations_json) = 'array')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_research_object_staleness_transitions_object
  ON research_object_staleness_transitions(project_id, object_id, created_at, id);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS research_object_staleness_validate_insert
BEFORE INSERT ON research_object_staleness
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM research_objects
    WHERE id = NEW.object_id AND project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'Staleness state must belong to its project object.') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS research_object_staleness_validate_update
BEFORE UPDATE OF object_id, project_id ON research_object_staleness
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM research_objects
    WHERE id = NEW.object_id AND project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'Staleness state must belong to its project object.') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS research_object_staleness_transitions_immutable_update
BEFORE UPDATE ON research_object_staleness_transitions
BEGIN
  SELECT RAISE(ABORT, 'Staleness transitions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS research_object_staleness_transitions_validate_insert
BEFORE INSERT ON research_object_staleness_transitions
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM research_objects
    WHERE id = NEW.object_id AND project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'Staleness transition must belong to its project object.') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM provenance_events
    WHERE id = NEW.provenance_event_id AND project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'Staleness transition provenance must belong to its project.') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS research_object_staleness_transitions_immutable_delete
BEFORE DELETE ON research_object_staleness_transitions
BEGIN
  SELECT RAISE(ABORT, 'Staleness transitions are immutable');
END;
