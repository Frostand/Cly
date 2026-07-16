CREATE TABLE IF NOT EXISTS agent_context_items (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  label TEXT NOT NULL,
  approved_revision_id TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  UNIQUE(id, project_id),
  CHECK(pinned IN (0, 1)), CHECK(locked IN (0, 1)), CHECK(version >= 1)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_agent_context_items_project_updated ON agent_context_items(project_id, updated_at DESC, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_context_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  origin_class TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence REAL,
  evidence_refs_json TEXT NOT NULL,
  last_checked_at TEXT,
  producer_process TEXT NOT NULL,
  producer_model TEXT,
  verification_state TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id, project_id) REFERENCES agent_context_items(id, project_id) ON DELETE cascade,
  UNIQUE(id, project_id), UNIQUE(item_id, revision),
  CHECK(origin_class IN ('approved_fact','inferred_fact','source_passage','file','conversation','graph_object')),
  CHECK(confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CHECK(json_valid(evidence_refs_json) AND json_type(evidence_refs_json) = 'array'),
  CHECK(verification_state IN ('unverified','verified','stale','conflicted')),
  CHECK(sensitivity IN ('standard','restricted','local_only')), CHECK(revision >= 1)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_agent_context_revisions_item ON agent_context_revisions(project_id, item_id, revision DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_context_packs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  configuration_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  FOREIGN KEY (configuration_id, project_id) REFERENCES agent_configurations(id, project_id) ON DELETE cascade,
  FOREIGN KEY (configuration_id, role_id) REFERENCES agent_role_configurations(configuration_id, id),
  UNIQUE(id, project_id), UNIQUE(project_id, name), CHECK(revision >= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_context_pack_entries (
  pack_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  representation TEXT NOT NULL,
  selection_reason TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  PRIMARY KEY(pack_id, position),
  FOREIGN KEY (pack_id, project_id) REFERENCES agent_context_packs(id, project_id) ON DELETE cascade,
  FOREIGN KEY (item_id, project_id) REFERENCES agent_context_items(id, project_id),
  FOREIGN KEY (revision_id, project_id) REFERENCES agent_context_revisions(id, project_id),
  CHECK(position >= 0), CHECK(representation IN ('raw','summary')),
  CHECK(sensitivity IN ('standard','restricted','local_only'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_context_manifests (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  configuration_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  canonical_payload TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  total_tokens INTEGER NOT NULL,
  entry_count INTEGER NOT NULL,
  excluded_json TEXT NOT NULL,
  privacy_warnings_json TEXT NOT NULL,
  selected_object_ids_json TEXT NOT NULL,
  obligation_operation_json TEXT NOT NULL,
  obligation_operation_hash TEXT NOT NULL,
  obligation_evaluation_hash TEXT NOT NULL,
  transmission_approval_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  FOREIGN KEY (pack_id, project_id) REFERENCES agent_context_packs(id, project_id),
  FOREIGN KEY (configuration_id, project_id) REFERENCES agent_configurations(id, project_id),
  FOREIGN KEY (configuration_id, role_id) REFERENCES agent_role_configurations(configuration_id, id),
  FOREIGN KEY (transmission_approval_id, project_id) REFERENCES agent_context_transmission_approvals(id, project_id),
  UNIQUE(id, project_id), UNIQUE(project_id, idempotency_key),
  CHECK(schema_version = 1),
  CHECK(length(sha256) = 64 AND sha256 = lower(sha256) AND sha256 NOT GLOB '*[^0-9a-f]*'),
  CHECK(total_tokens >= 0), CHECK(entry_count >= 0),
  CHECK(json_valid(canonical_payload) AND json_type(canonical_payload) = 'object'),
  CHECK(entry_count = json_array_length(json_extract(canonical_payload, '$.entries'))),
  CHECK(json_valid(excluded_json) AND json_type(excluded_json) = 'array'),
  CHECK(json_valid(privacy_warnings_json) AND json_type(privacy_warnings_json) = 'array'),
  CHECK(json_valid(selected_object_ids_json) AND json_type(selected_object_ids_json) = 'array'),
  CHECK(json_valid(obligation_operation_json) AND json_type(obligation_operation_json) = 'object'),
  CHECK(length(obligation_operation_hash) = 64 AND obligation_operation_hash = lower(obligation_operation_hash) AND obligation_operation_hash NOT GLOB '*[^0-9a-f]*'),
  CHECK(length(obligation_evaluation_hash) = 64 AND obligation_evaluation_hash = lower(obligation_evaluation_hash) AND obligation_evaluation_hash NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_context_manifest_entries (
  manifest_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  representation TEXT NOT NULL,
  token_estimate INTEGER NOT NULL,
  selection_reason TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  PRIMARY KEY(manifest_id, position),
  FOREIGN KEY (manifest_id, project_id) REFERENCES agent_context_manifests(id, project_id) ON DELETE cascade,
  FOREIGN KEY (item_id, project_id) REFERENCES agent_context_items(id, project_id),
  FOREIGN KEY (revision_id, project_id) REFERENCES agent_context_revisions(id, project_id),
  CHECK(position >= 0), CHECK(token_estimate >= 0),
  CHECK(kind IN ('approved_fact','inferred_fact','source_passage','file','conversation','graph_object')),
  CHECK(representation IN ('raw','summary')),
  CHECK(sensitivity IN ('standard','restricted'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_context_transmission_approvals (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  restricted_reference_ids_json TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  rationale TEXT NOT NULL,
  state TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  UNIQUE(id, project_id),
  CHECK(length(manifest_sha256) = 64 AND manifest_sha256 = lower(manifest_sha256) AND manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  CHECK(json_valid(restricted_reference_ids_json) AND json_type(restricted_reference_ids_json) = 'array'),
  CHECK(state IN ('approved','revoked')),
  CHECK(expires_at IS NULL OR julianday(expires_at) IS NOT NULL),
  CHECK((state = 'approved' AND revoked_at IS NULL) OR (state = 'revoked' AND revoked_at IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_context_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  item_id TEXT,
  pack_id TEXT,
  manifest_id TEXT,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  producer_process TEXT NOT NULL,
  producer_model TEXT,
  before_revision_id TEXT,
  after_revision_id TEXT,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade,
  CHECK(json_valid(metadata_json))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_agent_context_audit_project_created ON agent_context_audit_events(project_id, created_at, id);
--> statement-breakpoint
CREATE TRIGGER agent_context_approved_revision_insert BEFORE INSERT ON agent_context_items
WHEN NEW.approved_revision_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Context items must begin without an approved revision'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_approved_revision_update BEFORE UPDATE OF approved_revision_id ON agent_context_items
WHEN NEW.approved_revision_id IS NOT OLD.approved_revision_id AND (
  NEW.approved_revision_id IS NULL OR
  NOT EXISTS (
    SELECT 1 FROM agent_context_revisions r
    WHERE r.id = NEW.approved_revision_id AND r.item_id = NEW.id AND r.project_id = NEW.project_id
  ) OR
  NOT EXISTS (
    SELECT 1 FROM agent_context_audit_events audit
    WHERE audit.project_id = NEW.project_id AND audit.item_id = NEW.id
      AND audit.after_revision_id = NEW.approved_revision_id
      AND audit.before_revision_id IS OLD.approved_revision_id
      AND audit.created_at = NEW.updated_at
      AND (
        (audit.action = 'context.created'
          AND OLD.approved_revision_id IS NULL
          AND NEW.version = OLD.version
          AND json_extract(audit.metadata_json, '$.approved') = 1) OR
        (audit.action = 'context.revision_approved'
          AND NEW.version = OLD.version + 1)
      )
  )
)
BEGIN SELECT RAISE(ABORT, 'Approved revision changes require an exact immutable approval audit event'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_pack_entry_revision_scope BEFORE INSERT ON agent_context_pack_entries
WHEN NOT EXISTS (
  SELECT 1 FROM agent_context_revisions r WHERE r.id = NEW.revision_id AND r.item_id = NEW.item_id AND r.project_id = NEW.project_id
) BEGIN SELECT RAISE(ABORT, 'Pack revision must belong to the same item and project'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_pack_entry_current_approval_insert BEFORE INSERT ON agent_context_pack_entries
WHEN NOT EXISTS (
  SELECT 1 FROM agent_context_items i
  JOIN agent_context_revisions r
    ON r.id = NEW.revision_id AND r.item_id = i.id AND r.project_id = i.project_id
  WHERE i.id = NEW.item_id AND i.project_id = NEW.project_id
    AND i.approved_revision_id = NEW.revision_id AND i.deleted_at IS NULL
    AND r.sensitivity = NEW.sensitivity
) BEGIN SELECT RAISE(ABORT, 'Outbound pack revision must be the current approved non-deleted revision with exact sensitivity'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_pack_entry_current_approval_update BEFORE UPDATE OF item_id, revision_id, project_id, sensitivity ON agent_context_pack_entries
WHEN NOT EXISTS (
  SELECT 1 FROM agent_context_items i
  JOIN agent_context_revisions r
    ON r.id = NEW.revision_id AND r.item_id = i.id AND r.project_id = i.project_id
  WHERE i.id = NEW.item_id AND i.project_id = NEW.project_id
    AND i.approved_revision_id = NEW.revision_id AND i.deleted_at IS NULL
    AND r.sensitivity = NEW.sensitivity
) BEGIN SELECT RAISE(ABORT, 'Outbound pack revision must be the current approved non-deleted revision with exact sensitivity'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_manifest_entry_revision_scope BEFORE INSERT ON agent_context_manifest_entries
WHEN NOT EXISTS (
  SELECT 1 FROM agent_context_revisions r WHERE r.id = NEW.revision_id AND r.item_id = NEW.item_id AND r.project_id = NEW.project_id
) BEGIN SELECT RAISE(ABORT, 'Manifest revision must belong to the same item and project'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_manifest_entry_position BEFORE INSERT ON agent_context_manifest_entries
WHEN NOT EXISTS (
  SELECT 1 FROM agent_context_manifests manifest
  WHERE manifest.id = NEW.manifest_id AND manifest.project_id = NEW.project_id
    AND NEW.position >= 0 AND NEW.position < manifest.entry_count
) BEGIN SELECT RAISE(ABORT, 'Manifest entry position is outside the sealed canonical entry count'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_manifest_entry_current_approval BEFORE INSERT ON agent_context_manifest_entries
WHEN NOT EXISTS (
  SELECT 1 FROM agent_context_items i
  JOIN agent_context_revisions r
    ON r.id = NEW.revision_id AND r.item_id = i.id AND r.project_id = i.project_id
  WHERE i.id = NEW.item_id AND i.project_id = NEW.project_id
    AND i.approved_revision_id = NEW.revision_id AND i.deleted_at IS NULL
    AND r.origin_class = NEW.kind AND r.reference_id = NEW.reference_id
    AND r.sensitivity = NEW.sensitivity
) BEGIN SELECT RAISE(ABORT, 'Manifest entry must copy the current approved non-deleted revision exactly'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_manifest_pack_policy_binding BEFORE INSERT ON agent_context_manifests
WHEN NOT EXISTS (
  SELECT 1 FROM agent_context_packs pack
  WHERE pack.id = NEW.pack_id AND pack.project_id = NEW.project_id
    AND pack.configuration_id = NEW.configuration_id AND pack.role_id = NEW.role_id
) BEGIN SELECT RAISE(ABORT, 'Manifest policy must match its context pack'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_manifest_approval_binding BEFORE INSERT ON agent_context_manifests
WHEN NEW.transmission_approval_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM agent_context_transmission_approvals approval
  WHERE approval.id = NEW.transmission_approval_id AND approval.project_id = NEW.project_id
    AND approval.manifest_sha256 = NEW.sha256 AND approval.provider = NEW.provider
    AND approval.model = NEW.model AND approval.state = 'approved'
    AND (approval.expires_at IS NULL OR approval.expires_at > NEW.created_at)
) BEGIN SELECT RAISE(ABORT, 'Manifest approval must match project, hash, destination, and live state'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_manifest_restricted_approval BEFORE INSERT ON agent_context_manifest_entries
WHEN NEW.sensitivity = 'restricted' AND NOT EXISTS (
  SELECT 1 FROM agent_context_manifests manifest
  JOIN agent_context_transmission_approvals approval
    ON approval.id = manifest.transmission_approval_id AND approval.project_id = manifest.project_id
  WHERE manifest.id = NEW.manifest_id AND manifest.project_id = NEW.project_id
    AND approval.manifest_sha256 = manifest.sha256 AND approval.provider = manifest.provider
    AND approval.model = manifest.model AND approval.state = 'approved'
    AND (approval.expires_at IS NULL OR approval.expires_at > manifest.created_at)
    AND EXISTS (
      SELECT 1 FROM json_each(approval.restricted_reference_ids_json)
      WHERE value = NEW.reference_id
    )
) BEGIN SELECT RAISE(ABORT, 'Restricted manifest entries require an exact live approval'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_approval_initial_state BEFORE INSERT ON agent_context_transmission_approvals
WHEN NEW.state != 'approved' OR NEW.revoked_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Transmission approvals must begin approved and unrevoked'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_approval_scope_immutable BEFORE UPDATE OF
  id, project_id, manifest_sha256, provider, model, restricted_reference_ids_json,
  actor_id, rationale, expires_at, created_at
ON agent_context_transmission_approvals
BEGIN SELECT RAISE(ABORT, 'Transmission approval scope is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_approval_transition BEFORE UPDATE OF state, revoked_at
ON agent_context_transmission_approvals
WHEN NOT (
  OLD.state = 'approved' AND NEW.state = 'revoked' AND
  OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM agent_context_audit_events audit
    WHERE audit.project_id = OLD.project_id
      AND audit.action = 'context.transmission_approval_revoked'
      AND json_extract(audit.metadata_json, '$.approvalId') = OLD.id
      AND audit.created_at = NEW.revoked_at
  )
)
BEGIN SELECT RAISE(ABORT, 'Transmission approval may only make an audited approved-to-revoked transition'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_approval_immutable_delete BEFORE DELETE ON agent_context_transmission_approvals
WHEN EXISTS (SELECT 1 FROM projects WHERE id = OLD.project_id)
BEGIN SELECT RAISE(ABORT, 'Transmission approvals cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_manifest_seal BEFORE INSERT ON agent_context_audit_events
WHEN NEW.action = 'context.manifest_persisted' AND NOT EXISTS (
  SELECT 1 FROM agent_context_manifests manifest
  WHERE manifest.id = NEW.manifest_id AND manifest.project_id = NEW.project_id
    AND (SELECT COUNT(*) FROM agent_context_manifest_entries entry
         WHERE entry.manifest_id = manifest.id AND entry.project_id = manifest.project_id) = manifest.entry_count
)
BEGIN SELECT RAISE(ABORT, 'Manifest cannot be sealed until every canonical child row is durable'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_revisions_immutable_update BEFORE UPDATE ON agent_context_revisions BEGIN SELECT RAISE(ABORT, 'Agent context revisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_revisions_immutable_delete BEFORE DELETE ON agent_context_revisions BEGIN SELECT RAISE(ABORT, 'Agent context revisions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_manifests_immutable_update BEFORE UPDATE ON agent_context_manifests BEGIN SELECT RAISE(ABORT, 'Agent context manifests are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_manifests_immutable_delete BEFORE DELETE ON agent_context_manifests BEGIN SELECT RAISE(ABORT, 'Agent context manifests are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_manifest_entries_immutable_update BEFORE UPDATE ON agent_context_manifest_entries BEGIN SELECT RAISE(ABORT, 'Agent context manifest entries are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_manifest_entries_immutable_delete BEFORE DELETE ON agent_context_manifest_entries BEGIN SELECT RAISE(ABORT, 'Agent context manifest entries are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_audit_immutable_update BEFORE UPDATE ON agent_context_audit_events BEGIN SELECT RAISE(ABORT, 'Agent context audit events are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER agent_context_audit_immutable_delete BEFORE DELETE ON agent_context_audit_events BEGIN SELECT RAISE(ABORT, 'Agent context audit events are immutable'); END;
