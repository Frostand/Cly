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

Packages use electron-builder's GitHub Releases updater configuration by
default. Set `CLY_UPDATE_FEED_URL` only when a Cly-owned generic update mirror
should override GitHub Releases. Packaging never requires a private feed URL.

Platform packages are produced with `pnpm package:mac`, `pnpm package:win`, or `pnpm package:linux` and written to `release/`.

## Identity and publishing

The application ID is `ai.cly.cly`, product/executable name is `Cly`, and
electron-builder publishes only to `Frostand/Cly`. Update checks have no Dream
feed fallback. Development update testing requires both
`CLY_ENABLE_DEV_UPDATES=1` and an explicit `CLY_UPDATE_FEED_URL`.

The open beta currently distributes unsigned artifacts. macOS testers may need
to Control-click the app and choose **Open** on first launch.

## Free beta release gate

The `Cly Release` workflow is the supported beta distribution path. A version
tag, or a manual dispatch matching `package.json`, runs the toolchain doctor,
lint, type checks, capability and license checks, unit tests, the Electron E2E
suite, and a production build. It then creates unsigned macOS arm64/x64,
Windows x64, and Linux x64 installers with update metadata and SHA-256 checksums
and attaches them to the GitHub Release.

No private signing or update-feed secrets are required for this beta workflow.
`CLY_UPDATE_FEED_URL` remains an optional build-time override for a future
Cly-owned generic mirror.
