# Forking and Upgrade Strategy

Cly is a private standalone repository because GitHub requires forks of public repositories to remain public. The complete Dream history is preserved, `origin` points to Cly, and `upstream` points to Dream.

## Merge policy

- Sync Dream only through dedicated `codex/sync-dream-YYYY-MM-DD` branches.
- Never squash upstream history.
- Resolve identity, updater, migration, and navigation conflicts explicitly.
- Run the complete quality suite and package an unpacked app after every upstream merge.
- Record difficult recurring conflicts as architecture debt and introduce a smaller adapter seam in a separate pull request.

## Release policy

Cly versions are independent from Dream versions. An upstream merge does not automatically create a Cly release. Release notes should record the Dream commit incorporated and identify any inherited security fixes.

