import path from "node:path";
import { resolveCliCommandPath } from "../shared/cli.js";
import { resolveNpmWindowsNodeShim } from "../shared/windows-node-shim.js";

export const getCodexCliSpawnErrorMessage = (error) => {
  if (error?.code === "ENOENT") {
    return "Codex CLI not found. Install it or add it to PATH, then restart Cly.";
  }

  return error instanceof Error ? error.message : "Codex CLI request failed.";
};

const isWindowsCommandShim = (commandPath) =>
  new Set([".bat", ".cmd", ".ps1"]).has(
    path.extname(commandPath).toLowerCase(),
  );

export const resolveCodexCliLaunch = async ({
  platform = process.platform,
  resolveCommand = resolveCliCommandPath,
  resolveWindowsShim = resolveNpmWindowsNodeShim,
} = {}) => {
  const command = await resolveCommand("codex");
  if (!command) {
    throw new Error(getCodexCliSpawnErrorMessage({ code: "ENOENT" }));
  }
  if (platform === "win32" && isWindowsCommandShim(command)) {
    if (path.extname(command).toLowerCase() === ".cmd") {
      try {
        const nodeLaunch = await resolveWindowsShim(command);
        if (nodeLaunch) return nodeLaunch;
      } catch {
        // Unknown, unreadable, or escaping shims are rejected below.
      }
    }
    throw new Error(
      "Cly could not safely resolve this Codex Windows command shim. Install Codex with npm so its adjacent Node entry point can be verified, use a native executable, or run Codex through WSL.",
    );
  }
  return { argsPrefix: [], command, shell: false };
};
