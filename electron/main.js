import "./load-env.js";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  screen,
  shell,
} from "electron";
import getPort from "get-port";
import { createProjectAuthorityResolver } from "./api/project-git/authority.js";
import { resolveRegisteredProjectWorktree } from "./api/project-git/worktree-authority.js";
import {
  configureApplicationMenu,
  toggleWebContentsDevToolsDetached,
} from "./app-menu.js";
import { createBrowserSessionManager } from "./browser-sessions.js";
import {
  clampWindowBounds,
  createClyDevWorkspaceCore,
} from "./cly-dev-windows.js";
import { detectAvailableEditors, openProjectInEditor } from "./editors.js";
import {
  closePersistedStateDatabase,
  loadClyDevWindowLayout,
  loadOnboardingDraft,
  loadPersistedState,
  loadPersistedThemePreference,
  saveClyDevWindowLayout,
  saveOnboardingDraft,
  savePersistedState,
  savePersistedThemePreference,
} from "./persisted-state.js";
import {
  getBoundRendererId,
  getHostCommandApprovalOptions,
  getPrivilegedRendererId,
  getProviderHostActionApprovalOptions,
  getTerminalLaunchApprovalOptions,
  isTerminalSessionOwner,
  resolveTerminalLaunch,
} from "./privileged-ipc.js";
import { createProcessSessionManager } from "./process-sessions.js";
import { projectAuthorityRegistry } from "./project-authority-registry.js";
import { canBypassNativeCommandConfirmationForReleaseSmoke } from "./release-provider-smoke.js";
import { createRendererServerManager } from "./renderer-server.js";
import { createStateSaveQueue } from "./state-save-queue.js";
import { initializeAutoUpdater } from "./updater.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appIconFileName = process.platform === "win32" ? "icon.ico" : "icon.png";
const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, appIconFileName)
  : path.join(__dirname, "..", "public", appIconFileName);

const isDevelopment = process.env.NODE_ENV === "development";

// Diagnostic only: opt-in via env var to test whether software rendering is
// caused by Chromium's GPU blocklist. Only allowed in development builds —
// blocklist entries exist because the matched configs crash or misrender.
if (!app.isPackaged && process.env.DREAM_IGNORE_GPU_BLOCKLIST === "1") {
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  console.warn(
    "[gpu] --ignore-gpu-blocklist enabled via DREAM_IGNORE_GPU_BLOCKLIST (diagnostic mode)",
  );
}
const rendererUrlFromEnv = process.env.ELECTRON_RENDERER_URL?.trim();
const rendererStartupTimeoutMs = Number(
  process.env.VITE_READY_TIMEOUT_MS ?? 45000,
);
const rendererProbeIntervalMs = 300;
const APP_NAME = "Cly";
const APP_ID = "ai.cly.cly";
const APP_USER_DATA_DIR_NAME = "cly";
const isolatedE2eUserDataPath =
  process.env.CLY_E2E === "1" ? process.env.CLY_E2E_USER_DATA_PATH?.trim() : "";
const isolatedE2eSessionDataPath =
  process.env.CLY_E2E === "1"
    ? process.env.CLY_E2E_SESSION_DATA_PATH?.trim()
    : "";
const APP_USER_DATA_PATH =
  isolatedE2eUserDataPath ||
  path.join(app.getPath("appData"), APP_USER_DATA_DIR_NAME);
const APP_SESSION_DATA_PATH =
  isolatedE2eSessionDataPath ||
  path.join(
    app.getPath("temp"),
    APP_USER_DATA_DIR_NAME,
    `session-${process.pid}`,
  );
const LIGHT_WINDOW_BACKGROUND = "#ffffff";
const DARK_WINDOW_BACKGROUNDS = {
  neutral: "#0a0a0a",
  slate: "#020617",
  gray: "#030712",
  zinc: "#09090b",
  stone: "#0c0a09",
};
const DEFAULT_THEME_PREFERENCES = {
  accentColor: "green",
  baseColor: "zinc",
  theme: "dark",
};

app.setName(APP_NAME);
if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}
app.setPath("userData", APP_USER_DATA_PATH);
// Keep Chromium caches per process so parallel launches do not lock user data.
app.setPath("sessionData", APP_SESSION_DATA_PATH);

let mainWindow = null;
let workspaceWindow = null;
let workspaceWindowSessionId = null;
const workspaceWindowsClosingForReattach = new WeakSet();
let appIsQuitting = false;
let updateManager = null;
const windowBindings = new Map();
const clyDevWorkspaceCore = createClyDevWorkspaceCore();

function normalizeThemePreference(value) {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "dark";
}

function loadThemePreference() {
  try {
    const parsed = loadPersistedThemePreference();
    return {
      accentColor: parsed?.accentColor ?? DEFAULT_THEME_PREFERENCES.accentColor,
      theme: normalizeThemePreference(parsed?.theme),
      baseColor: parsed?.baseColor ?? DEFAULT_THEME_PREFERENCES.baseColor,
    };
  } catch (error) {
    console.error("Failed to load theme preference:", error);
    return DEFAULT_THEME_PREFERENCES;
  }
}

