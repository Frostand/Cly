import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function listFiles(root, metadataOnly, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(root, metadataOnly, absolutePath);
    if (!entry.isFile() || entry.name === ".DS_Store") return [];
    if (metadataOnly && !/^latest(?:-[a-z]+)?\.yml$/.test(entry.name))
      return [];
    return [
      {
        absolutePath,
        name: path.relative(root, absolutePath).split(path.sep).join("/"),
      },
    ];
  });
}

async function fetchDigest(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "follow",
      });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }
      const hash = createHash("sha256");
      let size = 0;
      for await (const chunk of response.body) {
        hash.update(chunk);
        size += chunk.byteLength;
      }
      return { sha256: hash.digest("hex"), size };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  throw lastError;
}

const [, , releaseDirectory, rawFeedUrl, releaseTag, mode] = process.argv;
if (!releaseDirectory || !rawFeedUrl || !releaseTag) {
  throw new Error(
    "Usage: node scripts/verify-public-release.mjs <release-directory> <feed-url> <release-tag> [--root-metadata]",
  );
}
const feedUrl = new URL(rawFeedUrl);
if (feedUrl.protocol !== "https:" || feedUrl.username || feedUrl.password) {
  throw new Error(
    "The public release feed must be a credential-free HTTPS URL.",
  );
}
const normalizedFeedUrl = feedUrl.toString().replace(/\/$/, "");
const metadataOnly = mode === "--root-metadata";
const files = listFiles(path.resolve(releaseDirectory), metadataOnly);
if (files.length === 0)
  throw new Error("No public release files were selected.");

for (const file of files) {
  const encodedPath = file.name
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const publicUrl = metadataOnly
    ? `${normalizedFeedUrl}/${encodeURIComponent(path.basename(file.name))}`
    : `${normalizedFeedUrl}/versions/${encodeURIComponent(releaseTag)}/${encodedPath}`;
  const remote = await fetchDigest(publicUrl);
  const localSha256 = createHash("sha256")
    .update(readFileSync(file.absolutePath))
    .digest("hex");
  const localSize = statSync(file.absolutePath).size;
  if (remote.sha256 !== localSha256 || remote.size !== localSize) {
    throw new Error(
      `Public release verification failed for ${publicUrl}: expected ${localSha256}/${localSize}, received ${remote.sha256}/${remote.size}.`,
    );
  }
  process.stdout.write(`Verified ${publicUrl}\n`);
}
