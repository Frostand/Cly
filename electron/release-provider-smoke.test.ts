// @vitest-environment node
import { describe, expect, it } from "vitest";
import { canBypassNativeCommandConfirmationForReleaseSmoke } from "./release-provider-smoke.js";

describe("release provider smoke native-confirmation boundary", () => {
  it("permits the headless test harness only when both explicit flags are set", () => {
    expect(
      canBypassNativeCommandConfirmationForReleaseSmoke({
        isPackaged: false,
        environment: {
          CLY_E2E: "1",
          CLY_RELEASE_PROVIDER_SMOKE: "1",
        },
      }),
    ).toBe(true);
  });

  it("never permits a packaged build or partial test configuration", () => {
    expect(
      canBypassNativeCommandConfirmationForReleaseSmoke({
        isPackaged: true,
        environment: {
          CLY_E2E: "1",
          CLY_RELEASE_PROVIDER_SMOKE: "1",
        },
      }),
    ).toBe(false);
    expect(
      canBypassNativeCommandConfirmationForReleaseSmoke({
        isPackaged: false,
        environment: { CLY_E2E: "1" },
      }),
    ).toBe(false);
    expect(
      canBypassNativeCommandConfirmationForReleaseSmoke({
        isPackaged: false,
        environment: { CLY_RELEASE_PROVIDER_SMOKE: "1" },
      }),
    ).toBe(false);
  });
});
