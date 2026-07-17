// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createBrowserSessionManager } from "./browser-sessions.js";

const createGuest = (ownerId: number, type = "webview") => ({
  getType: vi.fn(() => type),
  hostWebContents: { id: ownerId },
  isDestroyed: vi.fn(() => false),
  openDevTools: vi.fn(),
});

describe("browser guest authority", () => {
  it("allows an action only for a webview owned by the sender", () => {
    const guest = createGuest(11);
    const sendToRenderer = vi.fn();
    const manager = createBrowserSessionManager({
      getMainWindow: () => null,
      getWebContentsById: () => guest,
      sendToRenderer,
    });

    manager.update(
      { openDevTools: true, projectId: "project-1", webContentsId: 42 },
      { id: 11, isDestroyed: () => false },
    );

    expect(guest.openDevTools).toHaveBeenCalledWith({ mode: "detach" });
    expect(sendToRenderer).not.toHaveBeenCalled();
  });

  it.each([
    { ownerId: 12, senderId: 11, type: "webview" },
    { ownerId: 11, senderId: 11, type: "window" },
  ])("rejects a guest outside the sender boundary: %o", (fixture) => {
    const guest = createGuest(fixture.ownerId, fixture.type);
    const sendToRenderer = vi.fn();
    const manager = createBrowserSessionManager({
      getMainWindow: () => null,
      getWebContentsById: () => guest,
      sendToRenderer,
    });

    manager.update(
      { openDevTools: true, projectId: "project-1", webContentsId: 42 },
      { id: fixture.senderId, isDestroyed: () => false },
    );

    expect(guest.openDevTools).not.toHaveBeenCalled();
    expect(sendToRenderer).toHaveBeenCalledWith(
      "browser:error",
      expect.objectContaining({ code: "BROWSER_ACTION_FORBIDDEN" }),
    );
  });
});
