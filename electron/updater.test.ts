// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updaterMocks = vi.hoisted(() => {
  const baseComputeFinalHeaders = vi.fn((headers = {}) => ({
    ...headers,
    "x-user-staging-id": "generated-staging-id",
  }));
  return {
    autoUpdater: {
      checkForUpdates: vi.fn(async () => ({})),
      computeFinalHeaders: baseComputeFinalHeaders,
      on: vi.fn(),
      quitAndInstall: vi.fn(),
      setFeedURL: vi.fn(),
    },
    baseComputeFinalHeaders,
  };
});

vi.mock("electron-updater", () => ({
  default: { autoUpdater: updaterMocks.autoUpdater },
}));

import { initializeAutoUpdater } from "./updater.js";

const originalEnvironment = {
  CLY_DEV_UPDATE_CURRENT_VERSION: process.env.CLY_DEV_UPDATE_CURRENT_VERSION,
  CLY_ENABLE_DEV_UPDATES: process.env.CLY_ENABLE_DEV_UPDATES,
  CLY_UPDATE_FEED_URL: process.env.CLY_UPDATE_FEED_URL,
};
const temporaryDirectories: string[] = [];

function restoreEnvironment() {
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  updaterMocks.autoUpdater.checkForUpdates.mockClear();
  updaterMocks.autoUpdater.checkForUpdates.mockResolvedValue({});
  updaterMocks.autoUpdater.computeFinalHeaders =
    updaterMocks.baseComputeFinalHeaders;
  updaterMocks.autoUpdater.on.mockClear();
  updaterMocks.autoUpdater.quitAndInstall.mockClear();
  updaterMocks.autoUpdater.setFeedURL.mockClear();
  delete process.env.CLY_DEV_UPDATE_CURRENT_VERSION;
  delete process.env.CLY_ENABLE_DEV_UPDATES;
  delete process.env.CLY_UPDATE_FEED_URL;
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  restoreEnvironment();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createHarness({
  isDevelopment,
  isPackaged,
}: {
  isDevelopment: boolean;
  isPackaged: boolean;
}) {
  const userData = await mkdtemp(path.join(tmpdir(), "cly-updater-"));
  temporaryDirectories.push(userData);
  const handlers = new Map<string, (...args: never[]) => unknown>();
  const app = {
    getPath: vi.fn(() => userData),
    getVersion: vi.fn(() => "0.5.0"),
    isPackaged,
    setVersion: vi.fn(),
  };
  const ipcMain = {
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
  const manager = initializeAutoUpdater({
    app,
    getMainWindow: () => null,
    installId: "stable-install-id-that-must-not-be-sent",
    ipcMain,
    isDevelopment,
  });
  return { app, handlers, manager };
}

describe("auto-updater feed security", () => {
  it("does not add the persistent install ID to feed queries or headers", async () => {
    process.env.CLY_UPDATE_FEED_URL = "https://updates.example.com/releases";
    const { handlers, manager } = await createHarness({
      isDevelopment: false,
      isPackaged: true,
    });

    await handlers.get("updates:check")?.();

    const configuration =
      updaterMocks.autoUpdater.setFeedURL.mock.lastCall?.[0];
    expect(configuration?.url).toMatch(
      /^https:\/\/updates\.example\.com\/releases\?/,
    );
    expect(configuration?.url.toLowerCase()).not.toContain("installid");
    expect(configuration?.requestHeaders).not.toHaveProperty(
      "X-Cly-Install-Id",
    );
    expect(JSON.stringify(configuration)).not.toContain(
      "stable-install-id-that-must-not-be-sent",
    );
    manager.stop();
  });

  it("disables packaged production updates for a non-HTTPS feed", async () => {
    process.env.CLY_UPDATE_FEED_URL = "http://updates.example.com/releases";
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { handlers } = await createHarness({
      isDevelopment: false,
      isPackaged: true,
    });

    expect(handlers.get("updates:get-status")?.()).toMatchObject({
      enabled: false,
      state: "disabled",
    });
    expect(updaterMocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("HTTPS"));
  });

  it("rejects feed base URLs that could embed credentials", async () => {
    process.env.CLY_UPDATE_FEED_URL =
      "https://release-user:secret@updates.example.com/releases?token=secret";
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { handlers } = await createHarness({
      isDevelopment: false,
      isPackaged: true,
    });

    expect(handlers.get("updates:get-status")?.()).toMatchObject({
      enabled: false,
      state: "disabled",
    });
    expect(updaterMocks.autoUpdater.setFeedURL).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("credentials"),
    );
  });

  it("permits HTTP loopback feeds only for explicit development updates", async () => {
    process.env.CLY_ENABLE_DEV_UPDATES = "1";
    process.env.CLY_UPDATE_FEED_URL = "http://127.0.0.1:4321/releases";
    const { handlers, manager } = await createHarness({
      isDevelopment: true,
      isPackaged: false,
    });

    expect(handlers.get("updates:get-status")?.()).toMatchObject({
      enabled: true,
      state: "idle",
    });
    expect(updaterMocks.autoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: "generic",
      url: "http://127.0.0.1:4321/releases",
    });
    manager.stop();
  });

  it("rejects HTTP loopback feeds in a packaged app even with development flags", async () => {
    process.env.CLY_ENABLE_DEV_UPDATES = "1";
    process.env.CLY_UPDATE_FEED_URL = "http://127.0.0.1:4321/releases";
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { handlers } = await createHarness({
      isDevelopment: true,
      isPackaged: true,
    });

    expect(handlers.get("updates:get-status")?.()).toMatchObject({
      enabled: false,
      state: "disabled",
    });
    expect(updaterMocks.autoUpdater.setFeedURL).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("HTTPS"));
  });

  it("rejects a non-loopback HTTP feed even in development", async () => {
    process.env.CLY_ENABLE_DEV_UPDATES = "1";
    process.env.CLY_UPDATE_FEED_URL = "http://updates.example.com/releases";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { handlers } = await createHarness({
      isDevelopment: true,
      isPackaged: false,
    });

    expect(handlers.get("updates:get-status")?.()).toMatchObject({
      enabled: false,
      state: "disabled",
    });
    expect(updaterMocks.autoUpdater.setFeedURL).not.toHaveBeenCalled();
  });
});