function saveThemePreference(theme, baseColor, accentColor) {
  try {
    const existing = loadThemePreference();
    const data = {
      accentColor: accentColor ?? existing.accentColor,
      theme: normalizeThemePreference(theme ?? existing.theme),
      baseColor: baseColor ?? existing.baseColor,
    };
    savePersistedThemePreference(data);
  } catch (error) {
    console.error("Failed to save theme preference:", error);
  }
}

function getResolvedThemePreference(theme) {
  const normalizedTheme = normalizeThemePreference(
    theme ?? loadThemePreference().theme,
  );
  if (normalizedTheme === "system") {
    return nativeTheme.shouldUseDarkColors ? "dark" : "light";
  }

  return normalizedTheme;
}

function getWindowBackground(theme, baseColor) {
  const prefs = loadThemePreference();
  const resolvedTheme = getResolvedThemePreference(theme ?? prefs.theme);
  if (resolvedTheme === "light") {
    return LIGHT_WINDOW_BACKGROUND;
  }
  const color = baseColor ?? prefs.baseColor ?? "zinc";
  return DARK_WINDOW_BACKGROUNDS[color] ?? DARK_WINDOW_BACKGROUNDS.zinc;
}

function applyWindowThemeBackground(theme, baseColor) {
  for (const window of [mainWindow, workspaceWindow]) {
    if (window && !window.isDestroyed()) {
      window.setBackgroundColor(getWindowBackground(theme, baseColor));
    }
  }
}

function getApiSessionTokenPreloadArgument() {
  const token = rendererServerManager?.getApiSessionToken();
  if (!token) return "";
  return `--dream-api-session-token=${encodeURIComponent(token)}`;
}

function getThemePreferencePreloadArgument() {
  return `--dream-theme-preferences=${encodeURIComponent(
    JSON.stringify(loadThemePreference()),
  )}`;
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

const terminalSessionOwners = new Map();
const pendingTerminalApprovalSenders = new Set();
const pendingTerminalSessionIds = new Set();

const browserSessionManager = createBrowserSessionManager({
  getMainWindow: () => mainWindow,
  sendToRenderer,
});

const processSessionManager = createProcessSessionManager({
  sendToRenderer: (channel, payload) => {
    if (
      channel === "terminal:status" &&
      payload?.status === "stopped" &&
      typeof payload.projectId === "string"
    ) {
      terminalSessionOwners.delete(payload.projectId);
    }
    sendToRenderer(channel, payload);
  },
});
const resolveEditorProjectPath = createProjectAuthorityResolver({
  resolveAlternateProjectPath: resolveRegisteredProjectWorktree,
  resolveProjectPathById: projectAuthorityRegistry.resolveProjectPathById,
});

let hostActionConfirmationPending = false;

async function confirmHostAction({ getApprovalOptions, projectId, root }) {
  if (hostActionConfirmationPending) return false;
  const owner = mainWindow;
  if (!owner || owner.isDestroyed()) return false;

  let authorizedRoot;
  try {
    authorizedRoot = await resolveEditorProjectPath({
      projectId,
      projectPath: root,
    });
  } catch {
    return false;
  }
  if (path.resolve(authorizedRoot) !== path.resolve(root)) return false;

  hostActionConfirmationPending = true;
  try {
    const approval = await dialog.showMessageBox(
      owner,
      getApprovalOptions(authorizedRoot),
    );
    if (
      approval.response !== 1 ||
      owner.isDestroyed() ||
      mainWindow !== owner
    ) {
      return false;
    }
    const currentRoot = await resolveEditorProjectPath({
      projectId,
      projectPath: root,
    });
    return path.resolve(currentRoot) === path.resolve(authorizedRoot);
  } catch {
    return false;
  } finally {
    hostActionConfirmationPending = false;
  }
}

const authorizeClyDevCommand = async ({ command, projectId, root }) => {
  if (
    canBypassNativeCommandConfirmationForReleaseSmoke({
      isPackaged: app.isPackaged,
    })
  ) {
    // The test bypasses only the native modal. Preserve the same main-process
    // project authority check before allowing its deterministic command.
    try {
      const authorizedRoot = await resolveEditorProjectPath({
        projectId,
        projectPath: root,
      });
      return path.resolve(authorizedRoot) === path.resolve(root);
    } catch {
      return false;
    }
  }
  return confirmHostAction({
    projectId,
    root,
    getApprovalOptions: (authorizedRoot) =>
      getHostCommandApprovalOptions({ command, root: authorizedRoot }),
  });
};

const authorizeProviderHostAction = ({ action, projectId, provider, root }) => {
  if (!new Set(["cursor", "opencode"]).has(provider)) return false;
  return confirmHostAction({
    projectId,
    root,
    getApprovalOptions: (authorizedRoot) =>
      getProviderHostActionApprovalOptions({
        action,
        provider,
        root: authorizedRoot,
      }),
  });
};

function stopTerminalSessionsForOwner(senderId) {
  for (const [sessionId, ownerId] of terminalSessionOwners) {
    if (ownerId !== senderId) continue;
    processSessionManager.stopTerminalSession(sessionId);
    terminalSessionOwners.delete(sessionId);
  }
}

let rendererServerManager = null;

function parsePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null;
}

