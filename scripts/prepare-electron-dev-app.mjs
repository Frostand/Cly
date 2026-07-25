import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const APP_NAME = "Cly";

if (process.platform !== "darwin") {
  process.exit(0);
}

const require = createRequire(import.meta.url);
const electronPackagePath = require.resolve("electron/package.json");
const electronPackageDir = dirname(electronPackagePath);
const electronAppPath = join(electronPackageDir, "dist", "Electron.app");
const infoPlistPath = join(electronAppPath, "Contents", "Info.plist");
const clyIconPath = join(
  import.meta.dirname,
  "..",
  "build",
  "icons",
  "icon.icns",
);
const electronResourcesPath = join(electronAppPath, "Contents", "Resources");
const devIconPath = join(electronResourcesPath, "cly.icns");

if (!existsSync(infoPlistPath)) {
  process.exit(0);
}

function readPlistValue(key) {
  try {
    return execFileSync(
      "/usr/bin/plutil",
      ["-extract", key, "raw", infoPlistPath],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
  } catch {
    return "";
  }
}

function replacePlistValue(key, value) {
  if (readPlistValue(key) === value) {
    return false;
  }

  execFileSync("/usr/bin/plutil", [
    "-replace",
    key,
    "-string",
    value,
    infoPlistPath,
  ]);
  return true;
}

const didUpdateDisplayName = replacePlistValue("CFBundleDisplayName", APP_NAME);
const didUpdateName = replacePlistValue("CFBundleName", APP_NAME);
const didUpdateIconName = replacePlistValue("CFBundleIconFile", "cly.icns");
let didUpdateIcon = false;
if (existsSync(clyIconPath)) {
  copyFileSync(clyIconPath, devIconPath);
  didUpdateIcon = true;
}
const didUpdate =
  didUpdateDisplayName || didUpdateName || didUpdateIconName || didUpdateIcon;

if (didUpdate) {
  execFileSync("/usr/bin/touch", [electronAppPath]);
  console.log(`prepared Electron dev app bundle name as ${APP_NAME}`);
}
