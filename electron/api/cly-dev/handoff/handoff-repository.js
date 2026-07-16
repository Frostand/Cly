import { randomUUID } from "node:crypto";
import { canonicalJson } from "./canonical-json.js";
import { validateHandoffEnvelope } from "./handoff-schema.js";

const parse = (value) => JSON.parse(value);

const recordFromRow = (row) => ({
  id: row.id,
  projectId: row.project_id,
  direction: row.direction,
  protocol: row.protocol,
  schemaVersion: row.schema_version,
  minimumReaderVersion: row.minimum_reader_version,
  payload: parse(row.canonical_payload_json),
  integrity: {
    algorithm: "sha256",
    canonicalization: "cly-json-v1",
    digest: row.integrity_digest,
  },
  repositoryFingerprint: parse(row.repository_fingerprint_json),
  researchFingerprint: parse(row.research_fingerprint_json),
  inspection: parse(row.inspection_json),
  exportedAt: row.exported_at,
  importedAt: row.imported_at,
  createdAt: row.created_at,
});

export function createClyDevHandoffRepository({
  db,
  now = () => new Date().toISOString(),
}) {
  if (!db) throw new Error("A SQLite database is required.");

  const get = (projectId, handoffId) => {
    const row = db
      .prepare("SELECT * FROM cly_dev_handoffs WHERE id = ? AND project_id = ?")
      .get(handoffId, projectId);
    if (!row) throw new Error("Cly Dev handoff was not found in this project.");
    return recordFromRow(row);
  };

  const insert = (projectId, direction, rawEnvelope, inspection) => {
    const envelope = validateHandoffEnvelope(rawEnvelope);
    const id = randomUUID();
    const createdAt = now();
    db.prepare(
      `INSERT INTO cly_dev_handoffs
       (id, project_id, direction, protocol, schema_version, minimum_reader_version,
        canonical_payload_json, integrity_digest, repository_fingerprint_json,
        research_fingerprint_json, inspection_json, exported_at, imported_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      projectId,
      direction,
      envelope.protocol,
      envelope.schemaVersion,
      envelope.minimumReaderVersion,
      canonicalJson(envelope.payload),
      envelope.integrity.digest,
      canonicalJson(envelope.payload.repository),
      canonicalJson(envelope.payload.research),
      canonicalJson(inspection ?? {}),
      envelope.exportedAt,
      direction === "import" ? createdAt : null,
      createdAt,
    );
    return get(projectId, id);
  };

  return {
    get,
    list(projectId, direction) {
      const rows = direction
        ? db
            .prepare(
              `SELECT * FROM cly_dev_handoffs
               WHERE project_id = ? AND direction = ?
               ORDER BY created_at DESC, id`,
            )
            .all(projectId, direction)
        : db
            .prepare(
              `SELECT * FROM cly_dev_handoffs
               WHERE project_id = ? ORDER BY created_at DESC, id`,
            )
            .all(projectId);
      return rows.map(recordFromRow);
    },
    recordExport(projectId, envelope, inspection = {}) {
      return insert(projectId, "export", envelope, inspection);
    },
    recordImport(projectId, envelope, inspection) {
      const validated = validateHandoffEnvelope(envelope);
      const existing = db
        .prepare(
          `SELECT * FROM cly_dev_handoffs
           WHERE project_id = ? AND direction = 'import' AND integrity_digest = ?`,
        )
        .get(projectId, validated.integrity.digest);
      if (existing) return { record: recordFromRow(existing), duplicate: true };
      return {
        record: insert(projectId, "import", validated, inspection),
        duplicate: false,
      };
    },
    findImportByDigest(projectId, digest) {
      const row = db
        .prepare(
          `SELECT * FROM cly_dev_handoffs
           WHERE project_id = ? AND direction = 'import' AND integrity_digest = ?`,
        )
        .get(projectId, digest);
      return row ? recordFromRow(row) : null;
    },
  };
}
