CREATE TABLE IF NOT EXISTS cly_dev_workspaces (
  id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL, idempotency_key TEXT NOT NULL,
  name TEXT NOT NULL, repository_json TEXT NOT NULL, worktree_json TEXT NOT NULL,
  machine_json TEXT NOT NULL, local_only_json TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CHECK(schema_version = 1), CHECK(json_valid(repository_json)),
  CHECK(json_valid(worktree_json)), CHECK(json_valid(machine_json)),
  CHECK(json_valid(local_only_json)), UNIQUE(id, project_id),
  UNIQUE(project_id, idempotency_key)
);
--> statement-breakpoint
CREATE INDEX idx_cly_dev_workspaces_project_updated ON cly_dev_workspaces(project_id, updated_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cly_dev_context_manifests (
  id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL, idempotency_key TEXT NOT NULL,
  local_only_json TEXT NOT NULL, transferable_json TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  FOREIGN KEY (workspace_id, project_id) REFERENCES cly_dev_workspaces(id, project_id) ON DELETE cascade,
  CHECK(schema_version = 1), CHECK(json_valid(local_only_json)),
  CHECK(json_valid(transferable_json)), UNIQUE(id, project_id),
  UNIQUE(project_id, idempotency_key)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cly_dev_tasks (
  id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL, idempotency_key TEXT NOT NULL,
  title TEXT NOT NULL, objective TEXT NOT NULL, research_object_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  FOREIGN KEY (workspace_id, project_id) REFERENCES cly_dev_workspaces(id, project_id) ON DELETE cascade,
  CHECK(schema_version = 1),
  CHECK(json_valid(research_object_ids_json) AND json_type(research_object_ids_json) = 'array'),
  UNIQUE(id, project_id), UNIQUE(project_id, idempotency_key)
);
--> statement-breakpoint
CREATE INDEX idx_cly_dev_tasks_project_workspace ON cly_dev_tasks(project_id, workspace_id, updated_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cly_dev_sessions (
  id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, task_id TEXT NOT NULL,
  context_manifest_id TEXT NOT NULL, schema_version INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL, title TEXT NOT NULL, provider_json TEXT NOT NULL,
  commit_json TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  FOREIGN KEY (task_id, project_id) REFERENCES cly_dev_tasks(id, project_id) ON DELETE cascade,
  FOREIGN KEY (context_manifest_id, project_id) REFERENCES cly_dev_context_manifests(id, project_id),
  CHECK(schema_version = 1), CHECK(json_valid(provider_json)), CHECK(json_valid(commit_json)),
  CHECK(state IN ('queued','running','awaiting_approval','completed','canceled','failed','interrupted','resumable')),
  UNIQUE(id, project_id), UNIQUE(project_id, idempotency_key)
);
--> statement-breakpoint
CREATE INDEX idx_cly_dev_sessions_project_state ON cly_dev_sessions(project_id, state, updated_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cly_dev_session_projections (
  session_id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL, state TEXT NOT NULL, last_sequence INTEGER NOT NULL DEFAULT 0,
  snapshot_json TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id, project_id) REFERENCES cly_dev_sessions(id, project_id) ON DELETE cascade,
  CHECK(schema_version = 1),
  CHECK(state IN ('queued','running','awaiting_approval','completed','canceled','failed','interrupted','resumable')),
  CHECK(last_sequence >= 0), CHECK(json_valid(snapshot_json))
);
--> statement-breakpoint
CREATE INDEX idx_cly_dev_session_projections_project_state ON cly_dev_session_projections(project_id, state, updated_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cly_dev_session_events (
  id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, session_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL, payload_version INTEGER NOT NULL,
  sequence INTEGER NOT NULL, idempotency_key TEXT NOT NULL, type TEXT NOT NULL,
  transferability TEXT NOT NULL, occurred_at TEXT NOT NULL, actor_json TEXT NOT NULL,
  payload_json TEXT NOT NULL, provenance_json TEXT NOT NULL,
  outbound_envelope_json TEXT, outbound_sha256 TEXT, recorded_at TEXT NOT NULL,
  FOREIGN KEY (session_id, project_id) REFERENCES cly_dev_sessions(id, project_id) ON DELETE cascade,
  CHECK(schema_version = 1), CHECK(payload_version = 1), CHECK(sequence >= 1),
  CHECK(transferability IN ('local-only','transferable')),
  CHECK(json_valid(actor_json)), CHECK(json_valid(payload_json)), CHECK(json_valid(provenance_json)),
  CHECK(outbound_envelope_json IS NULL OR json_valid(outbound_envelope_json)),
  CHECK((transferability = 'local-only' AND outbound_envelope_json IS NULL AND outbound_sha256 IS NULL)
     OR (transferability = 'transferable' AND outbound_envelope_json IS NOT NULL AND length(outbound_sha256) = 64)),
  UNIQUE(session_id, sequence), UNIQUE(session_id, idempotency_key)
);
--> statement-breakpoint
CREATE INDEX idx_cly_dev_session_events_project_session_sequence ON cly_dev_session_events(project_id, session_id, sequence);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cly_dev_approvals (
  id TEXT NOT NULL, project_id TEXT NOT NULL, session_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL, payload_version INTEGER NOT NULL,
  state TEXT NOT NULL, request_sequence INTEGER NOT NULL, resolution_sequence INTEGER,
  payload_json TEXT NOT NULL, requested_at TEXT NOT NULL, resolved_at TEXT,
  PRIMARY KEY (session_id, id),
  FOREIGN KEY (session_id, project_id) REFERENCES cly_dev_sessions(id, project_id) ON DELETE cascade,
  CHECK(schema_version = 1), CHECK(payload_version = 1),
  CHECK(state IN ('pending','approved','rejected','canceled')), CHECK(json_valid(payload_json)),
  CHECK(resolution_sequence IS NULL OR resolution_sequence > request_sequence)
);
--> statement-breakpoint
CREATE INDEX idx_cly_dev_approvals_project_session_order ON cly_dev_approvals(project_id, session_id, request_sequence);
--> statement-breakpoint
CREATE TRIGGER cly_dev_context_manifests_immutable_update BEFORE UPDATE ON cly_dev_context_manifests BEGIN SELECT RAISE(ABORT, 'Cly Dev context manifests are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER cly_dev_context_manifests_immutable_delete BEFORE DELETE ON cly_dev_context_manifests BEGIN SELECT RAISE(ABORT, 'Cly Dev context manifests are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER cly_dev_session_events_immutable_update BEFORE UPDATE ON cly_dev_session_events BEGIN SELECT RAISE(ABORT, 'Cly Dev session events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER cly_dev_session_events_immutable_delete BEFORE DELETE ON cly_dev_session_events BEGIN SELECT RAISE(ABORT, 'Cly Dev session events are immutable'); END;