function isDevToolsShortcut(input) {
  const key = typeof input?.key === "string" ? input.key.toLowerCase() : "";
  return (
    input?.type === "keyDown" &&
    key === "i" &&
    input.control &&
    input.shift &&
    !input.alt &&
    !input.meta
  );
}

function configureDetachedDevToolsShortcuts() {
  app.on("web-contents-created", (_event, contents) => {
    contents.on("before-input-event", (event, input) => {
      if (!isDevToolsShortcut(input)) {
        return;
      }

      event.preventDefault();
      toggleWebContentsDevToolsDetached(contents);
    });
  });
}

async function createStartupRendererServerManager() {
  const configuredApiServerPort = parsePort(process.env.ELECTRON_API_PORT);
  const configuredInternalRendererPort = parsePort(
    process.env.ELECTRON_INTERNAL_PORT,
  );
  const apiServerPort =
    configuredApiServerPort ??
    (await getPort({
      exclude:
        configuredInternalRendererPort === null
          ? undefined
          : [configuredInternalRendererPort],
      host: "127.0.0.1",
      reserve: true,
    }));
  const internalRendererPort =
    configuredInternalRendererPort ??
    (await getPort({
      exclude: [apiServerPort],
      host: "127.0.0.1",
      reserve: true,
    }));

  if (!rendererUrlFromEnv && apiServerPort === internalRendererPort) {
    throw new Error(
      `Renderer and API ports must be different. Both resolved to ${apiServerPort}.`,
    );
  }

  console.log(
    `Starting ${APP_NAME} with renderer port ${internalRendererPort} and API port ${apiServerPort}.`,
  );

  return createRendererServerManager({
    apiServerPort,
    appDir: __dirname,
    developmentRendererUrl:
      rendererUrlFromEnv || `http://127.0.0.1:${internalRendererPort}`,
    internalRendererPort,
    isDevelopment,
    rendererProbeIntervalMs,
    rendererStartupTimeoutMs,
    rendererUrlFromEnv,
    authorizeClyDevCommand,
    authorizeProviderHostAction,
  });
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value.trim());
}

function getUrlOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isRendererNavigation(url) {
  if (!rendererServerManager) {
    return false;
  }

  const targetOrigin = getUrlOrigin(url);
  const rendererOrigin = getUrlOrigin(rendererServerManager.getUrl());

  if (!targetOrigin || !rendererOrigin) {
    return false;
  }

  return targetOrigin === rendererOrigin;
}

async function configureRendererProxy(webContents) {
  try {
    const proxyConfig = isDevelopment
      ? { mode: "direct" }
      : {
          mode: "system",
          proxyBypassRules: "localhost,127.0.0.1,::1,<local>",
        };

    await webContents.session.setProxy(proxyConfig);

    await webContents.session.forceReloadProxyConfig();
  } catch (error) {
    console.error("Failed to configure renderer proxy settings:", error);
  }
}

