import { createHash } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const METADATA_NAMES = ["latest.yml", "latest-mac.yml", "latest-linux.yml"];
const EXCLUDED_NAMES = new Set([".DS_Store", "release-manifest.json"]);

function fail(message) {
  throw new Error(`Release verification failed: ${message}`);
}

function normalizeFeedUrl() {
  const raw = process.env.CLY_UPDATE_FEED_URL?.trim();
  if (!raw) fail("CLY_UPDATE_FEED_URL is required.");
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    fail("CLY_UPDATE_FEED_URL must be a credential-free HTTPS URL.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

function parseScalar(raw) {
  const value = raw.trim();
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function parseMetadata(filePath) {
  const metadata = { files: [] };
  let currentFile = null;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const fileMatch = line.match(/^\s*-\s+url:\s*(.+?)\s*$/);
    if (fileMatch) {
      currentFile = { url: parseScalar(fileMatch[1]) };
      metadata.files.push(currentFile);
      continue;
    }
    const nestedMatch = line.match(/^\s{2,}(sha512|size):\s*(.+?)\s*$/);
    if (nestedMatch && currentFile) {
      currentFile[nestedMatch[1]] = parseScalar(nestedMatch[2]);
      continue;
    }
    const topLevelMatch = line.match(/^(version|path|sha512):\s*(.+?)\s*$/);
    if (topLevelMatch) {
      currentFile = null;
      metadata[topLevelMatch[1]] = parseScalar(topLevelMatch[2]);
    }
  }
  return metadata;
}

function listFiles(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path
      .relative(root, absolutePath)
      .split(path.sep)
      .join("/");
    if (entry.isSymbolicLink() || lstatSync(absolutePath).isSymbolicLink()) {
      fail(
        `symbolic links are not allowed in a release bundle: ${relativePath}`,
      );
    }
    if (entry.isDirectory()) return listFiles(root, absolutePath);
    if (!entry.isFile() || EXCLUDED_NAMES.has(entry.name)) return [];
    if (relativePath.startsWith("../") || path.isAbsolute(relativePath)) {
      fail(`release file escapes the bundle: ${relativePath}`);
    }
    return [{ absolutePath, name: relativePath }];
  });
}

function digest(filePath, algorithm, encoding) {
  return createHash(algorithm).update(readFileSync(filePath)).digest(encoding);
}

function artifactNameFromUrl(value, expectedBaseUrl, metadataName) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${metadataName} contains a non-absolute artifact URL: ${value}`);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    fail(`${metadataName} contains an unsafe artifact URL: ${value}`);
  }
  const decodedName = decodeURIComponent(path.posix.basename(url.pathname));
  if (!decodedName || decodedName === "." || decodedName === "..") {
    fail(`${metadataName} contains an artifact URL without a filename.`);
  }
  const expectedUrl = `${expectedBaseUrl}/${encodeURIComponent(decodedName)}`;
  if (url.toString() !== expectedUrl) {
    fail(
      `${metadataName} artifact URL must equal ${expectedUrl}, received ${url.toString()}.`,
    );
  }
  return decodedName;
}

const [, , releaseDirectory, expectedVersion] = process.argv;
if (!releaseDirectory || !expectedVersion) {
  throw new Error(
    "Usage: node scripts/verify-release-artifacts.mjs <release-directory> <package-version>",
  );
}

const releaseTag = process.env.CLY_RELEASE_VERSION?.trim();
if (releaseTag !== `v${expectedVersion}`) {
  fail(
    `CLY_RELEASE_VERSION must equal v${expectedVersion}; received ${releaseTag || "an empty value"}.`,
  );
}
const feedUrl = normalizeFeedUrl();
const expectedBaseUrl = `${feedUrl}/versions/${encodeURIComponent(releaseTag)}`;
const root = path.resolve(releaseDirectory);
if (!statSync(root).isDirectory()) fail(`${root} is not a directory.`);

const files = listFiles(root).sort((left, right) =>
  left.name.localeCompare(right.name),
);
const filesByBasename = new Map();
for (const file of files) {
  const basename = path.basename(file.name);
  if (filesByBasename.has(basename)) {
    fail(`duplicate release filename ${basename} is ambiguous.`);
  }
  filesByBasename.set(basename, file);
}

const referencedArtifacts = new Set();
for (const metadataName of METADATA_NAMES) {
  const metadataFile = filesByBasename.get(metadataName);
  if (!metadataFile)
    fail(`required updater metadata ${metadataName} is missing.`);
  const metadata = parseMetadata(metadataFile.absolutePath);
  if (metadata.version !== expectedVersion) {
    fail(
      `${metadataName} version ${metadata.version ?? "is missing"}; expected ${expectedVersion}.`,
    );
  }
  if (metadata.files.length === 0) {
    fail(`${metadataName} does not contain any updater file entries.`);
  }

  for (const reference of metadata.files) {
    const artifactName = artifactNameFromUrl(
      reference.url,
      expectedBaseUrl,
      metadataName,
    );
    const artifact = filesByBasename.get(artifactName);
    if (!artifact) fail(`${metadataName} references missing ${artifactName}.`);
    const actualSha512 = digest(artifact.absolutePath, "sha512", "base64");
    if (!reference.sha512 || reference.sha512 !== actualSha512) {
      fail(`${metadataName} has an invalid SHA-512 for ${artifactName}.`);
    }
    const actualSize = statSync(artifact.absolutePath).size;
    if (
      !/^\d+$/.test(reference.size ?? "") ||
      Number(reference.size) !== actualSize
    ) {
      fail(`${metadataName} has an invalid byte size for ${artifactName}.`);
    }
    referencedArtifacts.add(artifactName);
  }

  if (!metadata.path || !metadata.sha512) {
    fail(`${metadataName} must contain top-level path and sha512 fields.`);
  }
  const primaryName = artifactNameFromUrl(
    metadata.path,
    expectedBaseUrl,
    metadataName,
  );
  const primary = filesByBasename.get(primaryName);
  if (!primary) fail(`${metadataName} path references missing ${primaryName}.`);
  if (metadata.sha512 !== digest(primary.absolutePath, "sha512", "base64")) {
    fail(
      `${metadataName} has an invalid top-level SHA-512 for ${primaryName}.`,
    );
  }
  referencedArtifacts.add(primaryName);
}

if (referencedArtifacts.size < METADATA_NAMES.length) {
  fail(
    "the updater metadata does not reference all platform update artifacts.",
  );
}

const manifest = {
  version: expectedVersion,
  releaseTag,
  generatedAt: new Date().toISOString(),
  artifacts: files.map((file) => ({
    name: file.name,
    sha256: digest(file.absolutePath, "sha256", "hex"),
    size: statSync(file.absolutePath).size,
  })),
};
writeFileSync(
  path.join(root, "release-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
process.stdout.write(
  `Verified ${manifest.artifacts.length} release files for ${releaseTag}.\n`,
);
