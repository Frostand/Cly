import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function getFeedUrl() {
  const rawUrl = process.env.CLY_UPDATE_FEED_URL?.trim();

  if (!rawUrl) {
    throw new Error(
      "Missing CLY_UPDATE_FEED_URL. Set it to the public R2 releases URL.",
    );
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("CLY_UPDATE_FEED_URL must be a valid HTTPS URL.");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "CLY_UPDATE_FEED_URL must not contain credentials, query parameters, or fragments.",
    );
  }

  if (url.protocol !== "https:") {
    throw new Error("CLY_UPDATE_FEED_URL must use HTTPS for release metadata.");
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "");
  url.pathname = normalizedPath || "/";
  const normalized = url.toString();
  return normalizedPath ? normalized : normalized.replace(/\/(?=[?#]|$)/, "");
}

function getReleaseVersion() {
  const releaseVersion = process.env.CLY_RELEASE_VERSION?.trim();
  if (!releaseVersion) {
    throw new Error(
      "Missing CLY_RELEASE_VERSION. Set it to the immutable release tag, for example v1.2.3.",
    );
  }
  if (
    !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(
      releaseVersion,
    )
  ) {
    throw new Error(
      "CLY_RELEASE_VERSION must be a version tag such as v1.2.3.",
    );
  }
  return releaseVersion;
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function getArtifactName(value) {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) {
    let artifactUrl;
    try {
      artifactUrl = new URL(value);
    } catch {
      throw new Error(
        `Invalid absolute artifact URL in update metadata: ${value}`,
      );
    }

    if (artifactUrl.protocol !== "https:") {
      throw new Error(
        `Absolute artifact URLs in update metadata must use HTTPS: ${value}`,
      );
    }

    const artifactName = path.basename(artifactUrl.pathname);
    if (!artifactName) {
      throw new Error(`Artifact URL is missing a filename: ${value}`);
    }
    return artifactName;
  }

  const artifactName = path.basename(value);
  if (!artifactName) {
    throw new Error(`Artifact path is missing a filename: ${value}`);
  }
  return artifactName;
}

function rewriteMetadataFile(filePath, artifactBaseUrl) {
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  const rewritten = lines.map((line) => {
    const match = line.match(/^(\s*(?:-\s*)?(?:path|url):\s*)(.+?)\s*$/);
    if (!match) {
      return line;
    }

    const value = parseScalar(match[2]);
    return `${match[1]}${quote(`${artifactBaseUrl}/${encodeURIComponent(getArtifactName(value))}`)}`;
  });

  writeFileSync(filePath, rewritten.join("\n"), "utf8");
}

const [, , ...filePaths] = process.argv;
if (filePaths.length === 0) {
  throw new Error(
    "Usage: node scripts/rewrite-update-metadata-urls.mjs <latest*.yml...>",
  );
}

const feedUrl = getFeedUrl();
const releaseVersion = getReleaseVersion();
const artifactBaseUrl = `${feedUrl}/versions/${encodeURIComponent(releaseVersion)}`;
for (const filePath of filePaths) {
  rewriteMetadataFile(filePath, artifactBaseUrl);
}