async function pickDirectory(event) {
  const senderId = getPrivilegedRendererId(event, {
    allowedRoles: ["agent"],
    isRendererNavigation,
    windowBindings,
  });
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (senderId === null || !owner || owner.isDestroyed()) {
    return null;
  }

  const e2eProjectPath =
    process.env.CLY_E2E === "1" ? process.env.CLY_E2E_PROJECT_PATH?.trim() : "";
  if (e2eProjectPath) {
    return projectAuthorityRegistry.authorizePathForRegistration(
      path.resolve(e2eProjectPath),
    );
  }

  const result = await dialog.showOpenDialog(owner, {
    properties: ["openDirectory"],
    title: "Select project folder",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const selectedPath = result.filePaths[0];
  return selectedPath
    ? projectAuthorityRegistry.authorizePathForRegistration(selectedPath)
    : null;
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    backgroundColor: getWindowBackground(),
    height: 1080,
    minHeight: 700,
    minWidth: 1024,
    icon:
      process.platform === "darwin" || !existsSync(appIconPath)
        ? undefined
        : appIconPath,
    show: false,
    title: APP_NAME,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    ...(process.platform !== "darwin" && { frame: false }),
    trafficLightPosition:
      process.platform === "darwin" ? { x: 14, y: 14 } : undefined,
    webPreferences: {
      contextIsolation: true,
      additionalArguments: [
        getThemePreferencePreloadArgument(),
        getApiSessionTokenPreloadArgument(),
      ],
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
      spellcheck: false,
      webviewTag: true,
    },
    width: 1920,
  });
  const mainWindowWebContentsId = mainWindow.webContents.id;
  windowBindings.set(mainWindowWebContentsId, {
    role: "agent",
    sessionId: null,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`Failed to load preload script ${preloadPath}:`, error);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on(
    "will-attach-webview",
    (_event, webPreferences, params) => {
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      params.allowpopups = false;
    },
  );

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isRendererNavigation(url)) {
      browserSessionManager.hideForRendererNavigation();
      return;
    }

    event.preventDefault();

    if (isHttpUrl(url)) {
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on(
    "did-start-navigation",
    (_event, url, isInPlace, isMainFrame) => {
      if (!isMainFrame || isInPlace || !isRendererNavigation(url)) {
        return;
      }

      browserSessionManager.hideForRendererNavigation();
    },
  );

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    browserSessionManager.hideForRendererNavigation();
    stopTerminalSessionsForOwner(mainWindowWebContentsId);
    if (details.reason === "crashed" || details.reason === "oom") {
      windowBindings.delete(mainWindowWebContentsId);
    }
  });

  // Throttle embedded-view layout during interactive resize. Windows fires
  // "resize" far more often than macOS during live drag-resize; running
  // applyState() per event causes main-process jank there.
  const RESIZE_THROTTLE_MS = 32;
  let resizeFrame = null;
  mainWindow.on("resize", () => {
    if (resizeFrame !== null) return;
    resizeFrame = setTimeout(() => {
      resizeFrame = null;
      browserSessionManager.applyState();
    }, RESIZE_THROTTLE_MS);
  });

  // Emitted once when an interactive resize ends (Windows/macOS): cancel any
  // pending throttled pass and sync the embedded views to the final bounds.
  mainWindow.on("resized", () => {
    if (resizeFrame !== null) {
      clearTimeout(resizeFrame);
      resizeFrame = null;
    }
    browserSessionManager.applyState();
  });

  mainWindow.on("closed", () => {
    if (resizeFrame !== null) {
      clearTimeout(resizeFrame);
      resizeFrame = null;
    }
    browserSessionManager.reset();
    windowBindings.delete(mainWindowWebContentsId);
    mainWindow = null;
  });

  await configureRendererProxy(mainWindow.webContents);

  mainWindow.loadURL(rendererServerManager.getUrl()).catch((error) => {
    console.error("Failed to load renderer:", error);
  });
}

function saveWorkspaceWindowLayoutFor(
  targetWindow,
  sessionId,
  detached = true,
) {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  const bounds = targetWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  saveClyDevWindowLayout({
    version: 1,
    workspace: {
      detached,
      sessionId,
      bounds,
      displayId: display?.id ?? null,
      maximized: targetWindow.isMaximized(),
    },
  });
}

function saveWorkspaceWindowLayout(detached = true) {
  saveWorkspaceWindowLayoutFor(
    workspaceWindow,
    workspaceWindowSessionId,
    detached,
  );
}

function broadcastWorkspaceSnapshot(snapshot) {
  for (const window of [mainWindow, workspaceWindow]) {
    if (!window || window.isDestroyed()) continue;
    const binding = windowBindings.get(window.webContents.id);
    if (
      binding?.role === "agent" ||
      binding?.sessionId === snapshot.sessionId
    ) {
      try {
        window.webContents.send("cly-dev:workspace-snapshot", snapshot);
      } catch {
        // Window may have been destroyed between the check and send
      }
    }
  }
}

clyDevWorkspaceCore.subscribe(broadcastWorkspaceSnapshot);

