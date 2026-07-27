import path from "node:path";

export const CLY_PACKAGED_USER_DATA_DIR = "cly-desktop";
export const CLY_DEVELOPMENT_USER_DATA_DIR = "cly-development";

/**
 * Keep public installs isolated from source-built demo and development data.
 * Explicit E2E paths remain authoritative so packaged smoke tests stay
 * hermetic and never touch a researcher's real Cly profile.
 */
export function resolveClyUserDataPath({
  appDataPath,
  isPackaged,
  isolatedE2eUserDataPath = "",
}) {
  const isolatedPath = isolatedE2eUserDataPath.trim();
  if (isolatedPath) return isolatedPath;
  return path.join(
    appDataPath,
    isPackaged ? CLY_PACKAGED_USER_DATA_DIR : CLY_DEVELOPMENT_USER_DATA_DIR,
  );
}
