const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const UNUSED_MAC_PRIVACY_USAGE_KEYS = [
  "NSAudioCaptureUsageDescription",
  "NSBluetoothAlwaysUsageDescription",
  "NSBluetoothPeripheralUsageDescription",
  "NSCameraUsageDescription",
  "NSMicrophoneUsageDescription",
];

const ARCH_BY_NUMBER = {
  1: "x64",
  3: "arm64",
  4: "universal",
};

const PLATFORM_VENDOR_DIRS = {
  darwin: {
    arm64: new Set(["arm64-darwin", "darwin-arm64"]),
    x64: new Set(["darwin-x64", "x64-darwin"]),
    universal: new Set([
      "arm64-darwin",
      "darwin-arm64",
      "darwin-x64",
      "x64-darwin",
    ]),
  },
  linux: {
    arm64: new Set(["arm64-linux", "linux-arm64"]),
    x64: new Set(["linux-x64", "x64-linux"]),
    universal: new Set([
      "arm64-linux",
      "linux-arm64",
      "linux-x64",
      "x64-linux",
    ]),
  },
  win32: {
    arm64: new Set(["arm64-win32", "win32-arm64"]),
    x64: new Set(["win32-x64", "x64-win32"]),
    universal: new Set([
      "arm64-win32",
      "win32-arm64",
      "win32-x64",
      "x64-win32",
    ]),
  },
};

const SCOPED_NATIVE_PACKAGE_PREFIXES = {
  "@anthropic-ai": "claude-agent-sdk-",
  "@parcel": "watcher-",
  "@swc": "core-",
};

function getUpdateFeedUrl() {
  const rawUrl = process.env.CLY_UPDATE_FEED_URL?.trim();
  return rawUrl ? rawUrl.replace(/\/+$/, "") : null;
}

function getAppUpdateYml() {
  const updateFeedUrl = getUpdateFeedUrl();
  if (!updateFeedUrl) {
    return `provider: github
owner: Frostand
repo: Cly
updaterCacheDirName: cly-updater
`;
  }

  return `provider: generic
url: ${updateFeedUrl}
updaterCacheDirName: cly-updater
`;
}

const SHARP_PLATFORM_PACKAGE_PATTERN =
  /^(sharp|sharp-libvips)-(darwin|linux|linuxmusl|win32)-(arm64|x64|ia32|arm)$/;

const normalizePath = (value) => value.replace(/\\/g, "/");

async function removeIfExists(targetPath) {
  await fs.rm(targetPath, { force: true, recursive: true });
}

