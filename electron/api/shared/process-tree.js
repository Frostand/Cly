import { spawn } from "node:child_process";

const DEFAULT_GRACE_MS = 1500;

export const terminateProcessTree = (
  child,
  {
    cancel = clearTimeout,
    graceMs = DEFAULT_GRACE_MS,
    killProcess = process.kill,
    platform = process.platform,
    schedule = setTimeout,
    spawnProcess = spawn,
  } = {},
) => {
  const pid = Number(child?.pid);
  if (!Number.isInteger(pid) || pid <= 0) return () => {};

  const terminateWindowsTree = (force) => {
    try {
      const killer = spawnProcess(
        "taskkill",
        ["/pid", String(pid), "/t", ...(force ? ["/f"] : [])],
        { stdio: "ignore", windowsHide: true },
      );
      killer.once?.("error", () => {});
      killer.unref?.();
    } catch {
      // The force attempt below remains the final bounded fallback.
    }
  };

  const terminatePosixGroup = (signal) => {
    try {
      killProcess(-pid, signal);
      return;
    } catch {
      // A non-detached child has no process group; fall back to the child.
    }
    try {
      child.kill?.(signal);
    } catch {
      // The process may already have exited.
    }
  };

  if (platform === "win32") terminateWindowsTree(false);
  else terminatePosixGroup("SIGTERM");

  const forceTimer = schedule(
    () => {
      if (platform === "win32") terminateWindowsTree(true);
      else terminatePosixGroup("SIGKILL");
    },
    Math.max(0, graceMs),
  );
  const cleanup = () => cancel(forceTimer);
  child.once?.("close", cleanup);
  child.once?.("exit", cleanup);
  return cleanup;
};
