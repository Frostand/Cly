# Cly Desktop Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship signed, notarized, verified Cly desktop releases through a Cly-owned update feed with a documented rollback path.

**Architecture:** GitHub Actions builds each platform only after the existing quality gates pass. A protected `production-release` environment owns signing credentials and the public R2 update-feed credentials; a release manifest records SHA-256 digests for every uploaded file. Publishing is deliberately separate from building: release assets are created first, verified, then mirrored to the Cly feed, so a bad release can be rolled back by republishing prior metadata without changing the application’s updater implementation.

**Tech Stack:** GitHub Actions, Electron Builder, electron-updater generic provider, Cloudflare R2/S3 API, macOS codesign/notarytool, PowerShell Authenticode, Node.js.

## Global Constraints

- Cly releases use `ai.cly.cly`, `Cly`, `Frostand/Cly`, and `CLY_UPDATE_FEED_URL`; do not contact or publish to Dream infrastructure.
- Public artifacts must be signed; macOS artifacts must be notarized and stapled before publication.
- `production-release` must be a GitHub protected environment with required reviewers and no secrets exposed to pull-request workflows.
- The feed URL must point at Cly-owned R2 public storage and must be HTTPS.
- Metadata and artifacts must be SHA-256 verified before they are published.
- A rollback changes feed metadata to a previously verified release; it never deletes release evidence.

---

### Task 1: Add repeatable release-artifact verification

**Files:**
- Create: `scripts/verify-release-artifacts.mjs`
- Create: `scripts/verify-release-artifacts.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: a release directory containing platform artifacts and `latest*.yml` updater metadata.
- Produces: `release-manifest.json` with `{ version, generatedAt, artifacts: [{ name, sha256, size }] }` and exits non-zero if required artifacts or metadata hashes are invalid.

- [ ] **Step 1: Write the failing test**

Create `scripts/verify-release-artifacts.test.mjs` using `node:test`, `node:assert/strict`, and a temporary directory. Write `latest.yml` with a deliberately incorrect `sha512` value and assert that running `node scripts/verify-release-artifacts.mjs <temp-dir> 1.2.3` exits with status `1`. Write a second fixture with an installer, matching base64 SHA-512, and `latest.yml`; assert status `0` and that `release-manifest.json` contains the artifact’s SHA-256.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/verify-release-artifacts.test.mjs`

Expected: FAIL because `scripts/verify-release-artifacts.mjs` does not exist.

- [ ] **Step 3: Implement the verifier**

Create `scripts/verify-release-artifacts.mjs`. Accept exactly `<release-directory> <version>`. Recursively list regular files, excluding `.DS_Store` and the generated manifest. Require at least one `latest*.yml` file and at least one non-metadata artifact. Parse `path:` and each `url:`/`sha512:` pair in updater YAML without external dependencies. For every referenced local basename, calculate `createHash("sha512").update(readFileSync(file)).digest("base64")` and fail if it differs from metadata. Calculate each file’s `sha256` and byte `size`, sort by name, and write:

```json
{
  "version": "1.2.3",
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "artifacts": [
    { "name": "Cly-1.2.3-windows-x64-setup.exe", "sha256": "...", "size": 123 }
  ]
}
```

Use `new Date().toISOString()` for `generatedAt`, reject traversal paths and absolute metadata paths, and emit a clear filename-specific error for every mismatch.

- [ ] **Step 4: Expose the check and run it**

Add this exact script to `package.json`:

```json
"verify:release": "node scripts/verify-release-artifacts.mjs"
```

Run: `node --test scripts/verify-release-artifacts.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/verify-release-artifacts.mjs scripts/verify-release-artifacts.test.mjs
git commit -m "feat: verify desktop release artifacts"
```

### Task 2: Build, sign, verify, and publish releases from protected environments

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `.github/workflows/quality.yml`
- Modify: `package.json`

**Interfaces:**
- Consumes: a pushed `v*.*.*` tag, `production-release` environment secrets, and CLY-owned R2 credentials.
- Produces: signed GitHub release assets plus identical files at `${CLY_UPDATE_FEED_URL}/{latest.yml,latest-mac.yml,latest-linux.yml,artifacts...}`.

- [ ] **Step 1: Add a pull-request quality workflow**

Create `.github/workflows/quality.yml` triggered by `pull_request` and `push` to `main`. Pin permissions to `contents: read`, use Node 22 with pnpm cache, run `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test --run`, and `pnpm vite:build`. Name the required job `quality`.

- [ ] **Step 2: Add the protected release workflow**

Create `.github/workflows/release.yml`, triggered only by tags matching `v*.*.*`, with `contents: write`, `id-token: write`, and `attestations: write`. Validate the tag equals `v${package.json.version}` before packaging. Define a `build-macos` job on `macos-14` and a `build-windows` job on `windows-2022`, both using `environment: production-release`.