async function readDirectoryNames(parentPath) {
  try {
    const entries = await fs.readdir(parentPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function getTargetArch(context) {
  const appOutDir = normalizePath(context.appOutDir).toLowerCase();
  if (appOutDir.includes("universal")) {
    return "universal";
  }

  const arch = ARCH_BY_NUMBER[context.arch] ?? context.arch;
  if (arch === "arm64" || arch === "x64" || arch === "universal") {
    return arch;
  }

  if (appOutDir.includes("arm64")) {
    return "arm64";
  }
  if (appOutDir.includes("x64")) {
    return "x64";
  }

  return "universal";
}

function isUniversalTempBuild(context) {
  const appOutDir = normalizePath(context.appOutDir).toLowerCase();
  return appOutDir.includes("universal") && appOutDir.includes("-temp");
}

function getPlatformVendorKeepNames(platform, arch) {
  return (
    PLATFORM_VENDOR_DIRS[platform]?.[arch] ??
    PLATFORM_VENDOR_DIRS[platform]?.universal ??
    new Set()
  );
}

function getScopedNativePackageKeepNames(platform, arch) {
  const architectures = arch === "universal" ? ["arm64", "x64"] : [arch];
  const result = {
    "@anthropic-ai": new Set(),
    "@parcel": new Set(),
    "@swc": new Set(),
  };

  for (const targetArch of architectures) {
    if (platform === "darwin") {
      result["@anthropic-ai"].add(`claude-agent-sdk-darwin-${targetArch}`);
      result["@parcel"].add(`watcher-darwin-${targetArch}`);
      result["@swc"].add(`core-darwin-${targetArch}`);
    } else if (platform === "linux") {
      result["@anthropic-ai"].add(`claude-agent-sdk-linux-${targetArch}`);
      result["@parcel"].add(`watcher-linux-${targetArch}-glibc`);
      result["@swc"].add(`core-linux-${targetArch}-gnu`);
    } else if (platform === "win32") {
      result["@anthropic-ai"].add(`claude-agent-sdk-win32-${targetArch}`);
      result["@parcel"].add(`watcher-win32-${targetArch}`);
      result["@swc"].add(`core-win32-${targetArch}-msvc`);
    }
  }

  return result;
}

async function pruneScopedNativePackages(nodeModulesPath, platform, arch) {
  const keepByScope = getScopedNativePackageKeepNames(platform, arch);
  for (const [scope, prefix] of Object.entries(
    SCOPED_NATIVE_PACKAGE_PREFIXES,
  )) {
    const scopePath = path.join(nodeModulesPath, scope);
    const names = await readDirectoryNames(scopePath);
    for (const name of names) {
      if (!name.startsWith(prefix) || keepByScope[scope].has(name)) {
        continue;
      }
      await removeIfExists(path.join(scopePath, name));
    }
  }
}

async function prunePlatformVendorDirectory(parentPath, platform, arch) {
  const keepNames = getPlatformVendorKeepNames(platform, arch);
  const names = await readDirectoryNames(parentPath);
  for (const name of names) {
    if (keepNames.has(name)) {
      continue;
    }

    if (/(^|[-_])(darwin|linux|win32)([-_]|$)/.test(name)) {
      await removeIfExists(path.join(parentPath, name));
      continue;
    }

    if (/^(arm64|x64|ia32)-/.test(name)) {
      await removeIfExists(path.join(parentPath, name));
    }
  }
}

async function pruneSharpOptionalDependencies(parentPath, platform, arch) {
  const names = await readDirectoryNames(parentPath);
  for (const name of names) {
    const match = name.match(SHARP_PLATFORM_PACKAGE_PATTERN);
    if (!match) {
      continue;
    }

    const packagePlatform = match[2];
    const packageArch = match[3];
    const platformMatches = packagePlatform === platform;
    const archMatches = arch === "universal" || packageArch === arch;

    if (!platformMatches || !archMatches) {
      await removeIfExists(path.join(parentPath, name));
    }
  }
}

async function ensureAppUpdateConfig(resourcesDir) {
  const updateConfigPath = path.join(resourcesDir, "app-update.yml");
  const appUpdateYml = getAppUpdateYml();
  await fs.writeFile(updateConfigPath, appUpdateYml, "utf8");
}

function getResourcesDirectory(context) {
  if (context.electronPlatformName === "darwin") {
    return path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      "Contents",
      "Resources",
    );
  }

  return path.join(context.appOutDir, "resources");
}

async function removeUnusedMacPrivacyUsageDescriptions(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const infoPlistPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
    "Info.plist",
  );

  for (const key of UNUSED_MAC_PRIVACY_USAGE_KEYS) {
    try {
      await execFileAsync("/usr/bin/plutil", ["-remove", key, infoPlistPath]);
    } catch (error) {
      const detail = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`;
      if (!/no value at that key path|does not exist/i.test(detail)) {
        throw error;
      }
    }
  }
}

exports.default = async function prunePackagedApp(context) {
  const platform = context.electronPlatformName;
  const arch = getTargetArch(context);
  const resourcesDir = getResourcesDirectory(context);

  await ensureAppUpdateConfig(resourcesDir);
  await removeUnusedMacPrivacyUsageDescriptions(context);

  if (platform === "darwin" && isUniversalTempBuild(context)) {
    console.log(
      `Skipped native vendor pruning for ${platform}/${arch} temp app at ${normalizePath(resourcesDir)}`,
    );
    return;
  }

  const unpackedNodeModules = path.join(
    resourcesDir,
    "app.asar.unpacked",
    "node_modules",
  );

  await Promise.all([
    pruneScopedNativePackages(unpackedNodeModules, platform, arch),
    prunePlatformVendorDirectory(
      path.join(
        unpackedNodeModules,
        "@anthropic-ai",
        "claude-agent-sdk",
        "vendor",
        "audio-capture",
      ),
      platform,
      arch,
    ),
    prunePlatformVendorDirectory(
      path.join(
        unpackedNodeModules,
        "@anthropic-ai",
        "claude-agent-sdk",
        "vendor",
        "ripgrep",
      ),
      platform,
      arch,
    ),
    prunePlatformVendorDirectory(
      path.join(
        unpackedNodeModules,
        "@anthropic-ai",
        "claude-agent-sdk",
        "vendor",
        "tree-sitter-bash",
      ),
      platform,
      arch,
    ),
    prunePlatformVendorDirectory(
      path.join(unpackedNodeModules, "node-pty", "prebuilds"),
      platform,
      arch,
    ),
    pruneSharpOptionalDependencies(
      path.join(unpackedNodeModules, "@img"),
      platform,
      arch,
    ),
    removeIfExists(path.join(unpackedNodeModules, "node-pty", "scripts")),
    removeIfExists(path.join(unpackedNodeModules, "node-pty", "src")),
    removeIfExists(
      path.join(unpackedNodeModules, "node-pty", "deps", ".editorconfig"),
    ),
  ]);

  if (platform !== "win32") {
    await removeIfExists(
      path.join(unpackedNodeModules, "node-pty", "deps", "winpty"),
    );
  }

  console.log(
    `Pruned packaged native vendor files for ${platform}/${arch} at ${normalizePath(resourcesDir)}`,
  );
};

exports.getScopedNativePackageKeepNames = getScopedNativePackageKeepNames;
exports.UNUSED_MAC_PRIVACY_USAGE_KEYS = UNUSED_MAC_PRIVACY_USAGE_KEYS;
exports.removeUnusedMacPrivacyUsageDescriptions =
  removeUnusedMacPrivacyUsageDescriptions;
