// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const scriptPath = path.join(
  process.cwd(),
  "scripts/rewrite-update-metadata-urls.mjs",
);

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createMetadata(contents: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "cly-update-metadata-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "latest.yml");
  writeFileSync(filePath, contents, "utf8");
  return filePath;
}

function rewrite(
  filePath: string,
  feedUrl = "https://updates.example.com/releases/",
) {
  return spawnSync(process.execPath, [scriptPath, filePath], {
    encoding: "utf8",
    env: {
      ...process.env,
      CLY_RELEASE_VERSION: "v0.5.0",
      CLY_UPDATE_FEED_URL: feedUrl,
    },
  });
}

describe("update metadata URL rewriting", () => {
  it("rewrites relative paths and absolute HTTPS URLs onto the configured feed", () => {
    const filePath = createMetadata(`version: 0.5.0
files:
  - url: Cly-0.5.0.dmg
path: 'https://legacy.example.com/private/Cly-0.5.0.zip?token=secret'
`);

    const result = rewrite(filePath);

    expect(result.status).toBe(0);
    expect(readFileSync(filePath, "utf8")).toBe(`version: 0.5.0
files:
  - url: 'https://updates.example.com/releases/versions/v0.5.0/Cly-0.5.0.dmg'
path: 'https://updates.example.com/releases/versions/v0.5.0/Cly-0.5.0.zip'
`);
  });

  it("rejects insecure absolute artifact URLs without writing the file", () => {
    const original = `version: 0.5.0
path: http://downloads.example.com/Cly-0.5.0.zip
`;
    const filePath = createMetadata(original);

    const result = rewrite(filePath);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must use HTTPS");
    expect(readFileSync(filePath, "utf8")).toBe(original);
  });

  it("rejects credentials in the configured public feed URL", () => {
    const original = "path: Cly-0.5.0.zip\n";
    const filePath = createMetadata(original);

    const result = rewrite(
      filePath,
      "https://release-user:secret@updates.example.com/releases",
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must not contain credentials");
    expect(readFileSync(filePath, "utf8")).toBe(original);
  });

  it("requires a version tag so metadata cannot point at a mutable artifact path", () => {
    const original = "path: Cly-0.5.0.zip\n";
    const filePath = createMetadata(original);

    const result = spawnSync(process.execPath, [scriptPath, filePath], {
      encoding: "utf8",
      env: {
        ...process.env,
        CLY_RELEASE_VERSION: "main",
        CLY_UPDATE_FEED_URL: "https://updates.example.com/releases",
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must be a version tag");
    expect(readFileSync(filePath, "utf8")).toBe(original);
  });
});
