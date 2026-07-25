<p align="center">
  <img src="./public/icon.png" alt="Cly logo" width="112" height="112" />
</p>

<h1 align="center">Cly</h1>

<p align="center">
  <strong>Local-first research software that carries a question from evidence to an auditable result.</strong>
</p>

<p align="center">
  Research graph · reproducible analysis · coding agents · provenance
</p>

<p align="center">
  <a href="https://github.com/Frostand/Cly/actions/workflows/cly-ci.yml"><img src="https://github.com/Frostand/Cly/actions/workflows/cly-ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Frostand/Cly/releases"><img src="https://img.shields.io/github/v/release/Frostand/Cly?display_name=tag&sort=semver" alt="GitHub release" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0 license" /></a>
  <img src="https://img.shields.io/badge/status-open%20beta-f59e0b" alt="Open beta" />
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#ai-harnesses">AI harnesses</a> ·
  <a href="#development">Development</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a>
</p>

---

Cly combines a scientific system of record with a multi-provider coding workspace. Research questions, sources, hypotheses, experiments, datasets, runs, metrics, claims, and review findings stay connected instead of being scattered across chats and folders.

Cly's research store and deterministic analysis run on the researcher's computer. Cly asks before opening local data and uses the existing authenticated session of an optional AI command-line harness; prompts and approved context sent to a harness are then governed by that provider's account and service terms. Raw analysis rows are not copied into Cly's project database.

## What Cly does

- Guides a project through **Question → Method → Evidence → Analysis → Claims → Review** and identifies the first incomplete gate.
- Imports numeric CSV/TSV data and runs deterministic cross-validated binary classification or regression locally.
- Saves metrics, coefficients, dataset checksums, limitations, generated claims, evidence links, and provenance so a result survives restart.
- Connects sources and experiments to claims in an inspectable research graph.
- Audits reproducibility and integrity before a result is shared.
- Opens real coding projects and streams local agent chats through **Codex, Claude Code, OpenCode, or Cursor**.
- Exports project backups for recovery and review.

## Install

### Desktop builds