For macOS, configure `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, and `CLY_UPDATE_FEED_URL` only from environment secrets; run `pnpm package:mac`, locate the `.app`, run `scripts/notarize-macos-app.sh`, recreate the zip with `ditto -c -k --sequesterRsrc --keepParent`, then run `codesign --verify --deep --strict --verbose=2`, `spctl --assess --type execute --verbose=4`, and `xcrun stapler validate`. Run `scripts/rewrite-update-metadata-urls.mjs` on every mac metadata file and upload the release directory as an artifact.

For Windows, configure `CLY_UPDATE_FEED_URL` from the protected environment and use the repository’s `pnpm package:win:signed` command with the signing-certificate secrets required by that script. Run `Get-AuthenticodeSignature` on every `.exe` and fail unless its status is `Valid`. Rewrite `latest.yml` with `scripts/rewrite-update-metadata-urls.mjs`, then upload the release directory as an artifact.

- [ ] **Step 3: Add the publish gate**

Add a `publish` job that needs both build jobs and also uses `environment: production-release`. Download both artifacts into `release/`, merge per-architecture macOS metadata by invoking:

```bash
shopt -s globstar
node scripts/merge-latest-mac-metadata.mjs release/latest-mac.yml release/**/latest-mac.yml
```

Run `pnpm verify:release release "$VERSION"`, attach `release/release-manifest.json` to the GitHub release, and create the release with `softprops/action-gh-release` using the verified artifacts. Configure the R2 upload action with `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `R2_ENDPOINT`; upload immutable versioned artifacts first, then `latest*.yml` and `release-manifest.json` with `Cache-Control: no-cache, no-store, must-revalidate`. After upload, download every file from `${CLY_UPDATE_FEED_URL}` and compare it to the local SHA-256 before marking the release successful.

- [ ] **Step 4: Validate workflow syntax and scripts**

Run: `pnpm lint && pnpm typecheck && pnpm test --run && node --test scripts/verify-release-artifacts.test.mjs`

Expected: PASS. Review workflow YAML with `actionlint .github/workflows/*.yml` when `actionlint` is installed.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows package.json
git commit -m "ci: add protected desktop release pipeline"
```

### Task 3: Document environment setup, release verification, and rollback

**Files:**
- Create: `docs/release-operations.md`
- Modify: `docs/phase-0/build-and-packaging.md`

**Interfaces:**
- Consumes: the `production-release` environment, artifacts generated by the workflow, and a previously verified release manifest.
- Produces: an operator runbook that allows a release manager to prepare, validate, publish, diagnose, and roll back a release.

- [ ] **Step 1: Write the release runbook**

Create `docs/release-operations.md` with these exact sections: `Ownership and environments`, `Required GitHub environment secrets`, `One-time R2 setup`, `Release procedure`, `Artifact acceptance checklist`, `Rollback procedure`, and `Incident evidence`. State that `production-release` requires at least one reviewer, is restricted to the `main` branch and version tags, and contains `CLY_UPDATE_FEED_URL`, Apple signing/notary secrets, Windows signing secrets, and R2 credentials. State that bucket public access is read-only through the Cly download domain, while write credentials are available only to the protected environment.

Document these acceptance checks: Git tag matches package version; GitHub artifact SHA-256 equals `release-manifest.json`; macOS passes `codesign`, `spctl`, and `stapler validate`; Windows Authenticode is `Valid`; updater metadata uses HTTPS Cly URLs and has matching SHA-512; a clean installed previous version discovers the update; and no Dream host or release coordinate appears in metadata.

Document rollback as: identify the last good release and its manifest; copy its immutable artifacts and `latest*.yml` metadata back to the feed’s mutable metadata keys; download and verify SHA-256 against that manifest; disable/delete the bad GitHub release only if policy requires while preserving artifacts and logs; publish a GitHub security advisory or status notice; and create a corrective version rather than reusing the bad tag.

- [ ] **Step 2: Link the runbook from the build guide**

Append this paragraph to `docs/phase-0/build-and-packaging.md`:

```markdown
Public releases are performed only by the protected GitHub Actions workflow. See [Release operations](../release-operations.md) for required environment configuration, artifact acceptance checks, and the feed-metadata rollback procedure.
```

- [ ] **Step 3: Validate documentation links and working tree**

Run: `rg -n "Dream|dream" docs/release-operations.md .github/workflows/release.yml`

Expected: no output. Then run: `git diff --check`.

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add docs/release-operations.md docs/phase-0/build-and-packaging.md
git commit -m "docs: add desktop release and rollback runbook"
```

## Self-Review

**Spec coverage:** Task 1 supplies tamper-evident artifact verification. Task 2 adds Cly-owned update publishing, signing/notarization gates, protected release environments, and post-upload verification. Task 3 documents setup and deterministic rollback. The plan deliberately does not create actual Apple certificates, Windows certificates, R2 buckets, GitHub environments, or repository protection rules because those are external administrative changes requiring account-owner authority.

**Placeholder scan:** No TBD/TODO markers or unspecified implementation steps are present.

**Type consistency:** The verifier command is consistently `pnpm verify:release <directory> <version>`; its output is consistently `release-manifest.json`; the release feed variable is consistently `CLY_UPDATE_FEED_URL`; the protected environment is consistently `production-release`.
