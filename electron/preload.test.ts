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
  sendSync: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Electron preload API session authority", () => {
  it("does not expose the main-process API token to the renderer", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const source = await readFile(
      path.join(process.cwd(), "electron/preload.cjs"),
      "utf8",
    );
    vm.runInNewContext(source, {
      console,
      document,
      process: {
        argv: [process.execPath, "electron/preload.cjs"],
      },
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

    expect(electronMocks.sendSync).not.toHaveBeenCalled();
    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith(
      "dream",
      expect.objectContaining({
        isElectron: true,
      }),
    );
    expect(
      electronMocks.exposeInMainWorld.mock.calls[0]?.[1],
    ).not.toHaveProperty("apiSessionToken");

    const api = electronMocks.exposeInMainWorld.mock.calls[0]?.[1];
    await api.getWindowRole();
    await api.loadOnboardingDraft("project-1");
    await api.saveOnboardingDraft({ version: 1, projectId: "project-1" });
    await api.detachWorkspace({ sessionId: "session-1" });
    await api.dispatchWorkspaceIntent({
      mutationId: "mutation-1",
      sessionId: "session-1",
      baseRevision: 0,
      type: "select_file",
      payload: { selectedFileId: "src/app.tsx" },
    });
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      "cly-dev:get-window-role",
    );
    expect(electronMocks.invoke).toHaveBeenCalledWith("onboarding-draft:load", {
      projectId: "project-1",
    });
    expect(electronMocks.invoke).toHaveBeenCalledWith("onboarding-draft:save", {
      version: 1,
      projectId: "project-1",
    });
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      "cly-dev:detach-workspace",
      { sessionId: "session-1" },
    );
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      "cly-dev:dispatch-workspace-intent",
      expect.objectContaining({ mutationId: "mutation-1" }),
    );
  });
});
