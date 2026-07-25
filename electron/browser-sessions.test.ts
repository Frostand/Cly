import { describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  fromId: vi.fn(),
  openExternal: vi.fn(),
  showSaveDialog: vi.fn(),
}));

vi.mock("electron", () => ({
  dialog: { showSaveDialog: electron.showSaveDialog },
  shell: { openExternal: electron.openExternal },
  webContents: { fromId: electron.fromId },
}));

import {
  configureBrowserGuestSecurity,
  createBrowserSessionManager,
} from "./browser-sessions.js";

const createGuest = (id = 91) => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const permission = { check: vi.fn(), request: vi.fn() };
  return {
    id,
    handlers,
    openDevTools: vi.fn(),
    isDestroyed: vi.fn(() => false),
    once: vi.fn(),
    on: vi.fn((name, handler) => handlers.set(name, handler)),
    setWindowOpenHandler: vi.fn((handler) =>
      handlers.set("window-open", handler),
    ),
    session: {
      setPermissionCheckHandler: vi.fn((handler) => permission.check(handler)),
      setPermissionRequestHandler: vi.fn((handler) =>
        permission.request(handler),
      ),
    },
    permission,
  };
};

describe("embedded browser security", () => {
  it("denies every permission and blocks unsafe navigation schemes", () => {
    const guest = createGuest();
    configureBrowserGuestSecurity(guest);

    const check = guest.permission.check.mock.calls[0]?.[0];
    const request = guest.permission.request.mock.calls[0]?.[0];
    for (const permission of [
      "camera",
      "microphone",
      "geolocation",
      "notifications",
      "midi",
      "usb",
      "serial",
      "bluetooth",
      "clipboard-read",
      "unknown-future-permission",
    ]) {
      expect(check(null, permission)).toBe(false);
    }
    const callback = vi.fn();
    request(null, "microphone", callback);
    expect(callback).toHaveBeenCalledWith(false);

    const preventDefault = vi.fn();
    guest.handlers.get("will-navigate")?.(
      { preventDefault },
      "file:///tmp/private",
    );
    expect(preventDefault).toHaveBeenCalledOnce();
    preventDefault.mockClear();
    guest.handlers.get("will-navigate")?.(
      { preventDefault },
      "https://example.com",
    );
    expect(preventDefault).not.toHaveBeenCalled();
    expect(
      guest.handlers.get("window-open")?.({ url: "javascript:alert(1)" }),
    ).toEqual({ action: "deny" });
    expect(electron.openExternal).not.toHaveBeenCalled();
  });

  it("rejects forged guest IDs, foreign owners, and changed project/tab ownership", () => {
    const guest = createGuest();
    electron.fromId.mockReturnValue(guest);
    const errors: unknown[] = [];
    const manager = createBrowserSessionManager({
      getMainWindow: () => null,
      sendToRenderer: (_channel, payload) => errors.push(payload),
      secureGuest: vi.fn(),
    });
    expect(manager.registerGuest(11, guest)).toBe(true);

    manager.update(12, {
      openDevTools: true,
      projectId: "project-a",
      tabId: "tab-a",
      webContentsId: guest.id,
    });
    expect(guest.openDevTools).not.toHaveBeenCalled();

    manager.update(11, {
      openDevTools: true,
      projectId: "project-a",
      tabId: "tab-a",
      webContentsId: guest.id,
    });
    expect(guest.openDevTools).toHaveBeenCalledOnce();

    manager.update(11, {
      openDevTools: true,
      projectId: "project-b",
      tabId: "tab-a",
      webContentsId: guest.id,
    });
    expect(guest.openDevTools).toHaveBeenCalledOnce();
    expect(errors).toHaveLength(2);
  });
});
