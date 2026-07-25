# Provider credential audit

Date: 2026-07-12  
Scope: the local Electron API adapters for Codex, Claude Code, OpenCode, and
Cursor. This is a source audit, not an assertion about a user's installed CLI
or its operating-system configuration.

## Result

The chat integrations delegate provider authentication to their CLIs. Cly does
not read Claude Code credentials. Codex model discovery still reads Codex's
local authentication cache, so that adapter must not be reused as the
research-agent credential boundary in ADR 0002.

| Provider | Current credential path | OS credential store verified? | Finding / required migration |
| --- | --- | --- | --- |
| Codex | `~/.codex/auth.json` is read by `electron/api/providers/codex-auth.js` for access tokens and model cache. | No | Do not reuse this file for research execution. Invoke authenticated Codex CLI or migrate Cly-owned integration credentials to `CredentialStore`. |
| Claude Code | Authentication and credentials remain entirely owned by the Claude Code CLI. Cly checks the CLI's supported authentication status and does not read Keychain entries or Claude credential files. | Delegated to provider CLI | Keep authentication delegated to Claude Code. Do not add credential extraction, refresh, migration, or persistence to Cly. |
| OpenCode | No Cly credential file reads found. The adapter starts the OpenCode server/CLI, which owns authentication. | Not verified | Keep authentication delegated to OpenCode. Require an explicit provider capability/status check before enabling research execution. |
| Cursor | No Cly credential file reads found. The adapter invokes the Cursor Agent CLI, which owns authentication. | Not verified | Keep authentication delegated to Cursor. Do not add credential extraction; research execution remains plan-only until action interception is available. |

## Evidence

- `electron/api/providers/codex-auth.js` reads `~/.codex/auth.json` and returns
  its access token to local API code.
- `electron/api/providers/usage-limits.js` records only local session usage
  observed by Cly. Claude Code does not expose usage windows through a
  supported local interface, so Cly does not inspect or refresh Claude-owned
  credentials to synthesize those limits.
- `electron/api/chat-routes.js` validates provider availability and dispatches
  directly to provider-specific streaming functions. It has no
  provider-neutral research-run or credential-store boundary.
- `electron/api/chat/cursor-stream.js` and
  `electron/api/chat/opencode-stream.js` delegate to their respective CLIs;
  neither contains an explicit Cly credential path.

## Required gates before enabling research execution

1. Implement the main-process-only `CredentialStore` from ADR 0002 and add
   platform tests/mocks for its `get`, `put`, and `delete` operations.
2. Ensure research-run schemas reject credential-like fields and provenance
   serialization redacts secret values.
3. Migrate each enabled adapter to Cly's normalized approval event and add a
   test proving denial, cancellation, and disconnect deny the action.
4. Run secret scanning over the packaged application and verify no credential
   values appear in SQLite, logs, project files, renderer state, or agent
   context.
5. Require an authenticated provider capability check without extracting the
   provider's credentials. A failed check disables that provider for research
   execution.
