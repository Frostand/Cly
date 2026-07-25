# Forking and Upgrade Strategy

Cly is an independent open-source repository. `origin` points to Cly, and any
inherited third-party code keeps its original attribution in `NOTICE.md`. A
Dream `upstream` remote is optional and is used only when intentionally
reviewing applicable upstream changes.

## Merge policy

- If a Dream upstream is configured, sync it only through dedicated
  `codex/sync-dream-YYYY-MM-DD` branches.
- Never squash upstream history.
- Resolve identity, updater, migration, and navigation conflicts explicitly.
- Run the complete quality suite and package an unpacked app after every upstream merge.
- Record difficult recurring conflicts as architecture debt and introduce a smaller adapter seam in a separate pull request.

## Release policy

Cly versions are independent from Dream versions. An upstream merge does not automatically create a Cly release. Release notes should record the Dream commit incorporated and identify any inherited security fixes.
