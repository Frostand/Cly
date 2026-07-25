import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const forbiddenMacPrivacyKeys = [
  "NSAudioCaptureUsageDescription",
  "NSBluetoothAlwaysUsageDescription",
  "NSBluetoothPeripheralUsageDescription",
  "NSCameraUsageDescription",
  "NSMicrophoneUsageDescription",
];
const forbiddenPackagePath =
  /(?:^|\/)(?:test|tests|__tests__|mock|mocks|__mocks__)(?:\/|$)|\.(?:test|spec)\.(?:js|cjs|mjs|jsx|ts|tsx)(?:\.map)?$|\.map$|\.(?:ts|tsx)$/i;
const forbiddenUnpackedDevelopmentPath =
  /(?:^|\/)node_modules\/node-pty\/(?:scripts|src)(?:\/|$)|(?:^|\/)node_modules\/node-pty\/deps\/\.editorconfig$/i;

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function findDefaultApplication() {
  const candidates =
    process.platform === "darwin"
      ? ["release/mac-arm64/Cly.app", "release/mac/Cly.app"]
      : process.platform === "win32"
        ? ["release/win-unpacked"]
        : ["release/linux-unpacked"];
  return candidates.map((entry) => path.join(root, entry)).find(existsSync);
}

function getApplicationLayout(applicationPath) {
  if (applicationPath.endsWith(".app")) {
    return {
      infoPlist: path.join(applicationPath, "Contents", "Info.plist"),
      resources: path.join(applicationPath, "Contents", "Resources"),
    };
  }

  return {
    infoPlist: null,
    resources: path.join(applicationPath, "resources"),
  };
}

function getAsarApi() {
  const electronBuilderPackage = require.resolve(
    "electron-builder/package.json",
  );
  const asarPath = require.resolve("@electron/asar", {
    paths: [path.dirname(electronBuilderPackage)],
  });
  return require(asarPath);
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  const visit = (currentPath) => {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) visit(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  };
  visit(directory);
  return files;
}

const requestedApp = readArgument("--app");
const applicationPath = path.resolve(
  root,
  requestedApp || findDefaultApplication() || "release/missing-unpacked-app",
);
if (!existsSync(applicationPath)) {
  throw new Error(
    `Packaged application not found at ${applicationPath}. Pass --app <path>.`,
  );
}

const { infoPlist, resources } = getApplicationLayout(applicationPath);
const asarPath = path.join(resources, "app.asar");
if (!statSync(asarPath).isFile()) {
  throw new Error(`Packaged ASAR not found at ${asarPath}.`);
}

const archiveFiles = getAsarApi().listPackage(asarPath);
const unpackedRoot = path.join(resources, "app.asar.unpacked");
const unpackedFiles = listFiles(unpackedRoot).map((entry) =>
  path.relative(unpackedRoot, entry).replaceAll(path.sep, "/"),
);
const forbiddenFiles = [...archiveFiles, ...unpackedFiles].filter((entry) =>
  forbiddenPackagePath.test(entry),
);
if (forbiddenFiles.length > 0) {
  throw new Error(
    `Packaged application contains tests, mocks, TypeScript, or source maps:\n${forbiddenFiles
      .slice(0, 50)
      .map((entry) => `- ${entry}`)
      .join("\n")}`,
  );
}

const unpackedDevelopmentFiles = unpackedFiles.filter((entry) =>
  forbiddenUnpackedDevelopmentPath.test(entry),
);
if (unpackedDevelopmentFiles.length > 0) {
  throw new Error(
    `Packaged application contains unpacked build-only native dependency files:\n${unpackedDevelopmentFiles
      .slice(0, 50)
      .map((entry) => `- ${entry}`)
      .join("\n")}`,
  );
}

for (const requiredPath of [
  "/dist/index.html",
  "/electron/api/app.js",
  "/electron/main.js",
  "/electron/preload.cjs",
  "/node_modules/@opencode-ai/sdk/package.json",
  "/node_modules/ai-sdk-provider-claude-code/package.json",
  "/node_modules/node-pty/package.json",
  "/package.json",
]) {
  if (!archiveFiles.includes(requiredPath)) {
    throw new Error(
      `Required packaged runtime file is missing: ${requiredPath}`,
    );
  }
}

if (!unpackedFiles.some((entry) => /(?:^|\/)pty\.node$/i.test(entry))) {
  throw new Error("Packaged node-pty native binary is missing.");
}

if (infoPlist) {
  const plist = readFileSync(infoPlist);
  const plistText = plist.toString("latin1");
  const leakedKeys = forbiddenMacPrivacyKeys.filter((key) =>
    plistText.includes(key),
  );
  if (leakedKeys.length > 0) {
    throw new Error(
      `Packaged Info.plist contains unused privacy descriptions: ${leakedKeys.join(", ")}`,
    );
  }
}

console.log(
  `Packaged content check passed (${archiveFiles.length} ASAR entries, ${unpackedFiles.length} unpacked files) for ${applicationPath}.`,
);