async function createWorkspaceWindow(sessionId) {
  if (workspaceWindow && !workspaceWindow.isDestroyed()) {
    if (workspaceWindowSessionId === sessionId) {
      workspaceWindow.show();
      workspaceWindow.focus();
      return;
    }
    saveWorkspaceWindowLayout(true);
    const previousWorkspaceWindow = workspaceWindow;
    workspaceWindowsClosingForReattach.add(previousWorkspaceWindow);
    previousWorkspaceWindow.close();
  }

  const persisted = loadClyDevWindowLayout()?.workspace;
  const restored = clampWindowBounds(
    persisted?.bounds ?? { x: 180, y: 120, width: 1100, height: 780 },
    screen.getAllDisplays(),
    persisted?.displayId,
    { width: 640, height: 480 },
  );
  workspaceWindowSessionId = sessionId;
  const createdWorkspaceWindow = new BrowserWindow({
    backgroundColor: getWindowBackground(),
    x: restored.x,
    y: restored.y,
    width: restored.width,
    height: restored.height,
    minWidth: 640,
    minHeight: 480,
    icon:
      process.platform === "darwin" || !existsSync(appIconPath)
        ? undefined
        : appIconPath,
    show: false,
    title: `${APP_NAME} — Developer workspace`,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    ...(process.platform !== "darwin" && { frame: false }),
    trafficLightPosition:
      process.platform === "darwin" ? { x: 14, y: 14 } : undefined,
    webPreferences: {
      contextIsolation: true,
      additionalArguments: [
        getThemePreferencePreloadArgument(),
        getApiSessionTokenPreloadArgument(),
      ],
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
      spellcheck: false,
      webviewTag: false,
    },
  });
  workspaceWindow = createdWorkspaceWindow;
  saveWorkspaceWindowLayoutFor(createdWorkspaceWindow, sessionId, true);
  const workspaceWebContentsId = createdWorkspaceWindow.webContents.id;
  windowBindings.set(workspaceWebContentsId, {
    role: "workspace",
    sessionId,
  });
  createdWorkspaceWindow.once("ready-to-show", () => {
    createdWorkspaceWindow.show();
    if (persisted?.maximized) createdWorkspaceWindow.maximize();
  });
  createdWorkspaceWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  createdWorkspaceWindow.webContents.on("will-navigate", (event, url) => {
    if (isRendererNavigation(url)) return;
    event.preventDefault();
    if (isHttpUrl(url)) shell.openExternal(url);
  });
  createdWorkspaceWindow.on("moved", () =>
    saveWorkspaceWindowLayoutFor(createdWorkspaceWindow, sessionId),
  );
  createdWorkspaceWindow.on("resized", () =>
    saveWorkspaceWindowLayoutFor(createdWorkspaceWindow, sessionId),
  );
  createdWorkspaceWindow.on("close", () => {
    if (
      !appIsQuitting &&
      !workspaceWindowsClosingForReattach.has(createdWorkspaceWindow)
    ) {
      saveWorkspaceWindowLayoutFor(createdWorkspaceWindow, sessionId, false);
    }
  });
  createdWorkspaceWindow.on("closed", () => {
    const closingForReattach = workspaceWindowsClosingForReattach.has(
      createdWorkspaceWindow,
    );
    workspaceWindowsClosingForReattach.delete(createdWorkspaceWindow);
    windowBindings.delete(workspaceWebContentsId);
    const wasCurrentWorkspaceWindow =
      workspaceWindow === createdWorkspaceWindow;
    if (wasCurrentWorkspaceWindow) {
      workspaceWindow = null;
      workspaceWindowSessionId = null;
    }
    if (!appIsQuitting && wasCurrentWorkspaceWindow) {
      mainWindow?.show();
      mainWindow?.focus();
    }
    if (!closingForReattach && !appIsQuitting) {
      const current = clyDevWorkspaceCore.getSnapshot(sessionId);
      clyDevWorkspaceCore.dispatchIntent("agent", {
        mutationId: `workspace-closed:${sessionId}:${current.revision}`,
        sessionId,
        baseRevision: current.revision,
        type: "set_workspace_mode",
        payload: { workspaceMode: "inline" },
      });
    }
  });
  await configureRendererProxy(createdWorkspaceWindow.webContents);
  const url = new URL(rendererServerManager.getUrl());
  url.searchParams.set("clyWindowRole", "workspace");
  url.searchParams.set("sessionId", sessionId);
  await createdWorkspaceWindow.loadURL(url.toString());
}

ipcMain.handle("projects:pick-directory", pickDirectory);
ipcMain.handle("state:load", (event) => {
  const senderId = getPrivilegedRendererId(event, {
    allowedRoles: ["agent", "workspace"],
    isRendererNavigation,
    windowBindings,
  });
  if (senderId === null) throw new Error("State access is not allowed.");
  return loadPersistedState();
});
ipcMain.handle("onboarding-draft:load", (event, { projectId } = {}) => {
  const senderId = getPrivilegedRendererId(event, {
    allowedRoles: ["agent", "workspace"],
    isRendererNavigation,
    windowBindings,
  });
  if (senderId === null)
    throw new Error("Onboarding state access is not allowed.");
  return loadOnboardingDraft(projectId ?? null);
});
ipcMain.on("api:get-session-token", (event) => {
  const senderId = getBoundRendererId(event, {
    allowedRoles: ["agent", "workspace"],
    windowBindings,
  });
  if (senderId === null) {
    event.returnValue = "";
    return;
  }
  const apiSessionToken = rendererServerManager?.getApiSessionToken();
  if (!apiSessionToken) {
    console.error(
      "API session token requested before renderer server startup.",
    );
    event.returnValue = "";
    return;
  }

  event.returnValue = apiSessionToken;
});

// All writes share the main process's single SQLite connection. The queue
// coalesces bursts and schedules the full rewrite on the next event-loop turn.
let stateSaveQueue = null;
const getStateSaveQueue = () =>
  (stateSaveQueue ??= createStateSaveQueue({
    saveState: savePersistedState,
  }));
const onboardingDraftSaveQueues = new Map();
const getOnboardingDraftSaveQueue = (projectId) => {
  const key = typeof projectId === "string" ? projectId : "new-project";
  let queue = onboardingDraftSaveQueues.get(key);
  if (!queue) {
    queue = createStateSaveQueue({ saveState: saveOnboardingDraft });
    onboardingDraftSaveQueues.set(key, queue);
  }
  return queue;
};

