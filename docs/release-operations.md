# Cly release operations

## Ownership and environments

Production releases run only from a pushed version tag through the protected
`production-release` GitHub environment. There is no manual-dispatch production
path. The workflow rejects any tag other than exactly `v${package.json.version}`.
The workflow fetches `origin/main` and rejects a tag whose exact commit is not
reachable from it; the environment also requires at least one approving
reviewer. A protected self-hosted macOS runner with a pre-authenticated Claude
Code CLI runs the real provider smoke. Its authentication remains on that
runner and is never supplied as a workflow secret or test fixture. That
unpackaged test harness may bypass Electron's native command dialog only with
both explicit smoke flags; packaged applications always retain that dialog and
the same main-process project-authority check remains in force.
Release owners are responsible for CI acceptance, signing identities, the Cly
update bucket, post-upload verification, staged rollout, and incident records.

Linux packages are supported for AppImage, Debian, and RPM installations. They
are hashed and published through the same immutable manifest, but platform
package signing is not represented as equivalent to macOS notarization or
Windows Authenticode.

## Required GitHub environment secrets

Configure `CLY_UPDATE_FEED_URL`, `CLY_R2_BUCKET`, and `CLY_R2_ENDPOINT` as
protected environment variables. Configure R2 access keys, Apple signing and
notary credentials, the macOS certificate, and SSL.com Windows signing
credentials as protected secrets. The Windows signing runner must expose the
approved SSL.com CodeSignTool path through `SSL_COM_CODESIGNTOOL` and must not
be a general-purpose runner.

Never place credentials in repository files, build artifacts, release notes,
provider configuration, or logs. The update bucket is publicly readable only
through Cly's download domain; write credentials exist only in the protected
release environment.

## One-time R2 setup

Create a private bucket with a public, HTTPS, read-only download domain. Grant
the release service account permission to write immutable files beneath
`versions/<version-tag>/` and the three mutable metadata keys (`latest.yml`,
`latest-mac.yml`, and `latest-linux.yml`). Deny public listing and mutation.
Enable bucket audit logs and retain immutable version prefixes for the supported
rollback window. Updater metadata always points at its immutable version prefix;
it never points at a mutable root-level binary.

## Release procedure

1. Merge only after CI, migration/recovery, accessibility, and the production
   evidence-loop tests pass with test fixtures disabled. The release workflow reruns
   lint, type checking, tests, capability checks, dependency audits, production
   license policy, a secret scan, and a real authenticated Claude provider run
   against the exact tagged commit.
2. Update `package.json`, release notes, and the capability inventory; create a
   signed `v<package-version>` tag from `main`.
3. Approve the `production-release` environment. The workflow builds and
   verifies notarized macOS artifacts, Authenticode-signed Windows installers,
   and supported Linux packages. Each platform launches the packaged executable
   with a clean profile, verifies production UI renders without fixture controls,
   and runs the complete claim-to-computation acceptance loop.
4. The publish job validates every updater URL, SHA-512, and byte size; creates
   `release-manifest.json` and `SHA256SUMS`; uploads every file beneath the
   immutable version-tag prefix; then downloads and verifies every public file.
5. Only after immutable verification succeeds, create the GitHub release and
   replace each root `latest*.yml` object. Each object replacement is atomic,
   although the three platform keys are not a single transactional operation.
   The workflow downloads all three promoted keys and verifies them byte for
   byte before succeeding.
6. Before widening rollout, install each public installer on a clean supported
   machine. Complete guided setup, import a real repository, restart at the
   recorded checkpoints, run the claim-to-computation loop, verify a reviewer
   capsule, and test update retention.

## Artifact acceptance checklist

- The exact tag equals `v${package.json.version}`.
- The tagged commit is an ancestor of `origin/main`.
- Release acceptance, dependency audits, production-license policy, secret scan,
  capability checks, and the protected authenticated Claude provider smoke
  passed for the tagged commit.
- macOS passes `codesign`, Gatekeeper assessment, and stapler validation.
- Windows app and installer report a valid Authenticode signature.
- Every file beneath the public immutable prefix matches its protected local
  SHA-256 and byte size; public `SHA256SUMS` is part of that verification.
- Update metadata contains only configured HTTPS Cly URLs beneath the exact
  version-tag prefix, and each referenced artifact matches its SHA-512 and size.
- Production packages expose no fixture selector, simulated records,
  development endpoint, project content, credential, or test token.
- Clean-install, update, backup, diagnostics, migration-failure recovery, and
  rollback drills have an attached operator evidence record before rollout is
  widened.

Each platform release job launches its signed/notarized or packaged executable
from the build output with a new user-data directory and runs the same full
fresh-profile claim-to-computation loop used by source acceptance. The test
completes onboarding, imports a real Git-backed notebook, records and invalidates
provenance, repairs and reruns the computation, restarts the packaged app,
verifies durable state and a reviewer capsule, and starts a production Cly Dev
session contract. Publication cannot proceed unless that packaged-binary loop
passes on macOS, Windows, and Linux.

This automated packaged-binary acceptance does not prove DMG mounting, NSIS
install and uninstall, Debian/RPM package-manager registration, OS upgrade
behavior, or rollback on a clean machine. Those remain explicit operator
acceptance steps before rollout is widened.

## Rollback procedure

Identify the last good version and retrieve its immutable manifest. Verify all
artifact hashes, then copy that version's immutable `latest*.yml` files back to
the three mutable feed keys. Each key replacement is atomic; keep rollout closed
until all three public keys are downloaded and match the selected immutable
copies. Download the versioned artifacts and verify them again before reopening
rollout. Do not delete immutable evidence. Disable a bad GitHub release only when
incident policy requires it, preserve logs/artifacts, publish a status or
security notice, and issue a new corrective version rather than reusing a tag.

Local research data remains in the user data directory during an application
rollback. Restore a pre-migration SQLite backup only after preserving the
failed database and diagnostics bundle; never overwrite the sole copy.

## Incident evidence

Retain the tag and commit, workflow run, approver, manifests, public verification
output, signing/notary logs, clean-install and update results, migration backup
path, diagnostics bundle, rollout window, rollback decision, and corrective
issue. Diagnostics must exclude source bodies, dataset contents, environment
values, provider credentials, and raw conversations.
