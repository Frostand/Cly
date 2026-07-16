CREATE TABLE IF NOT EXISTS cly_dev_devices (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  trust_state TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  current_key_version INTEGER NOT NULL,
  registered_at TEXT NOT NULL,
  verified_at TEXT,
  revoked_at TEXT,
  revocation_reason TEXT,
  last_seen_at TEXT,
  CHECK(kind IN ('local','peer')),
  CHECK(trust_state IN ('pending','trusted','revoked')),
  CHECK(current_key_version >= 1),
  CHECK((trust_state = 'pending' AND verified_at IS NULL AND revoked_at IS NULL)
     OR (trust_state = 'trusted' AND verified_at IS NOT NULL AND revoked_at IS NULL)
     OR (trust_state = 'revoked' AND revoked_at IS NOT NULL)),
  UNIQUE(fingerprint)
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_cly_dev_devices_one_local ON cly_dev_devices(kind) WHERE kind = 'local';
--> statement-breakpoint
CREATE INDEX idx_cly_dev_devices_trust ON cly_dev_devices(trust_state, name);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cly_dev_device_keys (
  device_id TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  encryption_public_key TEXT NOT NULL,
  signing_public_key TEXT NOT NULL,
  private_key_ref TEXT,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  retired_at TEXT,
  PRIMARY KEY(device_id, key_version),
  FOREIGN KEY(device_id) REFERENCES cly_dev_devices(id) ON DELETE cascade,
  CHECK(key_version >= 1),
  CHECK(state IN ('active','retired','revoked')),
  CHECK((state = 'active' AND retired_at IS NULL) OR state != 'active')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cly_dev_sync_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  recipient_device_id TEXT NOT NULL,
  recipient_key_version INTEGER NOT NULL,
  envelope_id TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  base_revision INTEGER NOT NULL,
  envelope_json TEXT NOT NULL,
  envelope_sha256 TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  acked_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE cascade,
  FOREIGN KEY(recipient_device_id, recipient_key_version)
    REFERENCES cly_dev_device_keys(device_id, key_version),
  CHECK(json_valid(envelope_json)),
  CHECK(length(envelope_sha256) = 64),
  CHECK(revision >= 1 AND base_revision >= 0 AND byte_size > 0 AND attempt_count >= 0),
  CHECK(status IN ('pending','acked','failed','policy_blocked')),
  UNIQUE(project_id, recipient_device_id, envelope_id)
);
--> statement-breakpoint
CREATE INDEX idx_cly_dev_sync_outbox_delivery ON cly_dev_sync_outbox(project_id, recipient_device_id, status, next_attempt_at, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cly_dev_sync_inbox (
  envelope_id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  recipient_device_id TEXT NOT NULL,
  sender_device_id TEXT NOT NULL,
  sender_key_version INTEGER NOT NULL,
  record_kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  base_revision INTEGER NOT NULL,
  envelope_json TEXT NOT NULL,
  envelope_sha256 TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  status TEXT NOT NULL,
  received_at TEXT NOT NULL,
  applied_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE cascade,
  FOREIGN KEY(recipient_device_id) REFERENCES cly_dev_devices(id),
  FOREIGN KEY(sender_device_id, sender_key_version)
    REFERENCES cly_dev_device_keys(device_id, key_version),
  CHECK(json_valid(envelope_json)),
  CHECK(length(envelope_sha256) = 64),
  CHECK(revision >= 1 AND base_revision >= 0 AND byte_size > 0),
  CHECK(status IN ('applied','conflict','rejected'))
);
--> statement-breakpoint
CREATE INDEX idx_cly_dev_sync_inbox_project_received ON cly_dev_sync_inbox(project_id, received_at, envelope_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cly_dev_sync_heads (
  project_id TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  source_device_id TEXT NOT NULL,
  envelope_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id, record_kind, record_id),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE cascade,
  FOREIGN KEY(source_device_id) REFERENCES cly_dev_devices(id),
  FOREIGN KEY(envelope_id) REFERENCES cly_dev_sync_inbox(envelope_id),
  CHECK(revision >= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cly_dev_sync_conflicts (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  local_revision INTEGER NOT NULL,
  incoming_revision INTEGER NOT NULL,
  local_envelope_id TEXT NOT NULL,
  incoming_envelope_id TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE cascade,
  FOREIGN KEY(local_envelope_id) REFERENCES cly_dev_sync_inbox(envelope_id),
  FOREIGN KEY(incoming_envelope_id) REFERENCES cly_dev_sync_inbox(envelope_id),
  CHECK(local_revision >= 1 AND incoming_revision >= 1),
  CHECK(state IN ('pending','keep_local','use_incoming')),
  UNIQUE(project_id, incoming_envelope_id)
);
--> statement-breakpoint
CREATE INDEX idx_cly_dev_sync_conflicts_project_state ON cly_dev_sync_conflicts(project_id, state, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cly_dev_sync_cursors (
  project_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  cursor TEXT NOT NULL,
  last_sync_at TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id, device_id, direction),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE cascade,
  FOREIGN KEY(device_id) REFERENCES cly_dev_devices(id) ON DELETE cascade,
  CHECK(direction IN ('push','pull')),
  CHECK(status IN ('idle','syncing','complete','failed'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS cly_dev_sync_audit (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT,
  action TEXT NOT NULL,
  actor_device_id TEXT,
  subject_device_id TEXT,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE cascade,
  CHECK(json_valid(metadata_json))
);
--> statement-breakpoint
CREATE INDEX idx_cly_dev_sync_audit_created ON cly_dev_sync_audit(created_at, id);
