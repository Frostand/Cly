// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  sendSync: vi.fn(() => "production-session-token"),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Electron preload API session authority", () => {
  it("exposes the per-launch API token in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const source = await readFile(
      path.join(process.cwd(), "electron/preload.cjs"),
      "utf8",
    );
    vm.runInNewContext(source, {
      console,
      document,
      process,
      require: (specifier: string) => {
        expect(specifier).toBe("electron");
        return {
          contextBridge: {
            exposeInMainWorld: electronMocks.exposeInMainWorld,
          },
          ipcRenderer: {
            invoke: electronMocks.invoke,
            on: electronMocks.on,
            removeListener: electronMocks.removeListener,
            sendSync: electronMocks.sendSync,
          },
        };
      },
      window,
    });

    expect(electronMocks.sendSync).toHaveBeenCalledWith(
      "api:get-session-token",
    );
    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith(
      "dream",
      expect.objectContaining({
        apiSessionToken: "production-session-token",
        isElectron: true,
      }),
    );
  });
});
