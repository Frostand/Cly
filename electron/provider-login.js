import { spawn } from "node:child_process";
import { isCliCommandAvailable } from "./api/shared/cli.js";

const PROVIDER_LOGIN = Object.freeze({
  anthropic: { command: "claude", executable: "claude" },
  cursor: { command: "agent login", executable: "agent" },
  openai: { command: "codex login", executable: "codex" },
  opencode: {
    command: "opencode auth login",
    executable: "opencode",
  },
});

export const createProviderLoginLauncher = ({
  isCommandAvailable = isCliCommandAvailable,
  platform = process.platform,
  spawnProcess = spawn,
} = {}) => {
  return async (provider) => {
    const login = PROVIDER_LOGIN[provider];
    if (!login || !(await isCommandAvailable(login.executable))) {
      return false;
    }

    const terminalExecutable =
      platform === "darwin"
        ? "osascript"
        : platform === "win32"
          ? "cmd.exe"
          : "x-terminal-emulator";
    if (!(await isCommandAvailable(terminalExecutable))) {
      return false;
    }

    try {
      let child;
      if (platform === "darwin") {
        const script = `tell application "Terminal" to do script ${JSON.stringify(login.command)}`;
        child = spawnProcess("osascript", ["-e", script], {
          detached: true,
          stdio: "ignore",
        });
      } else if (platform === "win32") {
        child = spawnProcess(
          "cmd.exe",
          ["/c", "start", "", "cmd.exe", "/k", login.command],
          {
            detached: true,
            stdio: "ignore",
            windowsHide: false,
          },
        );
      } else {
        child = spawnProcess(
          "x-terminal-emulator",
          ["-e", "sh", "-lc", login.command],
          {
            detached: true,
            stdio: "ignore",
          },
        );
      }
      child.once?.("error", () => {
        // Availability is checked above; suppress a late launch error so a
        // disappearing terminal application cannot crash the main process.
      });
      child.unref();
      return true;
    } catch {
      return false;
    }
  };
};

export const launchProviderLogin = createProviderLoginLauncher();
