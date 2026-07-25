import { writeFile } from "node:fs/promises";
import { dialog, webContents } from "electron";

function getSafeScreenshotName(value) {
  const base =
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : "browser-screenshot";
  const sanitized = base
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  return `${sanitized || "browser-screenshot"}.png`;
}

export function createBrowserSessionManager({
  getMainWindow,
  getWebContentsById = (id) => webContents.fromId(id),
  sendToRenderer,
}) {
  function sendBrowserActionError(payload, code, description) {
    sendToRenderer("browser:error", {
      code,
      description,
      projectId: payload?.projectId,
      tabId: payload?.tabId,
    });
  }

  function getGuestWebContents(payload, actionName, sender) {
    const webContentsId = Number(payload?.webContentsId);
    if (!Number.isInteger(webContentsId) || webContentsId <= 0) {
      sendBrowserActionError(
        payload,
        "BROWSER_ACTION_FAILED",
        `No browser guest found for ${actionName}.`,
      );
      return null;
    }

    const guest = getWebContentsById(webContentsId);
    if (!guest || guest.isDestroyed()) {
      sendBrowserActionError(
        payload,
        "BROWSER_ACTION_FAILED",
        `Browser guest is not ready for ${actionName}.`,
      );
      return null;
    }

    const host = guest.hostWebContents;
    if (
      !sender ||
      sender.isDestroyed?.() ||
      guest.getType?.() !== "webview" ||
      !host ||
      host.id !== sender.id
    ) {
      sendBrowserActionError(
        payload,
        "BROWSER_ACTION_FORBIDDEN",
        `Browser guest is not owned by this window for ${actionName}.`,
      );
      return null;
    }

    return guest;
  }

  async function clearBrowserCookies(payload, sender) {
    const guest = getGuestWebContents(payload, "cookies", sender);
    if (!guest) {
      return;
    }

    try {
      await guest.session.clearStorageData({
        storages: ["cookies"],
      });
    } catch {
      sendBrowserActionError(
        payload,
        "CLEAR_COOKIES_FAILED",
        "Failed to clear browser cookies.",
      );
    }
  }

  async function clearBrowserCache(payload, sender) {
    const guest = getGuestWebContents(payload, "cache", sender);
    if (!guest) {
      return;
    }

    try {
      await guest.session.clearCache();
    } catch {
      sendBrowserActionError(
        payload,
        "CLEAR_CACHE_FAILED",
        "Failed to clear browser cache.",
      );
    }
  }

  async function takeBrowserScreenshot(payload, sender) {
    const guest = getGuestWebContents(payload, "screenshot", sender);
    if (!guest) {
      return;
    }

    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      sendBrowserActionError(
        payload,
        "SCREENSHOT_FAILED",
        "No app window is available for saving the screenshot.",
      );
      return;
    }

    try {
      const image = await guest.capturePage();
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: getSafeScreenshotName(guest.getTitle()),
        filters: [{ name: "PNG image", extensions: ["png"] }],
        title: "Save browser screenshot",
      });

      if (result.canceled || !result.filePath) {
        return;
      }

      await writeFile(result.filePath, image.toPNG());
    } catch {
      sendBrowserActionError(
        payload,
        "SCREENSHOT_FAILED",
        "Failed to save browser screenshot.",
      );
    }
  }

  function openBrowserDevTools(payload, sender) {
    const guest = getGuestWebContents(payload, "DevTools", sender);
    if (!guest) {
      return;
    }

    try {
      guest.openDevTools({ mode: "detach" });
    } catch {
      sendBrowserActionError(
        payload,
        "OPEN_DEVTOOLS_FAILED",
        "Failed to open browser DevTools.",
      );
    }
  }

  function update(payload, sender) {
    if (!payload || typeof payload !== "object") {
      return;
    }

    if (payload.openDevTools === true) {
      openBrowserDevTools(payload, sender);
      return;
    }

    if (payload.takeScreenshot === true) {
      void takeBrowserScreenshot(payload, sender);
      return;
    }

    if (payload.clearCookies === true) {
      void clearBrowserCookies(payload, sender);
      return;
    }

    if (payload.clearCache === true) {
      void clearBrowserCache(payload, sender);
    }
  }

  return {
    applyState: () => {},
    hideForRendererNavigation: () => {},
    reset: () => {},
    update,
  };
}
