import { describe, expect, it } from "vitest";
import {
  CLY_DEVELOPMENT_USER_DATA_DIR,
  CLY_PACKAGED_USER_DATA_DIR,
  resolveClyUserDataPath,
} from "./app-data-path.js";

describe("Cly application data path", () => {
  it("keeps public installs separate from development and demo profiles", () => {
    expect(
      resolveClyUserDataPath({
        appDataPath: "/tmp/application-support",
        isPackaged: true,
      }),
    ).toBe(`/tmp/application-support/${CLY_PACKAGED_USER_DATA_DIR}`);
    expect(
      resolveClyUserDataPath({
        appDataPath: "/tmp/application-support",
        isPackaged: false,
      }),
    ).toBe(`/tmp/application-support/${CLY_DEVELOPMENT_USER_DATA_DIR}`);
  });

  it("uses an explicit isolated E2E profile", () => {
    expect(
      resolveClyUserDataPath({
        appDataPath: "/ignored",
        isPackaged: true,
        isolatedE2eUserDataPath: "/tmp/cly-e2e",
      }),
    ).toBe("/tmp/cly-e2e");
  });
});
