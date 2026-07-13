# Security Assessment

## Existing strengths

- Electron windows use `contextIsolation: true` and `nodeIntegration: false` in `electron/main.js`.
- The preload bridge exports named operations rather than raw `ipcRenderer`.
- The sandboxed renderer receives no production API token; the loopback proxy
  injects a per-process token and the API validates Host, Origin, body size,
  concurrency, and time bounds.
- Git and CLI helpers generally use argument arrays instead of shell command strings.
- Agent adapters expose explicit permission modes and Codex sandbox policies.

## Priority risks

1. Terminal and agent capabilities can execute arbitrary project commands. Cly needs a single approval/audit policy above provider-specific modes.
2. Imported papers, webpages, notebooks, and tool output are prompt-injection inputs. They need provenance labels and an untrusted-content boundary.
3. External URLs and file save/open operations must retain scheme/path allowlists and project scoping.
4. Research datasets and outputs can be large, private, regulated, or identifying. Default Git ignores are only a safety net, not an access-control system.
5. Provider credential paths are inconsistent. All new Cly secrets must use the operating-system credential store.

## Required pre-beta gates

- Threat model the Electron main/preload/IPC and embedded-terminal boundaries;
  these are outside the local-service security model.
- Implement and verify the applicable P0 findings in the
  [local service security model](../LOCAL_SERVICE_SECURITY_MODEL.md).
- Add tests for IPC/API schema rejection and project isolation.
- Add command approval and immutable provenance events.
- Add dependency, secret, and release-artifact scanning.
- Sign and notarize distributed binaries.
- Document data deletion, export, backup, and credential revocation.
