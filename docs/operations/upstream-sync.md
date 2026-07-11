# Dream upstream synchronization

## Routine

1. Fetch `upstream` and review commits since the last recorded sync.
2. Create `chore/RID-<issue>-sync-dream-upstream` from `main`.
3. Merge or rebase the selected upstream range; do not mix product features with the sync.
4. Resolve conflicts by preserving isolated research modules and adapting only their documented registration seams.
5. Run lint, typecheck, build, test suite, packaged-app smoke test, and a manual review of preload, process sessions, API guard, Git/worktree, persistence, and packaging changes.
6. Record upstream revision, conflicts, and follow-ups in the linked Linear issue and release notes.

## Release cadence

Use semantic versions through internal development, alpha, private beta, public beta, and stable. Maintain changelog, migration notes, known issues, rollback instructions, signed/tagged GitHub releases, and package-installer validation.
