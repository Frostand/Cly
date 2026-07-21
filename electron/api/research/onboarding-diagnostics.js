import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, opendir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const LARGE_REPOSITORY_FILES = 10_000;
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "dist",
  "build",
  "output",
]);

const executableEnvironment = () => ({
  LANG: "C",
  LC_ALL: "C",
  PATH: process.env.PATH,
  ...(process.platform === "win32"
    ? { SystemRoot: process.env.SystemRoot }
    : {}),
});

async function commandVersion(command, args = ["--version"], cwd) {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      encoding: "utf8",
      env: executableEnvironment(),
      maxBuffer: 64 * 1024,
      timeout: 3_000,
      windowsHide: true,
    });
    return String(result.stdout || result.stderr)
      .trim()
      .split(/\r?\n/, 1)[0];
  } catch {
    return null;
  }
}

async function countProjectFiles(root, limit = LARGE_REPOSITORY_FILES + 1) {
  let count = 0;
  const pending = [root];
  while (pending.length && count < limit) {
    const directory = pending.pop();
    let entries;
    try {
      entries = await opendir(directory);
    } catch (error) {
      if (error?.code === "EACCES" || error?.code === "EPERM") continue;
      throw error;
    }
    for await (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name))
          pending.push(path.join(directory, entry.name));
      } else {
        count += 1;
        if (count >= limit) break;
      }
    }
  }
  return count;
}

const check = (id, label, status, detail, fix) => ({
  id,
  label,
  status,
  detail,
  ...(fix ? { fix } : {}),
});

export async function diagnoseOnboardingProject(project) {
  const root = path.resolve(project.path);
  const checks = [];
  try {
    await access(root, constants.R_OK | constants.W_OK);
    checks.push(
      check(
        "filesystem",
        "Filesystem permission",
        "pass",
        "The selected folder is readable and writable.",
      ),
    );
  } catch {
    checks.push(
      check(
        "filesystem",
        "Filesystem permission",
        "permission-denied",
        "Cly cannot read and write the selected folder.",
        "Grant Cly read and write access, then run the checks again.",
      ),
    );
  }

  const gitVersion = await commandVersion("git", ["--version"], root);
  const gitRoot = gitVersion
    ? await commandVersion("git", ["rev-parse", "--show-toplevel"], root)
    : null;
  checks.push(
    gitVersion
      ? gitRoot
        ? check("git", "Git", "pass", `${gitVersion} · repository detected.`)
        : check(
            "git",
            "Git",
            "warning",
            `${gitVersion} is installed, but this folder is not a Git repository.`,
            "Run git init if this project should track code and research changes.",
          )
      : check(
          "git",
          "Git",
          "failed",
          "Git is not available on PATH.",
          "Install Git and restart Cly so the executable is available.",
        ),
  );

  const python3 = await commandVersion("python3", ["--version"], root);
  const python =
    python3 ?? (await commandVersion("python", ["--version"], root));
  checks.push(
    python
      ? check("python", "Python", "pass", python)
      : check(
          "python",
          "Python",
          "warning",
          "Python was not detected.",
          "Install Python 3 or add it to PATH if this project uses Python.",
        ),
  );

  const jupyter =
    (await commandVersion("jupyter", ["--version"], root)) ??
    (python
      ? await commandVersion(
          python3 ? "python3" : "python",
          ["-m", "jupyter", "--version"],
          root,
        )
      : null);
  checks.push(
    jupyter
      ? check("jupyter", "Jupyter", "pass", "Jupyter is available locally.")
      : check(
          "jupyter",
          "Jupyter",
          "warning",
          "Jupyter was not detected.",
          "Install Jupyter in the project environment if notebooks are required.",
        ),
  );

  const providerCommands = ["codex", "claude", "opencode", "cursor"];
  const detectedProviders = [];
  for (const command of providerCommands) {
    if (await commandVersion(command, ["--version"], root))
      detectedProviders.push(command);
  }
  checks.push(
    detectedProviders.length
      ? check(
          "provider-cli",
          "Provider CLI",
          "pass",
          `Detected locally: ${detectedProviders.join(", ")}.`,
        )
      : check(
          "provider-cli",
          "Provider CLI",
          "warning",
          "No supported provider CLI was detected. Local research setup can continue.",
          "Install Codex, Claude Code, OpenCode, or Cursor before starting provider-backed agent work.",
        ),
  );

  const optionalIntegrations = Array.isArray(
    project.metadata?.optionalIntegrations,
  )
    ? project.metadata.optionalIntegrations.filter(
        (item) => typeof item === "string" && item.trim(),
      )
    : [];
  checks.push(
    check(
      "integrations",
      "Optional integrations",
      optionalIntegrations.length ? "warning" : "pass",
      optionalIntegrations.length
        ? `${optionalIntegrations.join(", ")} will remain disconnected until privacy approval and sign-in.`
        : "No optional integrations are required for local-only setup.",
      optionalIntegrations.length
        ? "Finish the privacy review before testing an external integration."
        : undefined,
    ),
  );

  let scannedFiles;
  try {
    scannedFiles = await countProjectFiles(root);
  } catch {
    // The filesystem check already exposes the actionable permission failure.
  }
  return {
    state: "ready",
    checks,
    repositorySize:
      scannedFiles && scannedFiles > LARGE_REPOSITORY_FILES
        ? "large"
        : "normal",
    ...(typeof scannedFiles === "number" ? { scannedFiles } : {}),
  };
}

export function createOnboardingDiagnosticsService(repository) {
  return {
    diagnose(projectId) {
      return diagnoseOnboardingProject(repository.getProject(projectId));
    },
  };
}
