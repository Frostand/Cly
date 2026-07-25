import { writeFile } from "node:fs/promises";
import { dialog, shell, webContents } from "electron";

const normalizedIdentifier = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function isAllowedBrowserGuestNavigation(value) {
  if (value === "about:blank") return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function configureBrowserGuestSecurity(
  guest,
  { openExternal = (url) => shell.openExternal(url) } = {},
) {
  guest.session.setPermissionCheckHandler?.(() => false);
  guest.session.setPermissionRequestHandler?.(
    (_requestingWebContents, _permission, callback) => callback(false),
  );

  const preventUnsafeNavigation = (event, url) => {
    if (!isAllowedBrowserGuestNavigation(url)) event.preventDefault();
  };
  guest.on("will-navigate", preventUnsafeNavigation);
  guest.on("will-redirect", preventUnsafeNavigation);
  guest.setWindowOpenHandler?.(({ url }) => {
    if (isAllowedBrowserGuestNavigation(url) && url !== "about:blank") {
      void openExternal(url);
    }
    return { action: "deny" };
  });
}

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
  sendToRenderer,
  resolveWebContents = (id) => webContents.fromId(id),
  secureGuest = configureBrowserGuestSecurity,
}) {
  const registeredGuests = new Map();

  function sendBrowserActionError(payload, code, description) {
    sendToRenderer("browser:error", {
      code,
      description,
      projectId: payload?.projectId,
      tabId: payload?.tabId,
    });
  }

  function getGuestWebContents(payload, actionName, ownerWebContentsId) {
    const webContentsId = Number(payload?.webContentsId);
    if (!Number.isInteger(webContentsId) || webContentsId <= 0) {
      sendBrowserActionError(
        payload,
        "BROWSER_ACTION_FAILED",
        `No browser guest found for ${actionName}.`,
      );
      return null;
    }

    const registration = registeredGuests.get(webContentsId);
    const guest = resolveWebContents(webContentsId);
    if (
      !registration ||
      registration.ownerWebContentsId !== ownerWebContentsId ||
      registration.guest !== guest ||
      !guest ||
      guest.isDestroyed()
    ) {
      sendBrowserActionError(
        payload,
        "BROWSER_ACTION_FAILED",
        `Browser guest is not ready for ${actionName}.`,
      );
      return null;
    }

    const projectId = normalizedIdentifier(payload?.projectId);
    const tabId = normalizedIdentifier(payload?.tabId);
    if (!projectId || !tabId) {
      sendBrowserActionError(
        payload,
        "BROWSER_ACTION_FAILED",
        `Browser ownership is missing for ${actionName}.`,
      );
      return null;
    }
    if (registration.projectId === null && registration.tabId === null) {
      registration.projectId = projectId;
      registration.tabId = tabId;
    } else if (
      registration.projectId !== projectId ||
      registration.tabId !== tabId
    ) {
      sendBrowserActionError(
        payload,
        "BROWSER_ACTION_FAILED",
        `Browser ownership changed before ${actionName}.`,
      );
      return null;
    }

    return guest;
  }

  async function clearBrowserCookies(payload, ownerWebContentsId) {
    const guest = getGuestWebContents(payload, "cookies", ownerWebContentsId);
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

  async function clearBrowserCache(payload, ownerWebContentsId) {
    const guest = getGuestWebContents(payload, "cache", ownerWebContentsId);
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

  async function takeBrowserScreenshot(payload, ownerWebContentsId) {
    const guest = getGuestWebContents(
      payload,
      "screenshot",
      ownerWebContentsId,
    );
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

  function openBrowserDevTools(payload, ownerWebContentsId) {
    const guest = getGuestWebContents(payload, "DevTools", ownerWebContentsId);
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

  function update(ownerWebContentsId, payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }

    if (payload.openDevTools === true) {
      openBrowserDevTools(payload, ownerWebContentsId);
      return;
    }

    if (payload.takeScreenshot === true) {
      void takeBrowserScreenshot(payload, ownerWebContentsId);
      return;
    }

    if (payload.clearCookies === true) {
      void clearBrowserCookies(payload, ownerWebContentsId);
      return;
    }

    if (payload.clearCache === true) {
      void clearBrowserCache(payload, ownerWebContentsId);
    }
  }

  function registerGuest(ownerWebContentsId, guest) {
    if (
      !Number.isInteger(ownerWebContentsId) ||
      ownerWebContentsId <= 0 ||
      !Number.isInteger(guest?.id) ||
      guest.id <= 0
    ) {
      return false;
    }
    secureGuest(guest);
    registeredGuests.set(guest.id, {
      guest,
      ownerWebContentsId,
      projectId: null,
      tabId: null,
    });
    guest.once?.("destroyed", () => registeredGuests.delete(guest.id));
    return true;
  }

  return {
    applyState: () => {},
    hideForRendererNavigation: () => {},
    registerGuest,
    reset: () => registeredGuests.clear(),
    update,
  };
}
