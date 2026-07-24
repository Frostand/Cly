import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, parse } from "node:path";

const allowedLicenses = new Set([
  "(AFL-2.1 OR BSD-3-Clause)",
  "0BSD",
  "Apache-2.0",
  "Apache-2.0 AND MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "CC-BY-4.0",
  "ISC",
  "MIT",
  "Python-2.0",
  "Unlicense",
  "apache-2.0",
]);

// These exceptions are narrow package-name approvals, not blanket license approvals.
// Sharp distributes libvips under LGPL with dynamic-linking/relinking support. The
// Anthropic agent SDK packages point to Anthropic's separately reviewed legal terms
// instead of declaring an SPDX identifier; keep those approvals package-specific.
const reviewedExceptions = new Map([
  [
    "LGPL-3.0-or-later",
    new Set([
      "@img/sharp-libvips-darwin-arm64",
      "@img/sharp-libvips-darwin-x64",
      "@img/sharp-libvips-linux-arm",
      "@img/sharp-libvips-linux-arm64",
      "@img/sharp-libvips-linux-ppc64",
      "@img/sharp-libvips-linux-riscv64",
      "@img/sharp-libvips-linux-s390x",
      "@img/sharp-libvips-linux-x64",
      "@img/sharp-libvips-linuxmusl-arm64",
      "@img/sharp-libvips-linuxmusl-x64",
    ]),
  ],
  [
    "Unknown",
    new Set([
      "@anthropic-ai/claude-agent-sdk",
      "@anthropic-ai/claude-agent-sdk-darwin-arm64",
      "@anthropic-ai/claude-agent-sdk-darwin-x64",
      "@anthropic-ai/claude-agent-sdk-linux-arm64",
      "@anthropic-ai/claude-agent-sdk-linux-x64",
    ]),
  ],
  ["SEE LICENSE IN README.md", new Set(["@anthropic-ai/claude-agent-sdk"])],
  [
    "SEE LICENSE IN LICENSE.md",
    new Set([
      "@anthropic-ai/claude-agent-sdk-darwin-arm64",
      "@anthropic-ai/claude-agent-sdk-darwin-x64",
      "@anthropic-ai/claude-agent-sdk-linux-arm64",
      "@anthropic-ai/claude-agent-sdk-linux-x64",
    ]),
  ],
]);

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  throw new Error("Run this check through pnpm: pnpm licenses:check");
}

const readManifest = (manifestPath) =>
  JSON.parse(readFileSync(manifestPath, "utf8"));

function findManifestFromEntry(entryPath, expectedName) {
  let current = dirname(entryPath);
  while (current !== parse(current).root) {
    const candidate = join(current, "package.json");
    if (existsSync(candidate)) {
      const manifest = readManifest(candidate);
      if (manifest.name === expectedName) return candidate;
    }
    current = dirname(current);
  }
  return null;
}

function resolveManifest(name, fromManifestPath) {
  const scopedRequire = createRequire(fromManifestPath);
  try {
    return realpathSync(scopedRequire.resolve(`${name}/package.json`));
  } catch {
    for (const lookupPath of scopedRequire.resolve.paths(name) ?? []) {
      const candidate = join(lookupPath, name, "package.json");
      if (existsSync(candidate) && readManifest(candidate).name === name) {
        return realpathSync(candidate);
      }
    }
    try {
      const entryPath = scopedRequire.resolve(name);
      const manifestPath = findManifestFromEntry(entryPath, name);
      return manifestPath ? realpathSync(manifestPath) : null;
    } catch {
      return null;
    }
  }
}

function normalizedLicense(manifest) {
  if (typeof manifest.license === "string" && manifest.license.trim()) {
    return manifest.license.trim();
  }
  if (Array.isArray(manifest.licenses) && manifest.licenses.length) {
    return manifest.licenses
      .map((license) => (typeof license === "string" ? license : license?.type))
      .filter(Boolean)
      .join(" OR ");
  }
  return "Unknown";
}

function allowsCurrentRuntime(values, current) {
  if (!Array.isArray(values) || values.length === 0) return true;
  const excluded = values
    .filter((value) => value.startsWith("!"))
    .map((value) => value.slice(1));
  if (excluded.includes(current)) return false;
  const included = values.filter((value) => !value.startsWith("!"));
  return included.length === 0 || included.includes(current);
}

function supportsCurrentPlatform(manifest) {
  return (
    allowsCurrentRuntime(manifest.os, process.platform) &&
    allowsCurrentRuntime(manifest.cpu, process.arch)
  );
}

function installedProductionReport() {
  const rootManifestPath = join(process.cwd(), "package.json");
  const rootManifest = readManifest(rootManifestPath);
  const queue = Object.keys(rootManifest.dependencies ?? {}).map((name) => ({
    name,
    fromManifestPath: rootManifestPath,
    optional: false,
  }));
  const visited = new Set();
  const reportByLicense = new Map();

  while (queue.length) {
    const dependency = queue.shift();
    const manifestPath = resolveManifest(
      dependency.name,
      dependency.fromManifestPath,
    );
    if (!manifestPath) {
      if (dependency.optional) continue;
      throw new Error(
        `Production dependency ${dependency.name} is not installed from ${dependency.fromManifestPath}.`,
      );
    }
    if (visited.has(manifestPath)) continue;
    visited.add(manifestPath);
    const manifest = readManifest(manifestPath);
    if (dependency.optional && !supportsCurrentPlatform(manifest)) continue;
    const license = normalizedLicense(manifest);
    const packageName = manifest.name ?? dependency.name;
    const versionsByName = reportByLicense.get(license) ?? new Map();
    const versions = versionsByName.get(packageName) ?? new Set();
    versions.add(manifest.version ?? "unknown");
    versionsByName.set(packageName, versions);
    reportByLicense.set(license, versionsByName);

    for (const name of Object.keys(manifest.dependencies ?? {})) {
      queue.push({ name, fromManifestPath: manifestPath, optional: false });
    }
    for (const name of Object.keys(manifest.optionalDependencies ?? {})) {
      queue.push({ name, fromManifestPath: manifestPath, optional: true });
    }
  }

  return Object.fromEntries(
    [...reportByLicense].map(([license, versionsByName]) => [
      license,
      [...versionsByName].map(([name, versions]) => ({
        name,
        versions: [...versions].sort(),
      })),
    ]),
  );
}

let report;
try {
  const output = execFileSync(
    process.execPath,
    [pnpmCli, "licenses", "list", "--prod", "--json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  report = JSON.parse(output);
} catch (error) {
  console.warn(
    `pnpm license metadata was unavailable (${error.status ?? "unknown error"}); checking the installed production graph instead.`,
  );
  report = installedProductionReport();
}
const violations = [];
let packageCount = 0;

for (const [license, packages] of Object.entries(report)) {
  for (const dependency of packages) {
    packageCount += 1;
    const isAllowed = allowedLicenses.has(license);
    const isReviewedException = reviewedExceptions
      .get(license)
      ?.has(dependency.name);
    if (!isAllowed && !isReviewedException) {
      violations.push(
        `${dependency.name}@${dependency.versions.join(",")} (${license})`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error("Unreviewed production dependency licenses:");
  for (const violation of violations.sort()) console.error(`- ${violation}`);
  console.error(
    "Review the license, then add only the narrowest justified approval.",
  );
  process.exit(1);
}

console.log(`Production license policy passed for ${packageCount} packages.`);