Tagged releases produce installers for macOS (Apple Silicon and Intel), Windows x64, and Linux x64 on the [Releases page](https://github.com/Frostand/Cly/releases). Download the installer for your platform and launch Cly.

The current macOS beta is intentionally unsigned. macOS may require **Control-click → Open** on first launch. Cly does not yet support regulated or sensitive data.

### Run from source

Requirements: [Git](https://git-scm.com/), Node.js 22.12 or newer, and pnpm 11.12.

```bash
git clone https://github.com/Frostand/Cly.git
cd Cly
corepack enable
corepack prepare pnpm@11.12.0 --activate
pnpm install --frozen-lockfile
pnpm doctor
pnpm dev
```

`pnpm doctor` checks the local toolchain and reports which optional AI harnesses are installed and signed in. Cly Research works without an AI harness.

## Quickstart

### Finish a research question

1. Create a local project and open **Research Loop**.
2. Enter the research question, working hypothesis, and scope.
3. Add sources and connect them to a preliminary claim.
4. Create an experiment and choose **Run analysis**.
5. Select a CSV or TSV file, outcome, predictors, fold count, and seed.
6. Review cross-validated performance, the baseline, coefficients, warnings, and generated result claim.
7. Open **Reproducibility**, run the audit, and resolve the evidence gaps before sharing.
8. Export a project backup from **Settings → Privacy**.

The supported local analysis boundary and an independent tester checklist are in [Beta testing](./docs/BETA_TESTING.md). The included LDL-C walkthrough demonstrates the full blank-to-result path: [Can basic health data predict when LDL cholesterol gives a misleading picture of heart-disease risk?](./docs/LDL_DISCORDANCE_DEMO.md)

### Use the coding workspace

1. Select **Dev** in the application switcher.
2. Choose **Open project** and select a local repository.
3. Open **AI Providers**, select an installed harness, and complete sign-in if needed.
4. Start a chat, select a model, and review tool activity and file changes in the workspace.

Provider credentials remain in each provider's own CLI session; Cly does not collect or save them.

## AI harnesses

Install and authenticate at least one harness to use Cly Dev chat. Provider accounts and usage charges are managed by the provider, not Cly.

| Harness | Install | Sign in | Documentation |
| --- | --- | --- | --- |
| Codex | `npm install -g @openai/codex` | `codex login` | [Codex CLI](https://developers.openai.com/codex/cli/) |
| Claude Code | `npm install -g @anthropic-ai/claude-code` | `claude` | [Claude Code](https://docs.anthropic.com/en/docs/claude-code/getting-started) |
| OpenCode | `npm install -g opencode-ai` | `opencode auth login` | [OpenCode CLI](https://opencode.ai/docs/cli/) |
| Cursor | Install Cursor Agent CLI (`agent` or `cursor-agent`) | `<detected executable> login` | [Cursor Agent CLI](https://cursor.com/docs/cli/installation) |

Cly checks both CLI availability and authentication. For Cursor it accepts only an `agent` executable whose help identifies it as Cursor, or `cursor-agent`, and checks `<detected executable> status`; installation alone is not treated as connected. Models come from each signed-in CLI's live discovery output. Provider/model failures and any labelled last-known catalog are surfaced in **AI Providers**, where setup commands can be copied and status refreshed.

## How it is organized

```text
Cly Core (local project store, research graph, context, permissions, provenance)
├── Cly Research (question, sources, experiments, analysis, claims, review)
└── Cly Dev (projects, files, terminal, diffs, multi-provider agent chat)
```

The [capability inventory](./docs/cly-v1-capabilities.json) is the machine-checked beta boundary. Every production action has a real local service/API boundary and a test. Unsupported actions are omitted from production controls instead of appearing as previews or behaving like completed features.

## Beta boundary

The end-to-end local research loop, persistent research objects, CSV/TSV analysis, evidence linkage, audits, backups, and live Cly Dev provider chat are available now. Research Agent Sessions can start, stream, approve, stop, resume, restart, and recover authenticated Codex and Claude runs; models and reasoning levels come from live provider discovery. Runtime-owned events are shown in the session record, while fixture-backed browser/terminal/diff panes are absent from production.

Notebook import, code scanning, hosted sync relay, hosted research/data integrations, and automatic research-decision planning are not part of this beta. The Integrations route detects local Codex, Claude Code, OpenCode, and Cursor sessions plus installed editors; provider credentials remain in their own CLIs. Use de-identified, non-sensitive data and export a backup before testing. Please report defects through [GitHub Issues](https://github.com/Frostand/Cly/issues).

## Development

```bash
pnpm install --frozen-lockfile
pnpm doctor
pnpm dev
```

Run the same quality gates used by CI:

```bash
pnpm lint
pnpm typecheck
pnpm capabilities:check
pnpm licenses:check
pnpm test
pnpm test:e2e
pnpm package:dir
pnpm package:verify:contents -- --app release/<platform-unpacked-path>
pnpm package:smoke -- --app release/<platform-unpacked-path>
```

Tagged release jobs run the privacy, license, capability, unit, end-to-end, packaged-content, permission-metadata, and unpacked-application launch checks on macOS, Windows, and Linux before publishing installers.

Useful commands:

```bash
pnpm demo          # launch the deterministic professor demo
pnpm demo:video    # record the captioned LDL-C walkthrough
pnpm package:mac   # platform installer targets also exist for win and linux
```

See [Contributing](./CONTRIBUTING.md), [Security](./SECURITY.md), the [architecture](./docs/architecture.md), and the [product roadmap](./docs/roadmap.md).

## License

Cly is licensed under [Apache License 2.0](./LICENSE). Third-party components retain their own licenses. Scoped attribution for inherited MIT-licensed material is preserved in [NOTICE.md](./NOTICE.md) and [licenses/DREAM_IDE-MIT.txt](./licenses/DREAM_IDE-MIT.txt); it does not change Cly's Apache-2.0 license.
