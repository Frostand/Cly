# Cly Defensive Security Audit

Audit date: 2026-07-27

Baseline: `origin/main` at `88ae0387ab7756edc9be14bcf0b673b71e5451a1`

Target: OWASP ASVS 5.0 Level 2, adapted to a local-first Electron desktop
application

This is a time-bounded defensive review of the repository and locally fetched
Git history. It is not a certification and does not claim that Cly is secure or
vulnerability-free.

## Scope and method

The review covered the Electron main/preload/renderer boundaries, loopback
HTTP service, project and worktree authority, agent/tool approval and durable
effects, provider authentication bridges, device sync and key storage,
untrusted content rendering, PDF/network retrieval, update/release paths,
dependency graph, CI/repository controls, and current/fetched-history secret
patterns.

The review used code-path inspection, trust-boundary and data-flow modeling,
authorization-matrix construction, adversarial test design, targeted
regressions, the full Vitest suite, TypeScript and Biome checks, production
dependency audit/license checks, repository privacy/capability checks, and a
local production package build. The associated architecture, matrix, threat
model, and remediation log are in this directory.

## Product-truth summary

Cly is a local-first Electron application. It has no first-party account,
password, email verification, password recovery, invitation, tenant, role,
cookie session, or OAuth callback service in this repository. Those web/SaaS
ASVS controls are **not implemented / not applicable to this product state**,
not controls that were tested and passed. The effective principal is the local
OS user, narrowed by renderer role/session, registered project capability,
tool policy/approval, and optional paired-device trust.

Provider login is delegated to installed provider tools. The Codex cache is
read by main-process provider code. Provider tokens are not Cly identities.

## Findings

| ID | Severity | Status | Finding | Security effect |
| --- | --- | --- | --- | --- |
| SEC-001 | High | Fixed | Durable approval scope omitted the execution `requestId`. | A distinct execution request with otherwise identical tool-call fields could attempt to reuse an approval. Scope now binds the request ID and fails closed when absent or mismatched. |
| SEC-002 | High | Fixed | Windows editor launch could cross `cmd.exe`/batch command interpretation with a project path selected from local project state. | Editor launch now uses direct process spawning with `shell: false`; `.cmd`/`.bat` shims are rejected, and the canonical project root is passed as `cwd`/one argument. |
| SEC-003 | Medium | Fixed | The loopback API bearer token was placed in Chromium arguments and exposed on the preload API. | The token remains in the main process. A session request hook strips renderer-supplied token headers and injects the real token only for the exact renderer origin and `/api/*` path. |
| SEC-004 | Medium | Fixed | Several privileged IPC methods did not consistently validate top-level sender, current renderer origin, window role, and workspace session. | Shared main-process checks now protect workspace/window/theme/shell/clipboard/save/editor/provider/browser/updater operations, with workspace calls bound to their session. |
| SEC-005 | Low | Fixed | External URLs were accepted by a prefix regular expression. | External navigation now uses parsed, credential-free HTTP(S) URLs and rejects control/bidirectional characters and non-HTTP schemes. |
| SEC-006 | Medium | Partially fixed | Shipped dependency lines included current Hono, node-server, Mermaid, DOMPurify, brace-expansion, and tar advisories. | Direct/runtime-reachable lines were upgraded or overridden. Two upstream/transitive audit findings remain and are described below. |
| SEC-007 | Low | Fixed | The production package contained tests, dependency TypeScript/source maps, node-pty build files, and unused macOS privacy descriptions. | Narrow package filters and post-pack pruning now remove non-runtime sources/build files and the five unused privacy keys; the packaged-content gate passes. |

No additional confirmed exploitable issue was changed. Suspected or
configuration-dependent conditions are listed as residual risks rather than
being presented as fixed vulnerabilities.

## ASVS-oriented review result

