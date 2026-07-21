# Local research storage

## Boundary and location

Cly's local service owns the research database. In a packaged desktop build it
is SQLite at Electron's `userData/dream.db`; the retained `dream.db` filename
is a compatibility detail, not an editor-workspace dependency. Development and
tests may set `DREAM_DB_PATH` to an absolute path. The database is never
created in, copied from, or coupled to a project directory, a Git worktree, or
the embedded coding workspace.

The database contains app configuration, project registrations, chats, and the
research graph. Project directories hold user code and artifacts only. Large
research artifacts stay on disk and are referenced by identifier/hash rather
than copied into SQLite.

## Project isolation and provenance

Every research object, relationship, and provenance event has a required
`project_id`. SQLite foreign keys are enabled for every connection. Cascades
remove dependent graph rows when a project is removed. Relationship triggers
reject inserts or updates whose source or target belongs to another project.
Provenance triggers likewise require every referenced object to belong to the
event's project. These constraints cover writes that bypass the repository. The
repository also validates relationships before writing and records provenance
for object and relationship creation.

Static notebook imports additionally persist bounded evidence and an explicit
verification state on every inferred relationship. Notebook object and edge
identities are deterministic, so unchanged re-imports do not duplicate the
graph; changed inferred records return to an unverified review state.

Run input fingerprints include code-symbol, dataset, configuration,
environment, and dependency snapshots. `research_object_staleness` stores the
latest project-scoped assessment for a run, artifact, or claim, while
`research_object_staleness_transitions` is immutable history linked to the
append-only provenance chain. Repeating an identical assessment updates its
check time without creating a duplicate transition.

No API accepts a filesystem path as research identity. The local service uses a
registered project ID; filesystem access, when later introduced, must validate
that project ID before resolving a path.

## Migrations and recovery

Drizzle SQL migrations are append-only and run inside one SQLite transaction.
Before any pending migration is applied, Cly uses SQLite `VACUUM INTO` to write
a consistent, standalone snapshot next to the database:

```
dream.db.pre-migration-YYYY-MM-DDTHH-MM-SS-mmmZ.sqlite
```

This works in WAL mode; copying only `dream.db` would not reliably capture
committed WAL pages. A failed migration rolls back its transaction and is not
marked applied. Migrations do not attempt a down migration. Recovery is:

1. Quit Cly so no process has the database open.
2. Preserve the failed database for diagnosis.
3. Replace it with the pre-migration snapshot, keeping the original filename
   (`dream.db`).
4. Relaunch the prior compatible Cly version, or fix and re-run the forward
   migration.

Never edit `__drizzle_migrations` to simulate a rollback. New schema changes
need a new forward migration and a matching review of their recovery behavior.

## Backup, export, and deletion policy

The pre-migration snapshot is an automatic safety backup, not a retention
system. User-facing backups should use a SQLite-consistent export (the same
`VACUUM INTO` mechanism), write to a user-selected location outside the project
directory, and be restore-tested before a destructive operation.

Research export must be project-scoped and include research objects,
relationships, provenance events, schema version, and export timestamp. It
must not include data from any other project, project files, credentials, or
agent logs. Imports must validate IDs and relationship ownership before any
write, then append provenance for the import.

Project deletion is a database lifecycle operation, not deletion of a coding
workspace. Before a future delete endpoint is exposed it must create or require
a verified backup/export, delete by project ID in one transaction, confirm the
cascade removed that project's graph/provenance rows, and leave other projects
unchanged. The current local service exposes no delete endpoint.

## Test checklist

- Set `DREAM_DB_PATH` to a temporary database, create two projects, then prove
  a cross-project relationship is rejected both through the repository and by
  direct SQL.
- Open a database with a pending migration and verify a
  `.pre-migration-*.sqlite` snapshot exists and can be opened independently.
- Force a migration failure in a temporary copy and verify the schema and
  migration journal are unchanged after rollback.
- Export one project and assert the result contains only that project's graph
  and provenance. Restore it into a temporary database and query it.
- Change a captured function hash and assert deterministic propagation from
  its run through figures/tables to claims, then restore the captured hash and
  assert persisted stale-to-current transitions after a database reopen.
- Change a generated artifact hash and omit generator/code hashes to verify
  manual-edit and incomplete-provenance findings.
- Delete a temporary project only after exporting it; assert its cascaded rows
  are gone and a second project's rows remain.