ipcMain.handle("state:save", (event, state) => {
  const senderId = getPrivilegedRendererId(event, {
    allowedRoles: ["agent", "workspace"],
    isRendererNavigation,
    windowBindings,
  });
  if (senderId === null) throw new Error("State writes are not allowed.");
  projectAuthorityRegistry.validateState(state);
  return getStateSaveQueue().save(state);
});

ipcMain.handle("onboarding-draft:save", (event, draft) => {
  const senderId = getPrivilegedRendererId(event, {
    allowedRoles: ["agent", "workspace"],
    isRendererNavigation,
    windowBindings,
  });
  if (senderId === null)
    throw new Error("Onboarding state writes are not allowed.");
  return getOnboardingDraftSaveQueue(draft?.projectId).save(draft);
});

ipcMain.handle("cly-dev:get-window-role", (event) => {
  return windowBindings.get(event.sender.id)?.role ?? "agent";
});
ipcMain.handle("cly-dev:get-session-id", (event) => {
  return windowBindings.get(event.sender.id)?.sessionId ?? null;
});
ipcMain.handle("cly-dev:get-workspace-snapshot", (_event, { sessionId } = {}) =>
  clyDevWorkspaceCore.getSnapshot(sessionId),
);
ipcMain.handle("cly-dev:dispatch-workspace-intent", (event, intent) => {
  const role = windowBindings.get(event.sender.id)?.role ?? "agent";
  return clyDevWorkspaceCore.dispatchIntent(role, intent);
});
ipcMain.handle(
  "cly-dev:detach-workspace",
  async (_event, { sessionId } = {}) => {
    const current = clyDevWorkspaceCore.getSnapshot(sessionId);
    if (!current) throw new Error("A valid session is required to detach.");
    const result = clyDevWorkspaceCore.dispatchIntent("agent", {
      mutationId: `detach:${sessionId}:${current.revision}`,
      sessionId,
      baseRevision: current.revision,
      type: "set_workspace_mode",
      payload: { workspaceMode: "detached" },
    });
    if (!result.accepted)
      throw new Error("The workspace state changed. Try again.");
    await createWorkspaceWindow(sessionId);
  },
);
ipcMain.handle("cly-dev:reattach-workspace", (_event, { sessionId } = {}) => {
  const current = clyDevWorkspaceCore.getSnapshot(sessionId);
  if (!current) throw new Error("A valid session is required to reattach.");
  const result = clyDevWorkspaceCore.dispatchIntent("agent", {
    mutationId: `reattach:${sessionId}:${current.revision}`,
    sessionId,
    baseRevision: current.revision,
    type: "set_workspace_mode",
    payload: { workspaceMode: "inline" },
  });
  if (!result.accepted)
    throw new Error("The workspace state changed. Try again.");
  if (
    workspaceWindow &&
    !workspaceWindow.isDestroyed() &&
    workspaceWindowSessionId === sessionId
  ) {
    const targetWorkspaceWindow = workspaceWindow;
    saveWorkspaceWindowLayoutFor(targetWorkspaceWindow, sessionId, false);
    workspaceWindowsClosingForReattach.add(targetWorkspaceWindow);
    targetWorkspaceWindow.close();
  }
});
ipcMain.handle("cly-dev:focus-agent-window", () => {
  mainWindow?.show();
  mainWindow?.focus();
});
ipcMain.handle("cly-dev:focus-workspace-window", () => {
  workspaceWindow?.show();
  workspaceWindow?.focus();
});

ipcMain.handle("theme:set", (_event, { theme } = {}) => {
  const normalizedTheme = normalizeThemePreference(theme);
  saveThemePreference(normalizedTheme);
  applyWindowThemeBackground(normalizedTheme);
  return true;
});

ipcMain.handle("theme:get-preferences", () => loadThemePreference());

ipcMain.handle("theme:set-base-color", (_event, { baseColor } = {}) => {
  saveThemePreference(null, baseColor);
  applyWindowThemeBackground(null, baseColor);
  return true;
});

ipcMain.handle("theme:set-accent-color", (_event, { accentColor } = {}) => {
  saveThemePreference(null, null, accentColor);
  return true;
});

nativeTheme.on("updated", () => {
  applyWindowThemeBackground();
});

