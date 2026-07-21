import type { ClyDevSessionEvent } from "./types";

export const eventProcessLines = (events: ClyDevSessionEvent[]) => {
  const records = events.filter((event) => event.type === "process.recorded");
  const latest = records.at(-1);
  if (!latest) return ["No command output has been recorded for this session."];
  const payload = latest.payload as Record<string, unknown>;
  return [
    `$ ${String(payload.command ?? "")}`,
    ...String(payload.stdout ?? "").split(/\r?\n/),
    ...String(payload.stderr ?? "").split(/\r?\n/),
    `[${String(payload.status ?? "complete")}; exit ${String(payload.exitCode ?? "n/a")}]`,
  ].filter(Boolean);
};
