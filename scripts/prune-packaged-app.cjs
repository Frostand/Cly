const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const UNUSED_MAC_PRIVACY_KEYS = [
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

function getUpdateFeedUrl() {
  const rawUrl = process.env.CLY_UPDATE_FEED_URL?.trim();

  if (rawUrl) {
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
      throw new Error(
        "CLY_UPDATE_FEED_URL must use HTTPS for packaged applications.",
      );
    }

    const normalizedPath = url.pathname.replace(/\/+$/, "");
    url.pathname = normalizedPath || "/";
    const normalized = url.toString();
    return normalizedPath ? normalized : normalized.replace(/\/(?=[?#]|$)/, "");
  }

  if (process.env.CI === "true") {
    throw new Error(
      "Missing CLY_UPDATE_FEED_URL. Set it to the public R2 releases URL, for example https://downloads.example.com/releases.",
    );
  }

  return null;
}

function getAppUpdateYml() {
  const updateFeedUrl = getUpdateFeedUrl();
  if (!updateFeedUrl) {
    return null;
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

async function pruneScopedNativePackages(parentPath, keepNames) {
  const names = await readDirectoryNames(parentPath);
  for (const name of names) {
    if (!keepNames.has(name)) {
      await removeIfExists(path.join(parentPath, name));
    }
  }
}

function nativePackageKeepNames(platform, arch) {
  const architectures = arch === "universal" ? ["arm64", "x64"] : [arch];
  const anthropic = new Set();
  const parcel = new Set();
  const swc = new Set();

  for (const targetArch of architectures) {
    if (platform === "darwin") {
      anthropic.add(`claude-agent-sdk-darwin-${targetArch}`);
      parcel.add(`watcher-darwin-${targetArch}`);
      swc.add(`core-darwin-${targetArch}`);
    } else if (platform === "linux") {
      anthropic.add(`claude-agent-sdk-linux-${targetArch}`);
      parcel.add(`watcher-linux-${targetArch}-glibc`);
      swc.add(`core-linux-${targetArch}-gnu`);
    } else if (platform === "win32") {
      parcel.add(`watcher-win32-${targetArch}`);
      swc.add(`core-win32-${targetArch}-msvc`);
    }
  }

  return { anthropic, parcel, swc };
}

async function ensureAppUpdateConfig(resourcesDir) {
  const updateConfigPath = path.join(resourcesDir, "app-update.yml");
  const appUpdateYml = getAppUpdateYml();
  if (!appUpdateYml) {
    await removeIfExists(updateConfigPath);
    console.log(
      "Skipped app-update.yml for a local development package without CLY_UPDATE_FEED_URL.",
    );
    return;
  }

  await fs.writeFile(updateConfigPath, appUpdateYml, "utf8");
}

async function removeUnusedMacPrivacyDescriptions(context) {
  if (context.electronPlatformName !== "darwin") return;
  const infoPlist = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
    "Info.plist",
  );
  for (const key of UNUSED_MAC_PRIVACY_KEYS) {
    try {
      await execFileAsync("/usr/bin/plutil", ["-remove", key, infoPlist]);
    } catch (error) {
      if (!String(error?.stderr ?? "").includes("does not exist")) throw error;
    }
  }
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

exports.default = async function prunePackagedApp(context) {
  const platform = context.electronPlatformName;
  const arch = getTargetArch(context);
  const resourcesDir = getResourcesDirectory(context);

  await ensureAppUpdateConfig(resourcesDir);
  await removeUnusedMacPrivacyDescriptions(context);

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
  const nativePackages = nativePackageKeepNames(platform, arch);

  await Promise.all([
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
    pruneScopedNativePackages(
      path.join(unpackedNodeModules, "@anthropic-ai"),
      nativePackages.anthropic,
    ),
    pruneScopedNativePackages(
      path.join(unpackedNodeModules, "@parcel"),
      nativePackages.parcel,
    ),
    pruneScopedNativePackages(
      path.join(unpackedNodeModules, "@swc"),
      nativePackages.swc,
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
