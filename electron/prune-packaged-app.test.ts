// @vitest-environment node

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const prunePackagedApp = require("../scripts/prune-packaged-app.cjs")
  .default as (context: {
  appOutDir: string;
  arch: number;
  electronPlatformName: string;
  packager: { appInfo: { productFilename: string } };
}) => Promise<void>;

const originalEnvironment = {
  CI: process.env.CI,
  CLY_UPDATE_FEED_URL: process.env.CLY_UPDATE_FEED_URL,
};
const temporaryDirectories: string[] = [];

beforeEach(() => {
  delete process.env.CI;
  delete process.env.CLY_UPDATE_FEED_URL;
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createContext() {
  const appOutDir = await mkdtemp(path.join(tmpdir(), "cly-package-"));
  temporaryDirectories.push(appOutDir);
  await mkdir(path.join(appOutDir, "resources"));
  return {
    appOutDir,
    arch: 1,
    electronPlatformName: "linux",
    packager: { appInfo: { productFilename: "Cly" } },
  };
}

describe("packaged update feed configuration", () => {
  it("embeds an HTTPS update feed", async () => {
    process.env.CLY_UPDATE_FEED_URL = "https://updates.example.com/releases/";
    const context = await createContext();

    await prunePackagedApp(context);

    await expect(
      readFile(
        path.join(context.appOutDir, "resources/app-update.yml"),
        "utf8",
      ),
    ).resolves.toContain("url: https://updates.example.com/releases");
  });

  it("rejects HTTP feeds for packaged applications, including localhost", async () => {
    process.env.CLY_UPDATE_FEED_URL = "http://127.0.0.1:4321/releases";
    const context = await createContext();

    await expect(prunePackagedApp(context)).rejects.toThrow(
      "must use HTTPS for packaged applications",
    );
  });

  it("rejects credential-bearing packaged feed URLs", async () => {
    process.env.CLY_UPDATE_FEED_URL =
      "https://release-user:secret@updates.example.com/releases";
    const context = await createContext();

    await expect(prunePackagedApp(context)).rejects.toThrow(
      "must not contain credentials",
    );
  });
});
