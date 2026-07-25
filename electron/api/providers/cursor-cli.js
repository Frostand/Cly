import { promises as fs } from "node:fs";
import path from "node:path";
import {
  execCliCommand,
  getCliVersion,
  resolveCliCommandPath,
} from "../shared/cli.js";
import { resolveNpmWindowsNodeShim } from "../shared/windows-node-shim.js";

const CURSOR_CLI_COMMANDS = ["cursor-agent", "agent"];
const CURSOR_CLI_CACHE_TTL_MS = 30_000;

let cachedCursorCli = null;
let cachedCursorCliTimestamp = 0;

const isLikelyCursorAgentHelp = (value) =>
  /cursor/i.test(value) && /agent/i.test(value);

const getCursorCliPathCandidates = () => {
  if (process.platform !== "win32") {
    return [];
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    return [];
  }

  const installDir = path.join(localAppData, "cursor-agent");
  return [
    path.join(installDir, "cursor-agent.cmd"),
    path.join(installDir, "agent.cmd"),
  ];
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const getCursorCliCandidates = () => [
  ...CURSOR_CLI_COMMANDS,
  ...getCursorCliPathCandidates(),
];

const resolveCursorCommandCandidate = async (commandName) => {
  const commandPath = path.isAbsolute(commandName)
    ? (await fileExists(commandName))
      ? commandName
      : null
    : await resolveCliCommandPath(commandName);
  if (!commandPath) return null;

  if (!/(^|[\\/])agent(?:\.(?:cmd|ps1))?$/i.test(commandName)) {
    return commandPath;
  }

  try {
    const result = await execCliCommand(commandPath, ["--help"], {
      timeout: 3000,
    });
    return isLikelyCursorAgentHelp(`${result.stdout}\n${result.stderr}`)
      ? commandPath
      : null;
  } catch {
    return null;
  }
};

export const getCursorCliCommand = async ({ force = false } = {}) => {
  const now = Date.now();
  if (
    !force &&
    cachedCursorCli &&
    now - cachedCursorCliTimestamp < CURSOR_CLI_CACHE_TTL_MS
  ) {
    return cachedCursorCli;
  }

  for (const commandName of getCursorCliCandidates()) {
    const commandPath = await resolveCursorCommandCandidate(commandName);
    if (commandPath) {
      cachedCursorCli = commandPath;
      cachedCursorCliTimestamp = now;
      return commandPath;
    }
  }

  cachedCursorCli = null;
  cachedCursorCliTimestamp = now;
  return null;
};

export const isCursorCliAvailable = async (options = {}) =>
  (await getCursorCliCommand(options)) !== null;

export const getCursorCliVersion = async ({ force = false } = {}) => {
  const commandName = await getCursorCliCommand({ force });
  return commandName ? getCliVersion(commandName, { force }) : null;
};

export const execCursorCliCommand = async (args = [], options = {}) => {
  const commandName = await getCursorCliCommand();
  if (!commandName) {
    throw new Error(getCursorCliUnavailableMessage());
  }

  return execCliCommand(commandName, args, options);
};

export const getCursorCliUnavailableMessage = () =>
  "Cursor Agent CLI is not installed or not available. Install it and add `cursor-agent` (or the legacy `agent`) to PATH.";

export const getCursorCliSpawnErrorMessage = (error) => {
  if (error?.code === "ENOENT") {
    return getCursorCliUnavailableMessage();
  }

  return error instanceof Error ? error.message : "Cursor CLI request failed.";
};

export const normalizeCursorCliModel = (model) => {
  const trimmed = String(model ?? "").trim();
  const normalized = trimmed.toLowerCase();
  return !normalized || normalized === "auto" || normalized === "cursor-auto"
    ? "auto"
    : trimmed;
};

export const resolveCursorCliLaunch = async ({
  platform = process.platform,
  resolveCommand = getCursorCliCommand,
  resolveWindowsShim = resolveNpmWindowsNodeShim,
} = {}) => {
  const commandName = await resolveCommand();
  if (!commandName) {
    throw new Error(getCursorCliUnavailableMessage());
  }
  if (
    platform === "win32" &&
    new Set([".bat", ".cmd", ".ps1"]).has(
      path.extname(commandName).toLowerCase(),
    )
  ) {
    if (path.extname(commandName).toLowerCase() === ".cmd") {
      try {
        const nodeLaunch = await resolveWindowsShim(commandName);
        if (nodeLaunch) return nodeLaunch;
      } catch {
        // Unknown, unreadable, or escaping shims are rejected below.
      }
    }
    throw new Error(
      "Cly could not safely resolve this Cursor Windows command shim. Install Cursor Agent with npm so its adjacent Node entry point can be verified, use a native executable, or run Cursor Agent through WSL.",
    );
  }

  return {
    argsPrefix: [],
    command: commandName,
    shell: false,
  };
};
