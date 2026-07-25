// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkCursorAuthentication: vi.fn(),
  checkOpenCodeAuthentication: vi.fn(),
  execCliCommand: vi.fn(),
  execCursorCliCommand: vi.fn(),
  fetchOpenCodeContextWindowsFromModelsDev: vi.fn(),
  getCliVersion: vi.fn(),
  getCursorCliVersion: vi.fn(),
}));

vi.mock("../shared/cli.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../shared/cli.js")>()),
  execCliCommand: mocks.execCliCommand,
  getCliVersion: mocks.getCliVersion,
}));
vi.mock("./cursor-cli.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./cursor-cli.js")>()),
  execCursorCliCommand: mocks.execCursorCliCommand,
  getCursorCliVersion: mocks.getCursorCliVersion,
}));
vi.mock("./provider-health.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./provider-health.js")>()),
  checkCursorAuthentication: mocks.checkCursorAuthentication,
  checkOpenCodeAuthentication: mocks.checkOpenCodeAuthentication,
}));
vi.mock("./model-options.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./model-options.js")>()),
  fetchOpenCodeContextWindowsFromModelsDev:
    mocks.fetchOpenCodeContextWindowsFromModelsDev,
}));

import { fetchCursorModels, fetchOpenCodeModels } from "./provider-models.js";

describe("bounded provider model discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCliVersion.mockResolvedValue("1.0.0");
    mocks.getCursorCliVersion.mockResolvedValue("1.0.0");
    mocks.fetchOpenCodeContextWindowsFromModelsDev.mockResolvedValue(new Map());
  });

  it("distinguishes a logged-out Cursor install without inventing models", async () => {
    mocks.checkCursorAuthentication.mockResolvedValue({
      authenticated: false,
      installed: true,
    });

    await expect(fetchCursorModels({ force: true })).resolves.toMatchObject({
      installed: true,
      models: [],
      source: "unavailable",
    });
    expect(mocks.execCursorCliCommand).not.toHaveBeenCalled();
    expect(mocks.checkCursorAuthentication).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
    });
  });

  it("bounds OpenCode discovery and returns only a real last-good catalog offline", async () => {
    mocks.checkOpenCodeAuthentication.mockResolvedValue({
      authenticated: true,
      installed: true,
    });
    mocks.execCliCommand.mockResolvedValueOnce({
      stderr: "",
      stdout: "provider/observed-model\n",
    });

    const observed = await fetchOpenCodeModels({ force: true });
    expect(observed.models.map((model) => model.id)).toEqual([
      "provider/observed-model",
    ]);
    expect(mocks.execCliCommand).toHaveBeenLastCalledWith(
      "opencode",
      ["models", "--refresh"],
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        timeout: 10_000,
      }),
    );

    mocks.execCliCommand.mockRejectedValueOnce(new Error("offline"));
    const offline = await fetchOpenCodeModels({ force: true });
    expect(offline.models.map((model) => model.id)).toEqual([
      "provider/observed-model",
    ]);
    expect(offline.error).toMatch(/offline.*last known catalog/i);
    expect(offline.models.some((model) => model.id.includes("deepseek"))).toBe(
      false,
    );
  });
});