| Area | Result and evidence |
| --- | --- |
| Architecture and threat modeling | Trust boundaries, data flows, high-risk entry points, and actors recorded in `SECURITY_ARCHITECTURE.md` and `THREAT_MODEL.md`. |
| Authentication | No first-party login/recovery/email flow. Local launch token is random per process and is no longer renderer-readable. Provider auth is delegated. |
| Session management | No browser-cookie user session. Renderer authority is bound to live `webContents`, exact renderer origin, role, and optional Cly Dev session. |
| Access control | Project authority is resolved server-side; file/Git paths are canonicalized and contained; agent policy is default-deny; approval and effect records are durable and exact-scope. |
| Input validation | Route schemas, bounded payloads, control-character/path checks, terminal limits, and strict parsed external URLs were inspected and exercised. |
| Stored cryptography | Device private keys use Electron `safeStorage`, reject plaintext fallback, use restrictive modes and atomic persistence. No custom encryption primitive was introduced by this remediation. |
| Error handling/logging | Tool/audit output is bounded and secret bodies are excluded. Logs and error paths were checked for credential propagation; provider/cache metadata remains operationally sensitive. |
| Data protection | Local state remains readable to the same OS user. Private research and credentials must not be committed. Same-user malware is outside this application's trust boundary. |
| Communication | Production services bind loopback. Host/Origin/token checks protect the local API. External PDF retrieval includes SSRF/redirect/size controls. |
| Malicious code/content | Sandboxed renderer/webview, CSP, sanitization, bounded parsing, tool policy, native approvals, and provider/MCP distrust were reviewed. Embedded web content remains untrusted. |
| Business logic | Revisions, idempotency, request-bound approval, execute-once effect records, replay checks, and device revocation were inspected. |
| Files/resources | Registered roots/worktrees, realpath containment, symlink checks, upload/import bounds, and notebook `O_NOFOLLOW` behavior were inspected. |
| API/web service | Loopback API rejects invalid Host/Origin/token and applies request size, concurrency, and timeout limits. Project authorization is additional to possession of the token. |
| Configuration | Electron sandbox/context isolation/no Node integration, build-script allowlist, lockfile, CSP, updater feed rules, workflows, and security policy were reviewed. Repository-host settings still require action before public visibility. |

## Secret and history review

- `gitleaks` and `trufflehog` were not installed, so the review used targeted
  high-confidence patterns across current tracked content and every locally
  fetched ref, plus filename checks for `.env`, private-key, credential, and
  keystore artifacts.
- The only pattern matches were intentionally fake tokens/key markers in three
  redaction/security test fixtures. The AWS value uses the documented `EXAMPLE`
  form; GitHub/Slack/key markers are synthetic test inputs.
- No tracked secret-like filename was found. No confirmed live credential was
  found in the locally available history.
- This does not replace GitHub secret scanning and push protection after the
  repository becomes public, nor does it cover remote refs that were never
  fetched locally.

## Verification results

| Command | Result |
| --- | --- |
| Focused security Vitest set (8 files) | 102 passed |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed; 689 files checked |
| `pnpm licenses:check` | Passed; 120 production packages |
| `pnpm privacy:check` | Passed; 950 tracked/trackable files checked |
| `pnpm capabilities:check` | Passed; 27 capabilities |
| `pnpm companion-contract:check` | Passed; 23 clauses |
| `pnpm test` | 960 passed, 13 failed across 973 tests |
| Four loopback tests rerun with local bind permission | 23 passed |
| Three pre-existing UI suites rerun alone | 14 passed, 9 failed |
| `pnpm package:dir` | Passed; produced an unsigned macOS arm64 app directory |
| `pnpm package:verify:contents` | Passed; 7,289 ASAR entries and 35 unpacked files checked |
| `pnpm audit --prod --json` | 0 critical, 0 high, 1 moderate, 1 low residual |

The nine remaining UI failures are in `app-shell.test.tsx`,
`literature-workspace.test.tsx`, and `code-linker-screen.test.tsx`; they
reproduce independently as hydration/timing/stale accessible-copy assertions
and do not exercise the remediated security paths. They remain release-quality
debt and are not reclassified as passing.

## Residual and unresolved risk

1. `@hono/node-server@1.19.14` remains transitively pinned through the
   Anthropic agent SDK/MCP SDK. The advisory concerns the package's Windows
   `serve-static` middleware. Cly does not import that transitive middleware;
   forcing the 2.x API into an upstream 1.x dependency was not judged safe.
2. Optional `@babel/core@7.29.0` arrives through
   `next-intl -> next -> styled-jsx`. The audit registry lists a fix at 7.29.1,
   but that version was not published at audit time. Cly does not compile
   untrusted source with this optional runtime path.
3. Older brace-expansion lines used by build tooling remain on their compatible
   patched 1.x/2.x releases. The current 5.x line is patched. Build inputs must
   remain trusted.
4. The local macOS package is unsigned and not notarized. There is no verified
   public `.dmg`/Windows/Linux installer in this audit. Public distribution
   requires signing, notarization, immutable artifacts, and provenance.
5. Same-user malware can read local files, provider caches, process memory, and
   IPC at the OS level. The loopback token is not a defense against a
   compromised OS account.
6. Provider logout/revocation, cache permissions, and provider-side retention
   remain provider-specific operational controls.
7. GitHub code/secret scanning, push protection, branch rules, Dependabot
   rescans, issue/PR content, forks, tags, releases, and workflow permissions
   must be rechecked at public-visibility action time.

## Release decision

The confirmed application findings above have targeted fixes and passing
regressions. The repository should not be described as audited secure or
vulnerability-free. Public visibility remains a separate, irreversible-exposure
decision and should happen only after reviewing the residual list, repository
settings, full history, branches, tags, issues, and release artifacts.
