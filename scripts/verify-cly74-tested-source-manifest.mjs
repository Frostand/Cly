import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(
  root,
  "docs/CLY_DEV_TESTED_SOURCE_MANIFEST.sha256",
);
const baseline = "09fd7297fb11c7d7768f3c43de1b0cb8501fabe9";
const rootInputs = new Set([
  ".npmrc",
  "biome.json",
  "index.html",
  "package.json",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "vite.config.ts",
  "vitest.config.ts",
]);

function inTestedSourceScope(file) {
  return (
    file.startsWith("src/") ||
    file.startsWith("electron/") ||
    file.startsWith("tests/e2e/") ||
    file.startsWith("public/") ||
    file === ".agents/skills/cly-accessibility-review/scripts/run-a11y.mjs" ||
    file === "docs/cly-v1-capabilities.json" ||
    file === "scripts/prune-packaged-app.cjs" ||
    file === "scripts/prepare-electron-dev-app.mjs" ||
    rootInputs.has(file)
  );
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function trackedSourcePaths() {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
    .filter(inTestedSourceScope)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function expectedManifest() {
  const paths = trackedSourcePaths();
  const entries = paths.map((file) => {
    const digest = sha256(readFileSync(path.join(root, file)));
    return `${digest}  ${file}`;
  });
  return {
    content: [
      "# CLY-74 tested source manifest v1",
      `# baseline ${baseline}`,
      "# algorithm sha256; paths are repository-relative and sorted",
      "# scope: all tracked src, Electron, E2E, public, dependency/workspace/build/test config, Electron preparation, capability contract, package afterPack, and native accessibility-runner inputs used by the verified 24-unit + 7-Playwright + package-build matrix",
      "# excluded intentionally: evidence/docs, generated output/dist/release, Git metadata, dependencies, and this manifest/verifier (excluding them prevents evidence recursion)",
      ...entries,
      "",
    ].join("\n"),
    entries: paths.length,
  };
}

const expected = expectedManifest();
if (process.argv.includes("--write")) {
  writeFileSync(manifestPath, expected.content, "utf8");
} else {
  const actual = readFileSync(manifestPath, "utf8");
  if (actual !== expected.content) {
    throw new Error(
      "CLY-74 tested source manifest is stale; rerun this script with --write and review the changed inputs.",
    );
  }
}

console.log(
  JSON.stringify({
    baseline,
    entries: expected.entries,
    manifest: path.relative(root, manifestPath),
    manifestSha256: sha256(expected.content),
    verified: true,
  }),
);
