CREATE TABLE IF NOT EXISTS preregistration_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  amends_snapshot_id TEXT,
  content_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'human',
  provenance_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT preregistration_snapshots_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT preregistration_snapshots_experiment_fk
    FOREIGN KEY (experiment_id) REFERENCES research_objects(id),
  CONSTRAINT preregistration_snapshots_parent_fk
    FOREIGN KEY (amends_snapshot_id) REFERENCES preregistration_snapshots(id),
  CONSTRAINT preregistration_snapshots_event_fk
    FOREIGN KEY (provenance_event_id) REFERENCES provenance_events(id),
  CONSTRAINT preregistration_snapshots_version CHECK(version >= 1),
  CONSTRAINT preregistration_snapshots_version_parent CHECK(
    (version = 1 AND amends_snapshot_id IS NULL) OR
    (version > 1 AND amends_snapshot_id IS NOT NULL)
  ),
  CONSTRAINT preregistration_snapshots_content_json CHECK(json_valid(content_json)),
  CONSTRAINT preregistration_snapshots_content_hash CHECK(
    length(content_hash) = 64 AND
    content_hash = lower(content_hash) AND
    content_hash NOT GLOB '*[^0-9a-f]*'
  ),
  CONSTRAINT preregistration_snapshots_actor_type CHECK(actor_type IN ('human', 'agent', 'system', 'integration')),
  CONSTRAINT preregistration_snapshots_origin CHECK(origin IN ('human', 'imported', 'inferred', 'system')),
  CONSTRAINT preregistration_snapshots_project_experiment_version_unique
    UNIQUE(project_id, experiment_id, version),
  CONSTRAINT preregistration_snapshots_id_project_unique UNIQUE(id, project_id),
  CONSTRAINT preregistration_snapshots_event_unique UNIQUE(provenance_event_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_preregistration_snapshots_project_experiment
  ON preregistration_snapshots (project_id, experiment_id, version DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS preregistration_evaluations (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  provenance_event_id TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  CONSTRAINT preregistration_evaluations_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT preregistration_evaluations_snapshot_fk
    FOREIGN KEY (snapshot_id) REFERENCES preregistration_snapshots(id),
  CONSTRAINT preregistration_evaluations_event_fk
    FOREIGN KEY (provenance_event_id) REFERENCES provenance_events(id),
  CONSTRAINT preregistration_evaluations_snapshot_unique UNIQUE(snapshot_id),
  CONSTRAINT preregistration_evaluations_event_unique UNIQUE(provenance_event_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS analysis_deviations (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  field_path TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  rationale TEXT NOT NULL,
  declaration_timing TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  provenance_event_id TEXT NOT NULL,
  declared_at TEXT NOT NULL,
  CONSTRAINT analysis_deviations_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT analysis_deviations_snapshot_fk
    FOREIGN KEY (snapshot_id) REFERENCES preregistration_snapshots(id),
  CONSTRAINT analysis_deviations_event_fk
    FOREIGN KEY (provenance_event_id) REFERENCES provenance_events(id),
  CONSTRAINT analysis_deviations_field_path CHECK(field_path GLOB '/*' AND length(field_path) > 1),
  CONSTRAINT analysis_deviations_before_json CHECK(json_valid(before_json)),
  CONSTRAINT analysis_deviations_after_json CHECK(json_valid(after_json)),
  CONSTRAINT analysis_deviations_changed CHECK(before_json <> after_json),
  CONSTRAINT analysis_deviations_rationale CHECK(length(trim(rationale)) > 0),
  CONSTRAINT analysis_deviations_timing CHECK(declaration_timing IN ('pre-evaluation', 'retrospective')),
  CONSTRAINT analysis_deviations_event_unique UNIQUE(provenance_event_id),
  CONSTRAINT analysis_deviations_id_project_unique UNIQUE(id, project_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_analysis_deviations_project_snapshot
  ON analysis_deviations (project_id, snapshot_id, declared_at, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS analysis_deviation_acknowledgements (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  deviation_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'acknowledged',
  actor_id TEXT NOT NULL,
  provenance_event_id TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL,
  CONSTRAINT analysis_deviation_ack_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT analysis_deviation_ack_deviation_fk
    FOREIGN KEY (deviation_id) REFERENCES analysis_deviations(id),
  CONSTRAINT analysis_deviation_ack_event_fk
    FOREIGN KEY (provenance_event_id) REFERENCES provenance_events(id),
  CONSTRAINT analysis_deviation_ack_state CHECK(state = 'acknowledged'),
  CONSTRAINT analysis_deviation_ack_deviation_unique UNIQUE(deviation_id),
  CONSTRAINT analysis_deviation_ack_event_unique UNIQUE(provenance_event_id)
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS preregistration_snapshots_scope_on_insert
BEFORE INSERT ON preregistration_snapshots
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM research_objects
    WHERE id = NEW.experiment_id AND project_id = NEW.project_id AND type = 'experiment'
  ) THEN RAISE(ABORT, 'Preregistration experiment must belong to its project.') END;
  SELECT CASE WHEN NEW.amends_snapshot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM preregistration_snapshots
    WHERE id = NEW.amends_snapshot_id
      AND project_id = NEW.project_id
      AND experiment_id = NEW.experiment_id
      AND version = NEW.version - 1
  ) THEN RAISE(ABORT, 'Preregistration amendment must follow the prior project experiment version.') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM provenance_events
    WHERE id = NEW.provenance_event_id
      AND project_id = NEW.project_id
      AND object_id = NEW.experiment_id
  ) THEN RAISE(ABORT, 'Preregistration provenance must belong to its project experiment.') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS preregistration_snapshots_immutable_update
BEFORE UPDATE ON preregistration_snapshots
BEGIN
  SELECT RAISE(ABORT, 'Preregistration snapshots are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS preregistration_snapshots_immutable_delete
BEFORE DELETE ON preregistration_snapshots
BEGIN
  SELECT RAISE(ABORT, 'Preregistration snapshots are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS preregistration_evaluations_scope_on_insert
BEFORE INSERT ON preregistration_evaluations
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM preregistration_snapshots
    WHERE id = NEW.snapshot_id AND project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'Preregistration evaluation snapshot must belong to its project.') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM provenance_events event
    JOIN preregistration_snapshots snapshot ON snapshot.id = NEW.snapshot_id
    WHERE event.id = NEW.provenance_event_id
      AND event.project_id = NEW.project_id
      AND event.object_id = snapshot.experiment_id
  ) THEN RAISE(ABORT, 'Preregistration evaluation provenance must belong to its project experiment.') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS preregistration_evaluations_immutable_update
BEFORE UPDATE ON preregistration_evaluations
BEGIN
  SELECT RAISE(ABORT, 'Preregistration evaluations are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS preregistration_evaluations_immutable_delete
BEFORE DELETE ON preregistration_evaluations
BEGIN
  SELECT RAISE(ABORT, 'Preregistration evaluations are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS analysis_deviations_scope_on_insert
BEFORE INSERT ON analysis_deviations
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM preregistration_snapshots
    WHERE id = NEW.snapshot_id AND project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'Analysis deviation snapshot must belong to its project.') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM provenance_events event
    JOIN preregistration_snapshots snapshot ON snapshot.id = NEW.snapshot_id
    WHERE event.id = NEW.provenance_event_id
      AND event.project_id = NEW.project_id
      AND event.object_id = snapshot.experiment_id
  ) THEN RAISE(ABORT, 'Analysis deviation provenance must belong to its project experiment.') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS analysis_deviations_immutable_update
BEFORE UPDATE ON analysis_deviations
BEGIN
  SELECT RAISE(ABORT, 'Analysis deviations are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS analysis_deviations_immutable_delete
BEFORE DELETE ON analysis_deviations
BEGIN
  SELECT RAISE(ABORT, 'Analysis deviations are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS analysis_deviation_ack_scope_on_insert
BEFORE INSERT ON analysis_deviation_acknowledgements
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM analysis_deviations
    WHERE id = NEW.deviation_id AND project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'Analysis deviation acknowledgement must belong to its project.') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM provenance_events event
    JOIN analysis_deviations deviation ON deviation.id = NEW.deviation_id
    JOIN preregistration_snapshots snapshot ON snapshot.id = deviation.snapshot_id
    WHERE event.id = NEW.provenance_event_id
      AND event.project_id = NEW.project_id
      AND event.object_id = snapshot.experiment_id
  ) THEN RAISE(ABORT, 'Analysis deviation acknowledgement provenance must belong to its project experiment.') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS analysis_deviation_ack_immutable_update
BEFORE UPDATE ON analysis_deviation_acknowledgements
BEGIN
  SELECT RAISE(ABORT, 'Analysis deviation acknowledgements are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS analysis_deviation_ack_immutable_delete
BEFORE DELETE ON analysis_deviation_acknowledgements
BEGIN
  SELECT RAISE(ABORT, 'Analysis deviation acknowledgements are immutable');
END;
