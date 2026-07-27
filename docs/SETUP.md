# Install and set up Cly

Cly is a desktop application. Downloading a release is the normal way to use
it—you do **not** need to clone the repository, install Node.js, or run
`pnpm dev`.

## macOS

1. Download the macOS build for your Mac from the [Cly Releases page](https://github.com/Frostand/Cly/releases).
   Choose `arm64` for Apple Silicon (M-series) Macs or `x64` for Intel Macs.
2. Open the downloaded `.dmg` and drag **Cly** to **Applications**.
3. Open **Cly** from Applications. Production releases are signed and
   notarized. An older prerelease or locally built app may require
   **Control-click → Open** the first time.
4. Cly opens to a blank first-run setup. Select **Create a new project** to
   make a folder in the macOS picker, or **Open an existing folder** to use a
   repository or research directory already on your Mac.
5. Give the project a research question, choose the local-only default, and
   finish the guided setup. Cly saves progress automatically; quitting and
   reopening resumes the same project.

## Windows and Linux

Download the platform installer from the [Cly Releases page](https://github.com/Frostand/Cly/releases), install it, then open Cly from the operating system's application launcher. The same blank first-run setup appears on the first launch.

## Where Cly keeps data

Cly stores its local application state and research records in the operating
system's application-data directory, not inside the downloaded app bundle:

| Platform | Default location |
| --- | --- |
| macOS | `~/Library/Application Support/cly/` |
| Windows | `%APPDATA%\\cly\\` |
| Linux | `~/.config/cly/` |

Your project folder stays where you chose it. Cly's local database retains the
project record, sources, claims, experiments, run metadata, and setup state
between launches. Back up projects from **Settings → Privacy → Export project**
before testing a new beta build.

## What the guided setup does

The setup guide is available on first launch and later from **Setup & Help** in
the left sidebar. It records the project folder, research direction and
question, privacy choice, and optional readiness checks before preparing the
empty workspace. Nothing is uploaded during local setup. External actions
remain off unless you explicitly approve them.

## Developers and contributors

Only contributors need the source-development workflow:

```bash
git clone https://github.com/Frostand/Cly.git
cd Cly
corepack enable
corepack prepare pnpm@11.12.0 --activate
pnpm install --frozen-lockfile
pnpm doctor
pnpm dev
```

This runs Cly from the checkout for development; it is not the end-user installation path.

No `.env` file or API key is required. Run `pnpm doctor` whenever the source
toolchain or an optional AI provider CLI is not detected. The full command
reference and troubleshooting guide are in the [project README](../README.md#command-line-and-configuration).
