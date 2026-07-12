import { execFileSync } from "node:child_process";

const route = process.argv[2] ?? "overview";
const iteration = process.argv[3] ?? "responsive";
for (const [width, height] of [
  [1024, 700],
  [1280, 800],
  [1440, 900],
  [1728, 1117],
]) {
  execFileSync(
    process.execPath,
    [
      ".agents/skills/cly-visual-polish/scripts/capture-route.mjs",
      route,
      String(width),
      String(height),
      iteration,
    ],
    { stdio: "inherit" },
  );
}
