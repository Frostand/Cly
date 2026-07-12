import { execFileSync } from "node:child_process";

const iteration = process.argv[2] ?? "all-routes";
execFileSync(
  process.execPath,
  ["scripts/ui-review/run-electron-review.mjs", iteration],
  { stdio: "inherit" },
);
