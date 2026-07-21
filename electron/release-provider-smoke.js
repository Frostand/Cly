/**
 * The authenticated provider smoke runs from an unpackaged source tree on a
 * protected release runner. It must exercise the durable provider approval
 * flow, but cannot interact with Electron's native modal in headless CI.
 *
 * Packaged applications always retain the native confirmation. The bypass also
 * requires both explicit test-only flags, so ordinary local development and
 * every distributable build continue to require host confirmation.
 */
export const canBypassNativeCommandConfirmationForReleaseSmoke = ({
  environment = process.env,
  isPackaged,
} = {}) =>
  isPackaged !== true &&
  environment.CLY_E2E === "1" &&
  environment.CLY_RELEASE_PROVIDER_SMOKE === "1";
