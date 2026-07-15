CREATE TABLE IF NOT EXISTS experiment_definition_versions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  hypothesis TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT '',
  configuration_json TEXT NOT NULL,
  datasets_json TEXT NOT NULL,
  declared_metrics_json TEXT NOT NULL,
  definition_hash TEXT NOT NULL,
  provenance_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT experiment_definition_versions_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT experiment_definition_versions_experiment_fk
    FOREIGN KEY (experiment_id) REFERENCES research_objects(id) ON DELETE cascade,
  CONSTRAINT experiment_definition_versions_provenance_fk
    FOREIGN KEY (provenance_event_id) REFERENCES provenance_events(id),
  CONSTRAINT experiment_definition_versions_configuration_json CHECK(json_valid(configuration_json)),
  CONSTRAINT experiment_definition_versions_datasets_json CHECK(json_valid(datasets_json) AND json_type(datasets_json) = 'array'),
  CONSTRAINT experiment_definition_versions_declared_metrics_json CHECK(json_valid(declared_metrics_json) AND json_type(declared_metrics_json) = 'array'),
  CONSTRAINT experiment_definition_versions_version_positive CHECK(version >= 1),
  CONSTRAINT experiment_definition_versions_project_id_unique UNIQUE(id, project_id),
  CONSTRAINT experiment_definition_versions_experiment_version_unique UNIQUE(project_id, experiment_id, version)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_experiment_definitions_project_experiment
  ON experiment_definition_versions(project_id, experiment_id, version DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS experiment_runs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  experiment_id TEXT NOT NULL,
  definition_version_id TEXT NOT NULL,
  status TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  configuration_json TEXT NOT NULL,
  datasets_json TEXT NOT NULL,
  code_refs_json TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  exit_code INTEGER,
  provenance_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT experiment_runs_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT experiment_runs_object_fk
    FOREIGN KEY (id) REFERENCES research_objects(id) ON DELETE cascade,
  CONSTRAINT experiment_runs_experiment_fk
    FOREIGN KEY (experiment_id) REFERENCES research_objects(id) ON DELETE cascade,
  CONSTRAINT experiment_runs_definition_project_fk
    FOREIGN KEY (definition_version_id, project_id) REFERENCES experiment_definition_versions(id, project_id),
  CONSTRAINT experiment_runs_provenance_fk
    FOREIGN KEY (provenance_event_id) REFERENCES provenance_events(id),
  CONSTRAINT experiment_runs_status CHECK(status IN ('planned', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT experiment_runs_configuration_json CHECK(json_valid(configuration_json)),
  CONSTRAINT experiment_runs_datasets_json CHECK(json_valid(datasets_json) AND json_type(datasets_json) = 'array'),
  CONSTRAINT experiment_runs_code_refs_json CHECK(json_valid(code_refs_json) AND json_type(code_refs_json) = 'array'),
  CONSTRAINT experiment_runs_project_id_unique UNIQUE(id, project_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_experiment_runs_project_experiment
  ON experiment_runs(project_id, experiment_id, started_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS run_metrics (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  step INTEGER,
  logged_at TEXT NOT NULL,
  provenance_event_id TEXT NOT NULL,
  CONSTRAINT run_metrics_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT run_metrics_run_project_fk
    FOREIGN KEY (run_id, project_id) REFERENCES experiment_runs(id, project_id) ON DELETE cascade,
  CONSTRAINT run_metrics_provenance_fk
    FOREIGN KEY (provenance_event_id) REFERENCES provenance_events(id),
  CONSTRAINT run_metrics_step_nonnegative CHECK(step IS NULL OR step >= 0),
  CONSTRAINT run_metrics_run_name_step_unique UNIQUE(run_id, name, step)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_run_metrics_project_run
  ON run_metrics(project_id, run_id, name, step);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS run_artifacts (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  media_type TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  generator_path TEXT,
  generator_hash TEXT,
  input_fingerprint TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'current',
  stale_reasons_json TEXT NOT NULL DEFAULT '[]',
  provenance_event_id TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  CONSTRAINT run_artifacts_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT run_artifacts_object_fk
    FOREIGN KEY (id) REFERENCES research_objects(id) ON DELETE cascade,
  CONSTRAINT run_artifacts_run_project_fk
    FOREIGN KEY (run_id, project_id) REFERENCES experiment_runs(id, project_id) ON DELETE cascade,
  CONSTRAINT run_artifacts_provenance_fk
    FOREIGN KEY (provenance_event_id) REFERENCES provenance_events(id),
  CONSTRAINT run_artifacts_kind CHECK(kind IN ('figure', 'table', 'file')),
  CONSTRAINT run_artifacts_state CHECK(state IN ('current', 'stale')),
  CONSTRAINT run_artifacts_stale_reasons_json CHECK(json_valid(stale_reasons_json) AND json_type(stale_reasons_json) = 'array'),
  CONSTRAINT run_artifacts_project_id_unique UNIQUE(id, project_id),
  CONSTRAINT run_artifacts_project_path_unique UNIQUE(project_id, path)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_run_artifacts_project_run
  ON run_artifacts(project_id, run_id, state, generated_at DESC);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS experiment_definition_versions_validate_insert
BEFORE INSERT ON experiment_definition_versions
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM research_objects
    WHERE id = NEW.experiment_id AND project_id = NEW.project_id AND type = 'experiment'
  ) THEN RAISE(ABORT, 'Experiment definition must belong to its project experiment.') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS experiment_definition_versions_immutable_update
BEFORE UPDATE ON experiment_definition_versions
BEGIN
  SELECT RAISE(ABORT, 'Experiment definition versions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS experiment_definition_versions_immutable_delete
BEFORE DELETE ON experiment_definition_versions
BEGIN
  SELECT RAISE(ABORT, 'Experiment definition versions are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS experiment_runs_validate_insert
BEFORE INSERT ON experiment_runs
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM research_objects
    WHERE id = NEW.id AND project_id = NEW.project_id AND type = 'run'
  ) THEN RAISE(ABORT, 'Run record must belong to its project run object.') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM research_objects
    WHERE id = NEW.experiment_id AND project_id = NEW.project_id AND type = 'experiment'
  ) THEN RAISE(ABORT, 'Run record must belong to its project experiment.') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS run_artifacts_validate_insert
BEFORE INSERT ON run_artifacts
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM research_objects
    WHERE id = NEW.id AND project_id = NEW.project_id AND type = 'artifact'
  ) THEN RAISE(ABORT, 'Artifact record must belong to its project artifact object.') END;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS run_metrics_immutable_update
BEFORE UPDATE ON run_metrics
BEGIN
  SELECT RAISE(ABORT, 'Run metrics are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS run_metrics_immutable_delete
BEFORE DELETE ON run_metrics
BEGIN
  SELECT RAISE(ABORT, 'Run metrics are immutable');
END;
