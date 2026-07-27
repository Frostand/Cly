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
  <a href="./docs/SETUP.md">Setup guide</a> ·
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

### Desktop application

**Download Cly from the [Releases page](https://github.com/Frostand/Cly/releases).**
Under the latest release's **Assets**, choose the installer for your platform;
the automatic **Source code** archives are for developers and do not contain an
installable application.

- Apple Silicon Mac: `Cly-<version>-mac-arm64.dmg`

The first downloadable desktop beta is for Apple Silicon (M-series) Macs.
Intel Mac, Windows, and Linux installers will be added after their packaged
builds have been independently validated.

On macOS, open the `.dmg`, drag **Cly** to **Applications**, then open it from
Applications. Current open-beta builds are not Developer ID signed or notarized,
so use **Control-click Cly → Open** the first time and confirm that you want to
open it. A clean install opens a blank guided setup: create a new project folder
or open a folder you already own. Cly does not yet support regulated or
sensitive data.

See the [install and setup guide](./docs/SETUP.md) for platform-specific
installation, local-data locations, backups, and the first project flow.

### Developer setup from source

**The command-line instructions below are only for developers and contributors
working from source. They are not the end-user installation path.**

Requirements: [Git](https://git-scm.com/), Node.js 22.12 or newer, and pnpm 11.12. Python is not required for normal development or local analysis.

For macOS or Linux, the complete setup can be run as one command:

```bash
git clone https://github.com/Frostand/Cly.git && cd Cly && corepack enable && corepack prepare pnpm@11.12.0 --activate && pnpm install --frozen-lockfile && pnpm doctor && pnpm dev
```

Or run the same setup step by step:

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

1. On first launch, select **Create a new project** or **Open an existing folder** and complete the local setup guide.
2. Enter the research question, working hypothesis, and scope.
3. Add sources and connect them to a preliminary claim.
4. Create an experiment and choose **Run analysis**.
5. Select a CSV or TSV file, outcome, predictors, fold count, and seed.
6. Review cross-validated performance, the baseline, coefficients, warnings, and generated result claim.
7. Open **Reproducibility**, run the audit, and resolve the evidence gaps before sharing.
8. Export a project backup from **Settings → Privacy**.

The supported local analysis boundary and an independent tester checklist are in [Beta testing](./docs/BETA_TESTING.md).

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

## Command line and configuration

Cly does not install a standalone `cly` command. End users launch the desktop
application normally. Contributors use the repository's pnpm scripts, and Cly
Dev optionally calls a provider CLI that is already installed and authenticated
on the same computer.

| Command | Purpose |
| --- | --- |
| `pnpm doctor` | Verify Node.js, pnpm, Git, and optional provider CLI status. |
| `pnpm dev` | Start Electron and its Vite renderer in development mode. |
| `pnpm vite:build` | Build the renderer into `dist/`. |
| `pnpm start` | Run the source checkout in production mode; run `pnpm vite:build` first. |
| `pnpm test` | Run the Vitest unit and integration suite. |
| `pnpm test:e2e` | Run the Playwright Electron end-to-end suite. |
| `pnpm package:dir` | Build an unpacked application for the current platform. |
| `pnpm package:mac` | Build macOS `.dmg` and `.zip` artifacts on macOS. |

No `.env` file, API key, hosted database, or external service is required for
Cly Research or the normal source-development path. Provider credentials stay
in the provider's own CLI session. Release signing, notarization, update-feed,
and CI-only environment variables are configured by the production release
workflow and are not needed for local use.

Example production-mode source run:

```bash
pnpm install --frozen-lockfile
pnpm doctor
pnpm vite:build
pnpm start
```

Example local packaged-app check:

```bash
pnpm package:dir
pnpm package:verify:contents
pnpm package:smoke -- --app release/mac-arm64/Cly.app
```

The content check discovers the current platform's default `release/` output.
The smoke check requires the unpacked application path; replace the macOS path
above with `release/win-unpacked/Cly.exe` or the executable inside
`release/linux-unpacked/` on those platforms.

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

Production release jobs run the privacy, license, capability, unit, end-to-end, packaged-content, permission-metadata, signing, and unpacked-application launch checks on macOS, Windows, and Linux before publishing installers.

Useful commands:

```bash
pnpm package:mac   # platform installer targets also exist for win and linux
```

## Troubleshooting

- **`pnpm` is missing or the version is wrong:** run `corepack enable`, then
  `corepack prepare pnpm@11.12.0 --activate`, and confirm with `pnpm --version`.
- **A provider is not detected or signed in:** run `pnpm doctor`, complete the
  provider's sign-in command from the table above, and restart Cly so the app
  receives the updated shell `PATH`.
- **`pnpm start` opens without the current interface:** run `pnpm vite:build`
  first. Production mode serves the existing `dist/` directory.
- **Create reports that the folder already exists:** choose **Open an existing
  folder** instead. Create intentionally makes a brand-new empty directory.
- **An earlier beta project still appears:** saved projects are preserved by
  design. Create another project for a blank workspace; reinstalling the app
  does not delete application data.
- **A locally built macOS app is blocked:** local builds are not automatically
  Developer ID signed or notarized. Use a published release, or Control-click
  the local app and choose **Open** for development testing.

For data locations, backups, and first-launch behavior, see the
[setup guide](./docs/SETUP.md). For reproducible bug reports, use **Settings →
Diagnostics → Copy diagnostics** and open a [GitHub issue](https://github.com/Frostand/Cly/issues).

See [Contributing](./CONTRIBUTING.md), [Security](./SECURITY.md), the [architecture](./docs/architecture.md), and the [product roadmap](./docs/roadmap.md).

## License

Cly is licensed under [Apache License 2.0](./LICENSE). Third-party components retain their own licenses. Scoped attribution for inherited MIT-licensed material is preserved in [NOTICE.md](./NOTICE.md) and [licenses/DREAM_IDE-MIT.txt](./licenses/DREAM_IDE-MIT.txt); it does not change Cly's Apache-2.0 license.
