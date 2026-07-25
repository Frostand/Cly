import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const allowedFixtureUsers = new Set([
  "a",
  "alice",
  "b",
  "example",
  "private",
  "reviewer",
  "runner",
  "test",
  "user",
]);
const sensitiveNames = [
  /^\.env(?:\.|$)/i,
  /^\.ds_store$/i,
  /^\._.+$/i,
  /^desktop\.ini$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /^thumbs\.db$/i,
  /\.(?:p12|pfx|pem)$/i,
];
const generatedPathPatterns = [
  /^\.pnpm-store\//,
  /^coverage\//,
  /^dist\//,
  /^output\//,
  /^playwright-report\//,
  /^release\//,
  /^storybook-static\//,
  /^test-results\//,
];
const binaryExtensionPattern =
  /\.(?:7z|avi|db|dmg|docx|gif|gz|icns|ico|jpe?g|mkv|mov|mp3|mp4|pdf|png|p12|pfx|sqlite|tar|webm|webp|xpt|zip)$/i;
const approvedTrackedBinaryPatterns = [
  /^build\/icons\/(?:icon\.(?:icns|ico|png))$/,
  /^public\/icon\.(?:ico|png)$/,
  /^src\/assets\/pattern\.gif$/,
];
const pathPatterns = [
  { kind: "macOS home", pattern: /\/Users\/([^/\s"'`]+)/g },
  { kind: "Linux home", pattern: /\/home\/([^/\s"'`]+)/g },
  {
    kind: "Windows home",
    pattern: /[A-Za-z]:\\Users\\([^\\\s"'`]+)/g,
  },
];

const listGitFiles = (args) =>
  execFileSync("git", [...args, "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean);

const repositoryFiles = listGitFiles([
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
]);
const trackedFiles = new Set(listGitFiles(["ls-files", "--cached"]));
const ignoredFiles = listGitFiles([
  "ls-files",
  "--others",
  "--ignored",
  "--exclude-standard",
]);
const findings = [];
const localMetadata = ignoredFiles.filter((relativePath) =>
  sensitiveNames.some((pattern) => pattern.test(path.basename(relativePath))),
);
const configuredHome = process.env.HOME ? path.resolve(process.env.HOME) : null;

const gitignore = readFileSync(path.join(root, ".gitignore"), "utf8");
if (!/^\.DS_Store\s*$/m.test(gitignore)) {
  findings.push(".gitignore: must ignore .DS_Store metadata");
}

for (const relativePath of repositoryFiles) {
  const absolutePath = path.join(root, relativePath);
  const name = path.basename(relativePath);
  if (sensitiveNames.some((pattern) => pattern.test(name))) {
    findings.push(`${relativePath}: sensitive filename ${name}`);
  }

  const isTrackedGenerated =
    trackedFiles.has(relativePath) &&
    generatedPathPatterns.some((pattern) => pattern.test(relativePath));
  if (isTrackedGenerated) {
    findings.push(`${relativePath}: tracked generated artifact`);
  }

  if (
    trackedFiles.has(relativePath) &&
    !isTrackedGenerated &&
    binaryExtensionPattern.test(relativePath) &&
    !approvedTrackedBinaryPatterns.some((pattern) => pattern.test(relativePath))
  ) {
    findings.push(
      `${relativePath}: tracked binary is not in the reviewed release allowlist`,
    );
  }

  if (!existsSync(absolutePath)) continue;
  const stat = lstatSync(absolutePath);
  if (stat.isSymbolicLink() || !stat.isFile()) continue;

  const content = readFileSync(absolutePath).toString("latin1");
  if (configuredHome && content.includes(configuredHome)) {
    findings.push(`${relativePath}: contains the current user's home path`);
  }
  for (const { kind, pattern } of pathPatterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const username = match[1]?.toLowerCase();
      if (username && !allowedFixtureUsers.has(username)) {
        findings.push(
          `${relativePath}: contains a non-placeholder ${kind} path (${match[0]})`,
        );
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Repository privacy check failed:");
  for (const finding of Array.from(new Set(findings))) {
    console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Repository privacy check passed (${repositoryFiles.length} tracked or trackable files; ${trackedFiles.size} tracked files received generated/binary coverage).`,
  );
}

if (localMetadata.length > 0) {
  console.warn(
    `Ignored local metadata found (${localMetadata.length}); it is excluded from commits and was not deleted:`,
  );
  for (const relativePath of localMetadata.slice(0, 20)) {
    console.warn(`- ${relativePath}`);
  }
  if (localMetadata.length > 20) {
    console.warn(`- …and ${localMetadata.length - 20} more`);
  }
}
