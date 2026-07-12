import { execFileSync } from "node:child_process";

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
// Sharp distributes libvips under LGPL with dynamic-linking/relinking support, while
// the Anthropic agent SDK packages currently omit SPDX metadata from their manifests.
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
]);

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  throw new Error("Run this check through pnpm: pnpm licenses:check");
}

const output = execFileSync(
  process.execPath,
  [pnpmCli, "licenses", "list", "--prod", "--json"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
const report = JSON.parse(output);
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
