const electron = require("electron");
const { contextBridge, ipcRenderer } = electron.default ?? electron;

const getPreloadArgument = (prefix) => {
  const argument = process.argv.find((value) => value.startsWith(prefix));
  if (!argument) return null;
  try {
    return decodeURIComponent(argument.slice(prefix.length));
  } catch {
    return null;
  }
};

const BASE_COLORS = new Set(["neutral", "slate", "gray", "zinc", "stone"]);
const ACCENT_COLORS = new Set([
  "black-white",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
]);

const normalizeTheme = (theme) =>
  theme === "light" || theme === "dark" || theme === "system" ? theme : "dark";

const normalizeBaseColor = (baseColor) =>
  BASE_COLORS.has(baseColor) ? baseColor : "zinc";

const normalizeAccentColor = (accentColor) =>
  ACCENT_COLORS.has(accentColor) ? accentColor : "green";

const getSystemTheme = () =>
  window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

const getPreloadThemePreferences = () => {
  const preferences = getPreloadArgument("--dream-theme-preferences=");
  if (!preferences) return null;
  try {
    return JSON.parse(preferences);
  } catch {
    return null;
  }
};

const getBrowserThemePreferences = () => {
  try {
    const rawUiPreferences = window.localStorage?.getItem(
      "dream-ui-preferences",
    );
    const uiPreferences = rawUiPreferences ? JSON.parse(rawUiPreferences) : {};

    return {
      accentColor: uiPreferences?.accentColor,
      baseColor: uiPreferences?.baseColor,
      theme: window.localStorage?.getItem("dream-theme"),
    };
  } catch {
    return null;
  }
};

const initialThemePreferences = (() => {
  const preferences =
    getPreloadThemePreferences() ?? getBrowserThemePreferences();
  return {
    accentColor: normalizeAccentColor(preferences?.accentColor),
    baseColor: normalizeBaseColor(preferences?.baseColor),
    theme: normalizeTheme(preferences?.theme),
  };
})();

const applyInitialThemePreferences = () => {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  if (!root) {
    return;
  }

  const resolvedTheme =
    initialThemePreferences.theme === "system"
      ? getSystemTheme()
      : initialThemePreferences.theme;

  root.classList.toggle("dark", resolvedTheme === "dark");
  root.classList.toggle("light", resolvedTheme === "light");
  root.style.colorScheme = resolvedTheme;

  if (initialThemePreferences.baseColor === "neutral") {
    root.removeAttribute("data-base-color");
  } else {
    root.setAttribute("data-base-color", initialThemePreferences.baseColor);
  }

  root.setAttribute("data-accent-color", initialThemePreferences.accentColor);
};

if (typeof document !== "undefined" && document.documentElement) {
  applyInitialThemePreferences();
} else {
  window.addEventListener("DOMContentLoaded", applyInitialThemePreferences, {
    once: true,
  });
}

const subscribe = (channel, listener) => {
  const subscription = (_event, payload) => {
    listener(payload);
  };

  ipcRenderer.on(channel, subscription);

  return () => {
    ipcRenderer.removeListener(channel, subscription);
  };
};

contextBridge.exposeInMainWorld("dream", {
  isElectron: true,
  initialThemePreferences,

  openExternal: (url) => ipcRenderer.invoke("shell:open-external", { url }),
  launchProviderLogin: (provider) =>
    ipcRenderer.invoke("providers:launch-login", { provider }),
  writeClipboardText: (text) =>
    ipcRenderer.invoke("clipboard:write-text", { text }),
  saveTextFile: (payload) => ipcRenderer.invoke("files:save-text", payload),

  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowMaximize: () => ipcRenderer.invoke("window:maximize"),
  windowClose: () => ipcRenderer.invoke("window:close"),

  getWindowRole: () => ipcRenderer.invoke("cly-dev:get-window-role"),
  getWindowSessionId: () => ipcRenderer.invoke("cly-dev:get-session-id"),
  getWorkspaceSnapshot: (sessionId) =>
    ipcRenderer.invoke("cly-dev:get-workspace-snapshot", { sessionId }),
  detachWorkspace: (input) =>
    ipcRenderer.invoke("cly-dev:detach-workspace", input),
  reattachWorkspace: (input) =>
    ipcRenderer.invoke("cly-dev:reattach-workspace", input),
  focusAgentWindow: () => ipcRenderer.invoke("cly-dev:focus-agent-window"),
  focusWorkspaceWindow: () =>
    ipcRenderer.invoke("cly-dev:focus-workspace-window"),
  dispatchWorkspaceIntent: (intent) =>
    ipcRenderer.invoke("cly-dev:dispatch-workspace-intent", intent),
  onWorkspaceSnapshot: (listener) =>
    subscribe("cly-dev:workspace-snapshot", listener),

  pickProjectDirectory: () => ipcRenderer.invoke("projects:pick-directory"),

  loadState: () => ipcRenderer.invoke("state:load"),
  saveState: (state) => ipcRenderer.invoke("state:save", state),
  loadOnboardingDraft: (projectId) =>
    ipcRenderer.invoke("onboarding-draft:load", { projectId }),
  saveOnboardingDraft: (draft) =>
    ipcRenderer.invoke("onboarding-draft:save", draft),
  getThemePreferences: () => ipcRenderer.invoke("theme:get-preferences"),
  setThemePreference: (theme) => ipcRenderer.invoke("theme:set", { theme }),
  setBaseColor: (baseColor) =>
    ipcRenderer.invoke("theme:set-base-color", { baseColor }),
  setAccentColor: (accentColor) =>
    ipcRenderer.invoke("theme:set-accent-color", { accentColor }),

  getDefaultTerminalShell: () =>
    ipcRenderer.invoke("terminal:get-default-shell"),
  startTerminal: (payload) => ipcRenderer.invoke("terminal:start", payload),
  sendTerminalInput: (payload) => ipcRenderer.send("terminal:input", payload),
  resizeTerminal: (payload) => ipcRenderer.send("terminal:resize", payload),
  stopTerminal: (sessionId) =>
    ipcRenderer.invoke("terminal:stop", { sessionId }),
  onTerminalData: (listener) => subscribe("terminal:data", listener),
  onTerminalStatus: (listener) => subscribe("terminal:status", listener),

  updateBrowser: (payload) => ipcRenderer.send("browser:update", payload),
  onBrowserError: (listener) => subscribe("browser:error", listener),
  onBrowserPageState: (listener) => subscribe("browser:page-state", listener),
  onBrowserStatus: (listener) => subscribe("browser:status", listener),

  detectEditors: () => ipcRenderer.invoke("editors:detect"),
  openInEditor: (payload) => ipcRenderer.invoke("editors:open", payload),

  getUpdateStatus: () => ipcRenderer.invoke("updates:get-status"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onUpdateStatus: (listener) => subscribe("updates:status", listener),
  onClyCommand: (listener) => subscribe("cly:menu-command", listener),
});
