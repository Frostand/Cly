// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { getScopedNativePackageKeepNames } =
  require("../scripts/prune-packaged-app.cjs") as {
    getScopedNativePackageKeepNames: (
      platform: string,
      arch: string,
    ) => Record<string, Set<string>>;
  };

describe("packaged native dependency pruning", () => {
  it("keeps only Apple Silicon packages in an arm64 macOS build", () => {
    const keep = getScopedNativePackageKeepNames("darwin", "arm64");

    expect([...keep["@anthropic-ai"]]).toEqual([
      "claude-agent-sdk-darwin-arm64",
    ]);
    expect([...keep["@parcel"]]).toEqual(["watcher-darwin-arm64"]);
    expect([...keep["@swc"]]).toEqual(["core-darwin-arm64"]);
  });

  it("keeps glibc-compatible packages in a Linux x64 build", () => {
    const keep = getScopedNativePackageKeepNames("linux", "x64");

    expect([...keep["@anthropic-ai"]]).toEqual(["claude-agent-sdk-linux-x64"]);
    expect([...keep["@parcel"]]).toEqual(["watcher-linux-x64-glibc"]);
    expect([...keep["@swc"]]).toEqual(["core-linux-x64-gnu"]);
  });

  it("keeps both architectures only for a universal macOS build", () => {
    const keep = getScopedNativePackageKeepNames("darwin", "universal");

    expect([...keep["@anthropic-ai"]]).toEqual([
      "claude-agent-sdk-darwin-arm64",
      "claude-agent-sdk-darwin-x64",
    ]);
  });
});
