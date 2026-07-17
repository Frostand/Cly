import { spawn as spawnProcess } from "node:child_process";
import {
  accessSync,
  existsSync,
  constants as fileSystemConstants,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { spawn as spawnPty } from "node-pty";

function parseCommandParts(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const matches = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  const parts = matches.map((part) =>
    part.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1"),
  );
  const command = parts[0];
  if (!command) {
    return null;
  }

  return {
    args: parts.slice(1),
    command,
  };
}

function formatShellCommand(command, args = []) {
  const trimmedCommand = typeof command === "string" ? command.trim() : "";
  if (!trimmedCommand) {
    return "";
  }

  const normalizedArgs = Array.isArray(args)
    ? args
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    : [];

  return [trimmedCommand, ...normalizedArgs].join(" ");
}

const UNIX_FALLBACK_SHELLS = ["/bin/zsh", "/bin/bash", "/bin/sh"];
const WINDOWS_SHELL_NAMES = new Set(["cmd.exe", "powershell.exe", "pwsh.exe"]);

const canonicalExecutable = (value) => {
  try {
    const canonicalPath = realpathSync(value);
    if (!statSync(canonicalPath).isFile()) return null;
    accessSync(canonicalPath, fileSystemConstants.X_OK);
    return canonicalPath;
  } catch {
    return null;
  }
};

const approvedUnixShells = () => {
  const configuredShells = [...UNIX_FALLBACK_SHELLS];
  try {
    configuredShells.push(
      ...readFileSync("/etc/shells", "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("/") && !line.startsWith("/#")),
    );
  } catch {
    // The fixed system fallbacks remain available when /etc/shells is absent.
  }

  return new Set(configuredShells.map(canonicalExecutable).filter(Boolean));
};

/**
 * Accept only an operating-system shell executable, never renderer-supplied
 * arguments. In particular, values such as `bash -c ...` and arbitrary
 * project executables must not become the terminal process itself.
 */
export function resolveApprovedTerminalShell(value) {
  const parsed = parseCommandParts(value);
  if (!parsed || parsed.args.length > 0) return null;

  if (process.platform === "win32") {
    const shellName = path.win32.basename(parsed.command).toLowerCase();
    if (!WINDOWS_SHELL_NAMES.has(shellName)) return null;

    // Never rely on PATH/current-directory lookup from a project cwd: a
    // repository containing powershell.exe or cmd.exe must not replace the
    // operating-system shell.
    if (!path.win32.isAbsolute(parsed.command)) return null;

    const canonicalPath = canonicalExecutable(parsed.command);
    if (!canonicalPath) return null;
    const trustedRoots = [
      process.env.SystemRoot,
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
    ]
      .filter(Boolean)
      .map((root) => path.win32.resolve(root).toLowerCase());
    const normalizedPath = path.win32.resolve(canonicalPath).toLowerCase();
    return trustedRoots.some(
      (root) =>
        normalizedPath === root || normalizedPath.startsWith(`${root}\\`),
    )
      ? canonicalPath
      : null;
  }

  const canonicalPath = canonicalExecutable(parsed.command);
  return canonicalPath && approvedUnixShells().has(canonicalPath)
    ? canonicalPath
    : null;
}

const getWindowsSystemShellPaths = () => {
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  const programFiles = process.env.ProgramFiles;
  const candidates = [
    systemRoot
      ? path.win32.join(
          systemRoot,
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        )
      : null,
    programFiles
      ? path.win32.join(programFiles, "PowerShell", "7", "pwsh.exe")
      : null,
    systemRoot ? path.win32.join(systemRoot, "System32", "cmd.exe") : null,
  ];
  return candidates
    .map((candidate) => resolveApprovedTerminalShell(candidate))
    .filter(Boolean);
};

function createTerminalStartupCommands(command) {
  const commands = [];
  if (typeof command === "string" && command.trim()) {
    commands.push(command.trim());
  }

  return commands;
}

function resolveTerminalCwd(cwd) {
  const trimmed = typeof cwd === "string" ? cwd.trim() : "";
  if (!trimmed) throw new Error("Terminal project directory is required.");

  try {
    if (existsSync(trimmed) && statSync(trimmed).isDirectory()) {
      return trimmed;
    }
  } catch (error) {
    throw new Error("Terminal project directory is unavailable.", {
      cause: error,
    });
  }

  throw new Error("Terminal project directory is unavailable.");
}

function buildTerminalShellCandidates(preferredShellPath) {
  // Login shells often reset to $HOME, which breaks project-scoped terminals.
  const defaultShellArgs = process.platform === "win32" ? [] : ["-i"];
  const candidates = [];
  const seen = new Set();

  const addCandidate = (rawValue, label) => {
    const parsed = parseCommandParts(rawValue);
    if (!parsed) {
      return;
    }

    const args = parsed.args.length > 0 ? parsed.args : defaultShellArgs;
    const key = `${parsed.command}\u0000${args.join("\u0000")}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    candidates.push({
      args,
      command: parsed.command,
      label,
    });
  };

  addCandidate(
    resolveApprovedTerminalShell(preferredShellPath),
    "configured shell",
  );
  addCandidate(
    resolveApprovedTerminalShell(process.env.SHELL),
    "SHELL environment",
  );

  if (process.platform === "win32") {
    for (const shell of getWindowsSystemShellPaths()) {
      addCandidate(shell, "Windows system shell fallback");
    }
  } else if (process.platform === "darwin") {
    addCandidate("/bin/zsh", "macOS zsh fallback");
    addCandidate("/bin/bash", "bash fallback");
    addCandidate("/bin/sh", "sh fallback");
  } else {
    addCandidate("/bin/bash", "bash fallback");
    addCandidate("/bin/sh", "sh fallback");
  }

  return candidates;
}

function getPipeFallbackShell() {
  if (process.platform === "win32") {
    const command = getWindowsSystemShellPaths()[0];
    return command
      ? { args: [], command, label: "Windows system shell pipe fallback" }
      : null;
  }

  if (existsSync("/bin/bash")) {
    return {
      args: ["--noprofile", "--norc", "-i"],
      command: "/bin/bash",
      label: "bash pipe fallback",
    };
  }

  return {
    args: ["-i"],
    command: "/bin/sh",
    label: "sh pipe fallback",
  };
}

export function stopChildProcess(child) {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    spawnProcess("taskkill", ["/pid", String(child.pid), "/f", "/t"], {
      stdio: "ignore",
    });
    return;
  }

  try {
    child.kill("SIGTERM");
  } catch {
    // ignore stop failures
  }
}

export function createProcessSessionManager({ sendToRenderer }) {
  const terminalSessions = new Map();
  const terminalTransports = new Map();
  const terminalShells = new Map();

  function writeTerminalStartupCommands(projectId, commands, delayMs = 80) {
    if (!Array.isArray(commands) || commands.length === 0) {
      return;
    }

    setTimeout(() => {
      const session = terminalSessions.get(projectId);
      if (!session) {
        return;
      }

      try {
        session.write(`${commands.join("\r")}\r`);
      } catch {
        // ignore write failures after session exits
      }
    }, delayMs);
  }

  function getDefaultTerminalShellCommand() {
    return buildTerminalShellCandidates(undefined)[0]?.command ?? "";
  }

  function stopTerminalSession(projectId) {
    const session = terminalSessions.get(projectId);
    const transport = terminalTransports.get(projectId);
    const shell = terminalShells.get(projectId);
    if (!session) {
      return;
    }

    try {
      session.kill();
    } catch {
      // ignore stop failures
    }

    terminalSessions.delete(projectId);
    terminalTransports.delete(projectId);
    terminalShells.delete(projectId);
    sendToRenderer("terminal:status", {
      projectId,
      shell,
      status: "stopped",
      transport,
    });
  }

  function stopAllProcesses() {
    for (const projectId of terminalSessions.keys()) {
      stopTerminalSession(projectId);
    }
  }

  function startTerminal({ command, cwd, projectId, shellPath }) {
    if (!projectId || !cwd) {
      throw new Error("Missing terminal parameters.");
    }

    stopTerminalSession(projectId);

    const shellCandidates = buildTerminalShellCandidates(shellPath);
    const resolvedCwd = resolveTerminalCwd(cwd);

    let terminalSession;
    let chosenShell = null;
    const spawnErrors = [];

    for (const candidate of shellCandidates) {
      try {
        terminalSession = spawnPty(candidate.command, candidate.args, {
          cols: 120,
          cwd: resolvedCwd,
          env: {
            ...process.env,
            PROMPT_EOL_MARK: "",
            TERM: "xterm-256color",
          },
          name: "xterm-256color",
          rows: 36,
        });
        chosenShell = candidate;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        spawnErrors.push(
          `${candidate.command} (${candidate.label}): ${message}`,
        );
      }
    }

    if (!terminalSession || !chosenShell) {
      const pipeFallbackCandidate = getPipeFallbackShell();
      if (!pipeFallbackCandidate) {
        const detail =
          spawnErrors.length > 0 ? `\r\n${spawnErrors.join("\r\n")}` : "";
        sendToRenderer("terminal:data", {
          chunk: `\r\n[terminal error] No approved operating-system shell is available.${detail}\r\n`,
          projectId,
        });
        sendToRenderer("terminal:status", {
          projectId,
          status: "stopped",
        });
        return { status: "stopped" };
      }

      let child;
      try {
        child = spawnProcess(
          pipeFallbackCandidate.command,
          pipeFallbackCandidate.args,
          {
            cwd: resolvedCwd,
            env: {
              ...process.env,
              BASH_SILENCE_DEPRECATION_WARNING: "1",
              PROMPT_EOL_MARK: "",
              PS1: "\\u@\\h \\W $ ",
              TERM: "xterm-256color",
            },
            shell: false,
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        spawnErrors.push(
          `${pipeFallbackCandidate.command} (${pipeFallbackCandidate.label}): ${message}`,
        );
        const detail =
          spawnErrors.length > 0 ? `\r\n${spawnErrors.join("\r\n")}` : "";
        sendToRenderer("terminal:data", {
          chunk: `\r\n[terminal error] Unable to start shell.${detail}\r\n`,
          projectId,
        });
        sendToRenderer("terminal:status", {
          projectId,
          status: "stopped",
        });
        return { status: "stopped" };
      }

      if (typeof child.pid !== "number") {
        const detail =
          spawnErrors.length > 0 ? `\r\n${spawnErrors.join("\r\n")}` : "";
        sendToRenderer("terminal:data", {
          chunk: `\r\n[terminal error] Shell started without a PID.${detail}\r\n`,
          projectId,
        });
        sendToRenderer("terminal:status", {
          projectId,
          status: "stopped",
        });
        return { status: "stopped" };
      }

      const pipeSession = {
        kill: () => stopChildProcess(child),
        write: (data) => {
          if (
            typeof data !== "string" ||
            !child.stdin ||
            child.stdin.destroyed ||
            child.stdin.writableEnded
          ) {
            return;
          }

          child.stdin.write(data);
        },
      };
      terminalSessions.set(projectId, pipeSession);
      terminalTransports.set(projectId, "pipe");
      const shellCommand = formatShellCommand(
        pipeFallbackCandidate.command,
        pipeFallbackCandidate.args,
      );
      terminalShells.set(projectId, shellCommand);

      sendToRenderer("terminal:status", {
        pid: child.pid,
        projectId,
        shell: shellCommand,
        status: "running",
        transport: "pipe",
      });

      if (spawnErrors.length > 0) {
        sendToRenderer("terminal:data", {
          chunk: `\u001b[2m[terminal info] PTY unavailable; using pipe fallback.\u001b[0m\r\n`,
          projectId,
        });
      }

      child.stdout?.on("data", (chunk) => {
        if (terminalSessions.get(projectId) !== pipeSession) {
          return;
        }
        sendToRenderer("terminal:data", {
          chunk: chunk.toString(),
          projectId,
        });
      });

      child.stderr?.on("data", (chunk) => {
        if (terminalSessions.get(projectId) !== pipeSession) {
          return;
        }
        sendToRenderer("terminal:data", {
          chunk: chunk.toString(),
          projectId,
        });
      });

      child.on("close", (code, signal) => {
        if (terminalSessions.get(projectId) !== pipeSession) {
          return;
        }
        terminalSessions.delete(projectId);
        terminalTransports.delete(projectId);
        terminalShells.delete(projectId);
        sendToRenderer("terminal:status", {
          code,
          projectId,
          shell: shellCommand,
          signal,
          status: "stopped",
          transport: "pipe",
        });
      });

      child.on("error", (error) => {
        if (terminalSessions.get(projectId) !== pipeSession) {
          return;
        }
        terminalSessions.delete(projectId);
        terminalTransports.delete(projectId);
        terminalShells.delete(projectId);
        sendToRenderer("terminal:data", {
          chunk: `\r\n[terminal error] ${error.message}\r\n`,
          projectId,
        });
        sendToRenderer("terminal:status", {
          projectId,
          shell: shellCommand,
          status: "stopped",
          transport: "pipe",
        });
      });

      writeTerminalStartupCommands(
        projectId,
        createTerminalStartupCommands(command),
      );

      return {
        pid: child.pid,
        shell: shellCommand,
        status: "running",
        transport: "pipe",
      };
    }

    terminalSessions.set(projectId, terminalSession);
    terminalTransports.set(projectId, "pty");
    const shellCommand = formatShellCommand(
      chosenShell.command,
      chosenShell.args,
    );
    terminalShells.set(projectId, shellCommand);
    sendToRenderer("terminal:status", {
      pid: terminalSession.pid,
      projectId,
      shell: shellCommand,
      status: "running",
      transport: "pty",
    });

    terminalSession.onData((chunk) => {
      if (terminalSessions.get(projectId) !== terminalSession) {
        return;
      }
      sendToRenderer("terminal:data", {
        chunk,
        projectId,
      });
    });

    terminalSession.onExit(({ exitCode, signal }) => {
      if (terminalSessions.get(projectId) !== terminalSession) {
        return;
      }
      terminalSessions.delete(projectId);
      terminalTransports.delete(projectId);
      terminalShells.delete(projectId);
      sendToRenderer("terminal:status", {
        code: exitCode,
        projectId,
        shell: shellCommand,
        signal: signal ?? null,
        status: "stopped",
        transport: "pty",
      });
    });

    writeTerminalStartupCommands(
      projectId,
      createTerminalStartupCommands(command),
    );

    return {
      pid: terminalSession.pid,
      shell: shellCommand,
      status: "running",
      transport: "pty",
    };
  }

  function writeTerminalInput({ data, projectId }) {
    if (!projectId || typeof data !== "string") {
      return;
    }

    const session = terminalSessions.get(projectId);
    if (!session) {
      return;
    }

    try {
      session.write(data);
    } catch {
      // ignore write failures after process/session exits
    }
  }

  function resizeTerminal({ cols, projectId, rows }) {
    if (!projectId) {
      return;
    }

    const session = terminalSessions.get(projectId);
    if (!session || typeof session.resize !== "function") {
      return;
    }

    const normalizedCols = Math.floor(Number(cols));
    const normalizedRows = Math.floor(Number(rows));

    if (
      !Number.isFinite(normalizedCols) ||
      !Number.isFinite(normalizedRows) ||
      normalizedCols < 2 ||
      normalizedRows < 1
    ) {
      return;
    }

    try {
      session.resize(normalizedCols, normalizedRows);
    } catch {
      // ignore resize failures after session exits
    }
  }

  return {
    getDefaultTerminalShellCommand,
    resizeTerminal,
    startTerminal,
    stopAllProcesses,
    stopTerminalSession,
    writeTerminalInput,
  };
}
