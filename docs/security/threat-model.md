# Security and privacy threat model

## Assets and trust boundaries

Assets include private repositories, local files, datasets, source content, credentials, research graph data, experiment artifacts, and model-provider prompts. Trust boundaries are the local Cly service, its permission-gated integration clients, external providers, external literature sources, GitHub/Linear, and any execution environment.

## Primary threats and baseline controls

| Threat | Required control |
| --- | --- |
| Prompt injection from papers, repositories, or notebooks | Treat content as data; never derive permissions from it; display provenance and require approvals for tools. |
| Private-data transmission | Provider-specific disclosure, project policy, selected-context preview, and approval before remote transmission. |
| Arbitrary command/file action | Dedicated allowlisted executor with explicit approval, scoped working directory, audit event, and no secret access by default. |
| Credential exposure | OS credential storage; redact logs; never persist keys/prompts unnecessarily. |
| Malicious document/parser input | Size/type limits, sandboxed parsing, timeouts, and no executable document content. |
| Provenance or claim corruption | Immutable provenance events, actor/time records, human confirmation for inferred links, and no automatic claim changes. |
| Supply-chain compromise | Locked dependencies, dependency review, CodeQL, secret scanning enabled in GitHub, and license review before new libraries. |

Security review is mandatory before adding a provider, executor, migration, research graph mutation endpoint, or artifact upload path.
