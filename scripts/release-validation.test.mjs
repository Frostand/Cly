import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const verifier = path.join(root, "scripts", "verify-release-artifacts.mjs");
const tagValidator = path.join(root, "scripts", "validate-release-tag.mjs");
const temporaryDirectories = [];
const feedUrl = "https://updates.example.com/releases";
const releaseTag = "v0.5.0";

test.afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createBundle({ corruptWindowsHash = false } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "cly-release-validation-"));
  temporaryDirectories.push(directory);
  const artifacts = [
    ["Cly-0.5.0-windows-x64-setup.exe", "windows-installer"],
    ["Cly-0.5.0-mac-arm64.zip", "mac-update"],
    ["Cly-0.5.0-mac-arm64.dmg", "mac-installer"],
    ["Cly-0.5.0-linux-x64.AppImage", "linux-update"],
    ["Cly-0.5.0-linux-x64.deb", "linux-installer"],
  ];
  for (const [name, contents] of artifacts) {
    writeFileSync(path.join(directory, name), contents);
  }

  const metadata = [
    ["latest.yml", artifacts[0][0], corruptWindowsHash],
    ["latest-mac.yml", artifacts[1][0], false],
    ["latest-linux.yml", artifacts[3][0], false],
  ];
  for (const [metadataName, artifactName, corrupt] of metadata) {
    const bytes = readFileSync(path.join(directory, artifactName));
    const sha512 = corrupt
      ? "invalid-sha512"
      : createHash("sha512").update(bytes).digest("base64");
    const url = `${feedUrl}/versions/${releaseTag}/${artifactName}`;
    writeFileSync(
      path.join(directory, metadataName),
      `version: 0.5.0
files:
  - url: '${url}'
    sha512: ${sha512}
    size: ${bytes.byteLength}
path: '${url}'
sha512: ${sha512}
`,
    );
  }
  return directory;
}

function runVerifier(directory) {
  return spawnSync(process.execPath, [verifier, directory, "0.5.0"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CLY_RELEASE_VERSION: releaseTag,
      CLY_UPDATE_FEED_URL: feedUrl,
    },
  });
}

test("rejects updater metadata whose SHA-512 does not match its artifact", () => {
  const result = runVerifier(createBundle({ corruptWindowsHash: true }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid SHA-512.*windows/i);
});

test("validates every platform metadata file and writes a complete manifest", () => {
  const directory = createBundle();
  const result = runVerifier(directory);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(
    readFileSync(path.join(directory, "release-manifest.json"), "utf8"),
  );
  assert.equal(manifest.version, "0.5.0");
  assert.equal(manifest.releaseTag, releaseTag);
  assert.equal(manifest.artifacts.length, 8);
  assert.ok(
    manifest.artifacts.some(
      (artifact) =>
        artifact.name === "Cly-0.5.0-linux-x64.deb" &&
        artifact.sha256 ===
          createHash("sha256").update("linux-installer").digest("hex"),
    ),
  );
});

test("requires the release tag to equal package.json version", () => {
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json")));
  const valid = spawnSync(
    process.execPath,
    [tagValidator, `v${packageJson.version}`],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout.trim(), packageJson.version);

  const invalid = spawnSync(process.execPath, [tagValidator, "v99.99.99"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /does not match package\.json version/);
});
