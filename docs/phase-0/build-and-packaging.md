# Build and Packaging Guide

## Local validation

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test --run
pnpm vite:build
```

## Development and unpacked build

```bash
pnpm dev
pnpm package:dir
```

Local development packages intentionally omit `app-update.yml` when
`CLY_UPDATE_FEED_URL` is unset. CI/release packaging still requires the
explicit Cly feed and fails closed when it is missing.

Platform packages are produced with `pnpm package:mac`, `pnpm package:win`, or `pnpm package:linux` and written to `release/`.

## Identity and publishing

The application ID is `ai.cly.cly`, product/executable name is `Cly`, and electron-builder publishes only to `Frostand/Cly`. Update checks have no Dream feed fallback. Development update testing requires both `CLY_ENABLE_DEV_UPDATES=1` and an explicit `CLY_UPDATE_FEED_URL`.

Unsigned artifacts are development-only. Public or external distribution requires Cly-owned Apple and Windows signing identities, notarization credentials, protected GitHub environments, and a verified update feed.
