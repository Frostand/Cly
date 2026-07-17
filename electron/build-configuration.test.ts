import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const entitlementPath = "build/entitlements.mac.plist";
const requiredEntitlements = ["com.apple.security.cs.allow-jit"];

describe("macOS build configuration", () => {
  it("uses the Cly hardened-runtime entitlements for the app and helpers", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ) as {
      build?: {
        mac?: {
          entitlements?: string;
          entitlementsInherit?: string;
          hardenedRuntime?: boolean;
        };
      };
    };
    const mac = packageJson.build?.mac;
    if (!mac) {
      throw new Error("package.json is missing the macOS build configuration.");
    }

    expect(mac.hardenedRuntime).toBe(true);
    expect(mac.entitlements).toBe(entitlementPath);
    expect(mac.entitlementsInherit).toBe(entitlementPath);

    const entitlements = readFileSync(path.join(root, entitlementPath), "utf8");
    const configuredKeys = [
      ...entitlements.matchAll(/<key>([^<]+)<\/key>/g),
    ].map(([, key]) => key);

    expect(configuredKeys).toEqual(requiredEntitlements);
    for (const entitlement of requiredEntitlements) {
      expect(entitlements).toMatch(
        new RegExp(
          `<key>${entitlement.replaceAll(".", "\\.")}</key>\\s*<true/>`,
        ),
      );
    }
  });
});
