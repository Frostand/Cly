CREATE TABLE IF NOT EXISTS code_entities (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  symbol TEXT,
  language TEXT NOT NULL,
  symbol_kind TEXT,
  line_start INTEGER,
  line_end INTEGER,
  notebook_cell INTEGER,
  content_hash TEXT NOT NULL,
  commit_sha TEXT,
  repository_slug TEXT,
  stale INTEGER NOT NULL DEFAULT 0,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT code_entities_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT code_entities_kind CHECK(kind IN ('file', 'symbol')),
  CONSTRAINT code_entities_language CHECK(language IN ('python', 'jupyter')),
  CONSTRAINT code_entities_symbol_shape CHECK(
    (kind = 'file' AND symbol IS NULL AND symbol_kind IS NULL) OR
    (kind = 'symbol' AND symbol IS NOT NULL AND symbol_kind IN ('function', 'class'))
  ),
  CONSTRAINT code_entities_lines CHECK(
    (line_start IS NULL AND line_end IS NULL) OR
    (line_start >= 1 AND line_end >= line_start)
  ),
  CONSTRAINT code_entities_cell CHECK(notebook_cell IS NULL OR notebook_cell >= 0),
  CONSTRAINT code_entities_hash CHECK(length(content_hash) = 64),
  CONSTRAINT code_entities_stale CHECK(stale IN (0, 1)),
  CONSTRAINT code_entities_id_project_unique UNIQUE(id, project_id),
  CONSTRAINT code_entities_identity_unique UNIQUE(project_id, path, symbol)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS code_entities_file_identity_unique
  ON code_entities(project_id, path) WHERE symbol IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_code_entities_project_path
  ON code_entities(project_id, path, line_start, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS code_research_links (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  code_entity_id TEXT NOT NULL,
  research_object_id TEXT,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_title TEXT NOT NULL,
  link_role TEXT NOT NULL,
  source TEXT NOT NULL,
  origin TEXT NOT NULL,
  confidence REAL,
  evidence_json TEXT NOT NULL,
  verification_state TEXT NOT NULL,
  verified_by TEXT,
  verified_at TEXT,
  stale INTEGER NOT NULL DEFAULT 0,
  stale_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT code_research_links_project_fk
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CONSTRAINT code_research_links_entity_fk
    FOREIGN KEY (code_entity_id, project_id)
    REFERENCES code_entities(id, project_id) ON DELETE cascade,
  CONSTRAINT code_research_links_object_fk
    FOREIGN KEY (research_object_id)
    REFERENCES research_objects(id) ON DELETE cascade,
  CONSTRAINT code_research_links_target_kind CHECK(target_kind IN (
    'objective', 'method', 'dataset', 'experiment', 'run', 'claim',
    'test', 'risk', 'commit', 'issue', 'source', 'artifact'
  )),
  CONSTRAINT code_research_links_role CHECK(link_role IN (
    'implements', 'uses', 'produces', 'tests', 'supports', 'affects', 'discusses'
  )),
  CONSTRAINT code_research_links_source CHECK(source IN ('manual', 'execution', 'agent-proposed')),
  CONSTRAINT code_research_links_confidence CHECK(confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT code_research_links_evidence_json CHECK(
    json_valid(evidence_json) AND json_type(evidence_json) = 'array'
  ),
  CONSTRAINT code_research_links_verification CHECK(
    verification_state IN ('unverified', 'verified', 'rejected')
  ),
  CONSTRAINT code_research_links_inferred_truthfulness CHECK(
    source <> 'agent-proposed' OR
    (confidence IS NOT NULL AND json_array_length(evidence_json) > 0)
  ),
  CONSTRAINT code_research_links_review_shape CHECK(
    (verification_state = 'unverified' AND verified_by IS NULL AND verified_at IS NULL) OR
    (verification_state IN ('verified', 'rejected') AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
  ),
  CONSTRAINT code_research_links_stale CHECK(stale IN (0, 1)),
  CONSTRAINT code_research_links_id_project_unique UNIQUE(id, project_id),
  CONSTRAINT code_research_links_identity_unique UNIQUE(
    project_id, code_entity_id, target_kind, target_id, link_role, source
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_code_research_links_entity
  ON code_research_links(project_id, code_entity_id, verification_state, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_code_research_links_stale
  ON code_research_links(project_id, stale, updated_at, id);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS code_research_links_agent_insert_unverified
BEFORE INSERT ON code_research_links
FOR EACH ROW
WHEN NEW.source = 'agent-proposed' AND NEW.verification_state <> 'unverified'
BEGIN
  SELECT RAISE(ABORT, 'Agent-proposed code links must start unverified.');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS code_research_links_local_target_insert
BEFORE INSERT ON code_research_links
FOR EACH ROW
WHEN NEW.target_kind IN ('experiment', 'run', 'claim', 'source', 'artifact')
  AND NEW.research_object_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Local code link targets must resolve to a research object.');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS code_research_links_local_target_update
BEFORE UPDATE OF target_kind, research_object_id ON code_research_links
FOR EACH ROW
WHEN NEW.target_kind IN ('experiment', 'run', 'claim', 'source', 'artifact')
  AND NEW.research_object_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Local code link targets must resolve to a research object.');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS code_research_links_object_kind_insert
BEFORE INSERT ON code_research_links
FOR EACH ROW
WHEN NEW.research_object_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM research_objects
  WHERE id = NEW.research_object_id AND project_id = NEW.project_id
    AND type = NEW.target_kind
)
BEGIN
  SELECT RAISE(ABORT, 'Code link research object kind must match its target kind.');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS code_research_links_object_kind_update
BEFORE UPDATE OF project_id, research_object_id, target_kind ON code_research_links
FOR EACH ROW
WHEN NEW.research_object_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM research_objects
  WHERE id = NEW.research_object_id AND project_id = NEW.project_id
    AND type = NEW.target_kind
)
BEGIN
  SELECT RAISE(ABORT, 'Code link research object kind must match its target kind.');
END;
