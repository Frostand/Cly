# Synchronizing Dream Upstream

The repository intentionally uses two remotes:

```text
origin    git@github.com:Frostand/Cly.git
upstream  https://github.com/dreamide/dream.git
```

Keep upstream synchronization separate from Cly feature work:

```bash
git fetch upstream --tags
git switch main
git pull --ff-only origin main
git switch -c codex/sync-dream-YYYY-MM-DD
git merge --no-ff upstream/main
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test --run
pnpm vite:build
git push -u origin codex/sync-dream-YYYY-MM-DD
```

Open a dedicated pull request containing only the upstream merge and conflict resolutions. Never mix product features into this pull request. Confirm that Cly identity, update settings, research migrations, and CI remain intact before merging.

Do not push to `upstream`. Cly contributions intended for Dream should be prepared on a separate public fork or patch branch after removing Cly-private material.