// Window controls (Windows/Linux frameless window)
ipcMain.handle("window:minimize", (event) => {
  const senderId = getBoundRendererId(event, { windowBindings });
  if (senderId === null) return;
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.handle("window:maximize", (event) => {
  const senderId = getBoundRendererId(event, { windowBindings });
  if (senderId === null) return;
  const target = BrowserWindow.fromWebContents(event.sender);
  if (target?.isMaximized()) {
    target.unmaximize();
  } else {
    target?.maximize();
  }
});
ipcMain.handle("window:close", (event) => {
  const senderId = getBoundRendererId(event, { windowBindings });
  if (senderId === null) return;
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle("shell:open-external", (_event, { url }) => {
  if (!url || typeof url !== "string" || !isHttpUrl(url)) {
    return false;
  }

  shell.openExternal(url);
  return true;
});

const PROVIDER_LOGIN_COMMANDS = {
  anthropic: "claude",
  cursor: "agent login",
  openai: "codex login",
  opencode: "opencode auth login",
};

const launchProviderLogin = (provider) => {
  const command = PROVIDER_LOGIN_COMMANDS[provider];
  if (!command) {
    return false;
  }

  try {
    if (process.platform === "darwin") {
      const script = `tell application "Terminal" to do script ${JSON.stringify(command)}`;
      const child = spawn("osascript", ["-e", script], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return true;
    }

    if (process.platform === "win32") {
      const child = spawn(
        "cmd.exe",
        ["/c", "start", "", "cmd.exe", "/k", command],
        {
          detached: true,
          stdio: "ignore",
          windowsHide: false,
        },
      );
      child.unref();
      return true;
    }

    const child = spawn("x-terminal-emulator", ["-e", "sh", "-lc", command], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
};

ipcMain.handle("providers:launch-login", (_event, { provider } = {}) => {
  return launchProviderLogin(provider);
});

ipcMain.handle("terminal:get-default-shell", () => {
  return processSessionManager.getDefaultTerminalShellCommand();
});

ipcMain.handle("clipboard:write-text", (_event, { text }) => {
  if (typeof text !== "string") {
    return false;
  }

  clipboard.writeText(text);
  return true;
});

ipcMain.handle(
  "files:save-text",
  async (_event, { contents, defaultPath, title = "Save file" }) => {
    if (typeof contents !== "string") {
      return false;
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath:
        typeof defaultPath === "string" && defaultPath.trim()
          ? defaultPath.trim()
          : undefined,
      title,
    });

    if (result.canceled || !result.filePath) {
      return false;
    }

    await writeFile(result.filePath, contents, "utf8");
    return true;
  },
);

ipcMain.handle("editors:detect", () => {
  return detectAvailableEditors();
});

ipcMain.handle("editors:open", async (event, payload) => {
  const senderId = getPrivilegedRendererId(event, {
    allowedRoles: ["agent", "workspace"],
    isRendererNavigation,
    windowBindings,
  });
  if (senderId === null) {
    throw new Error("Editor access is not allowed from this window.");
  }
  const projectPath = await resolveEditorProjectPath({
    projectId: payload?.projectId,
    projectPath: payload?.projectPath,
  });
  return openProjectInEditor({ ...payload, projectPath });
});

ipcMain.handle("terminal:start", async (event, payload) => {
  const senderId = getPrivilegedRendererId(event, {
    allowedRoles: ["agent"],
    isRendererNavigation,
    windowBindings,
  });
  if (senderId === null) {
    throw new Error("Terminal access is not allowed from this window.");
  }
  if (pendingTerminalApprovalSenders.has(senderId)) {
    throw new Error("A terminal approval is already pending for this window.");
  }

  const projectPath = projectAuthorityRegistry.resolveProjectPathById({
    projectId: payload?.projectId,
  });
  if (!projectPath) throw new Error("Unknown or unavailable project.");
  const launch = {
    ...resolveTerminalLaunch(payload, loadPersistedState()),
    cwd: projectPath,
  };
  if (
    terminalSessionOwners.has(launch.sessionId) ||
    pendingTerminalSessionIds.has(launch.sessionId)
  ) {
    throw new Error("Terminal session is already active.");
  }
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (!owner || owner.isDestroyed()) {
    throw new Error("Terminal owner window is unavailable.");
  }
  pendingTerminalApprovalSenders.add(senderId);
  pendingTerminalSessionIds.add(launch.sessionId);
  let approval;
  try {
    approval = await dialog.showMessageBox(
      owner,
      getTerminalLaunchApprovalOptions(launch),
    );
  } finally {
    pendingTerminalApprovalSenders.delete(senderId);
    pendingTerminalSessionIds.delete(launch.sessionId);
  }
  if (approval.response !== 1) return { status: "stopped" };
  const approvedSenderId = getPrivilegedRendererId(event, {
    allowedRoles: ["agent"],
    isRendererNavigation,
    windowBindings,
  });
  if (
    approvedSenderId !== senderId ||
    owner.isDestroyed() ||
    terminalSessionOwners.has(launch.sessionId)
  ) {
    throw new Error("Terminal owner changed while approval was pending.");
  }

  terminalSessionOwners.set(launch.sessionId, senderId);
  try {
    const result = processSessionManager.startTerminal({
      command: launch.command,
      cwd: launch.cwd,
      projectId: launch.sessionId,
      shellPath: launch.shellPath,
    });
    if (result.status !== "running") {
      terminalSessionOwners.delete(launch.sessionId);
    }
    return result;
  } catch (error) {
    terminalSessionOwners.delete(launch.sessionId);
    throw error;
  }
});

ipcMain.on("terminal:input", (event, payload) => {
  const senderId = getPrivilegedRendererId(event, {
    allowedRoles: ["agent"],
    isRendererNavigation,
    windowBindings,
  });
  if (
    senderId === null ||
    !isTerminalSessionOwner(
      terminalSessionOwners,
      senderId,
      payload?.sessionId,
    ) ||
    typeof payload?.data !== "string" ||
    payload.data.length > 65_536
  ) {
    return;
  }
  processSessionManager.writeTerminalInput({
    data: payload.data,
    projectId: payload.sessionId,
  });
});

ipcMain.on("terminal:resize", (event, payload) => {
  const senderId = getPrivilegedRendererId(event, {
    allowedRoles: ["agent"],
    isRendererNavigation,
    windowBindings,
  });
  if (
    senderId === null ||
    !isTerminalSessionOwner(
      terminalSessionOwners,
      senderId,
      payload?.sessionId,
    ) ||
    !Number.isInteger(payload?.cols) ||
    payload.cols < 2 ||
    payload.cols > 500 ||
    !Number.isInteger(payload?.rows) ||
    payload.rows < 1 ||
    payload.rows > 300
  ) {
    return;
  }
  processSessionManager.resizeTerminal({
    cols: payload.cols,
    projectId: payload.sessionId,
    rows: payload.rows,
  });
});

ipcMain.handle("terminal:stop", (event, { sessionId } = {}) => {
  const senderId = getPrivilegedRendererId(event, {
    allowedRoles: ["agent"],
    isRendererNavigation,
    windowBindings,
  });
  if (
    senderId === null ||
    !isTerminalSessionOwner(terminalSessionOwners, senderId, sessionId)
  ) {
    return false;
  }

  processSessionManager.stopTerminalSession(sessionId);
  terminalSessionOwners.delete(sessionId);
  return true;
});

ipcMain.on("browser:update", (event, payload) => {
  browserSessionManager.update(payload, event.sender);
});

app.whenReady().then(async () => {
  try {
    mkdirSync(APP_USER_DATA_PATH, { recursive: true });
  } catch (error) {
    console.error("Failed to create user data directory:", error);
    dialog.showErrorBox(
      "Startup Error",
      `Could not create the user data directory at:\n${APP_USER_DATA_PATH}\n\n${error.message}`,
    );
    app.quit();
    return;
  }

  try {
    mkdirSync(APP_SESSION_DATA_PATH, { recursive: true });
  } catch (error) {
    console.error("Failed to create session data directory:", error);
  }
  configureDetachedDevToolsShortcuts();
  configureApplicationMenu(app, APP_NAME);

  if (process.platform === "darwin" && existsSync(appIconPath)) {
    app.dock?.setIcon(appIconPath);
  }

  projectAuthorityRegistry.hydrate(loadPersistedState());
  rendererServerManager = await createStartupRendererServerManager();
  await rendererServerManager.start();
  await createMainWindow();

  const restoredWindowLayout = loadClyDevWindowLayout()?.workspace;
  if (restoredWindowLayout?.detached && restoredWindowLayout.sessionId) {
    const snapshot = clyDevWorkspaceCore.getSnapshot(
      restoredWindowLayout.sessionId,
    );
    clyDevWorkspaceCore.dispatchIntent("agent", {
      mutationId: `restore-detached:${restoredWindowLayout.sessionId}`,
      sessionId: restoredWindowLayout.sessionId,
      baseRevision: snapshot.revision,
      type: "set_workspace_mode",
      payload: { workspaceMode: "detached" },
    });
    await createWorkspaceWindow(restoredWindowLayout.sessionId);
  }

  updateManager = initializeAutoUpdater({
    app,
    getMainWindow: () => mainWindow,
    ipcMain,
    isDevelopment,
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

// Electron does not wait for async "before-quit" listeners, so we must
// preventDefault, finish cleanup (including flushing any queued state save),
// and then re-trigger quit ourselves. Without this,
// the final renderer-side persist could be lost on exit.
let quitCleanupDone = false;
let quitCleanupInProgress = false;
app.on("before-quit", (event) => {
  if (quitCleanupDone || quitCleanupInProgress) {
    return;
  }
  event.preventDefault();
  quitCleanupInProgress = true;
  appIsQuitting = true;
  saveWorkspaceWindowLayout(true);

  updateManager?.stop();
  processSessionManager.stopAllProcesses();

  Promise.resolve()
    .then(async () => {
      await rendererServerManager?.stop();
      await stateSaveQueue?.flushAndClose();
      await Promise.all(
        [...onboardingDraftSaveQueues.values()].map((queue) =>
          queue.flushAndClose(),
        ),
      );
      closePersistedStateDatabase();
    })
    .catch((error) => {
      console.error("Error during quit cleanup:", error);
    })
    .finally(() => {
      quitCleanupDone = true;
      quitCleanupInProgress = false;
      app.quit();
    });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || isDevelopment) {
    app.quit();
  }
});
