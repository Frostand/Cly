import { BrowserWindow, Menu } from "electron";
import { isClyMenuCommand } from "./menu-commands.js";

export function toggleWebContentsDevToolsDetached(webContents) {
  if (!webContents || webContents.isDestroyed()) {
    return;
  }

  if (webContents.isDevToolsOpened()) {
    webContents.closeDevTools();
    return;
  }

  webContents.openDevTools({ mode: "detach" });
}

function toggleFocusedDevToolsDetached(browserWindow) {
  const targetWindow = browserWindow ?? BrowserWindow.getFocusedWindow();
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  toggleWebContentsDevToolsDetached(targetWindow.webContents);
}

export function configureApplicationMenu(app, appName) {
  app.setAboutPanelOptions({
    applicationName: appName,
    applicationVersion: app.getVersion(),
  });

  const command = (id) => {
    if (!isClyMenuCommand(id))
      throw new Error(`Unknown Cly menu command: ${id}`);
    return (_menuItem, browserWindow) => {
      const targetWindow = browserWindow ?? BrowserWindow.getFocusedWindow();
      if (!targetWindow || targetWindow.isDestroyed()) {
        return;
      }
      targetWindow.webContents.send("cly:menu-command", id);
    };
  };

  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: appName,
            submenu: [
              { label: `About ${appName}`, role: "about" },
              { type: "separator" },
              {
                label: "Settings…",
                accelerator: "CommandOrControl+,",
                click: command("settings"),
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { label: `Hide ${appName}`, role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { label: `Quit ${appName}`, role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Choose or Open Project…",
          accelerator: "CommandOrControl+O",
          click: command("project-switcher"),
        },
        {
          label: "Switch Project…",
          accelerator: "CommandOrControl+Shift+O",
          click: command("project-switcher"),
        },
        { type: "separator" },
        { label: "Open Sources", click: command("open-sources") },
        ...(process.platform !== "darwin"
          ? [{ type: "separator" }, { role: "quit" }]
          : []),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "Research",
      submenu: [
        { label: "Open Research Brief", click: command("open-research-brief") },
        {
          label: "Open Claims",
          accelerator: "CommandOrControl+N",
          click: command("open-claims"),
        },
        { label: "Open Experiments", click: command("open-experiments") },
        { label: "Open Decisions", click: command("open-decisions") },
        { type: "separator" },
        {
          label: "Open Reproducibility",
          click: command("open-reproducibility"),
        },
        { label: "Open Next Steps", click: command("open-next-steps") },
      ],
    },
    {
      label: "Agents",
      submenu: [
        {
          label: "Show Agent Sessions Overview",
          click: command("agent-sessions-overview"),
        },
        {
          label: "Show Agent Sessions Chat",
          accelerator: "CommandOrControl+Shift+C",
          click: command("agent-sessions-chat"),
        },
        { label: "View Approvals", click: command("agent-approvals") },
        { type: "separator" },
        { label: "Open Context Composer", click: command("context-composer") },
        { label: "Configure Agent Plan", click: command("configure-agents") },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Sidebar",
          accelerator: "CommandOrControl+\\",
          click: command("toggle-sidebar"),
        },
        {
          label: "Toggle Inspector",
          accelerator: "CommandOrControl+Alt+I",
          click: command("toggle-inspector"),
        },
        {
          label: "Toggle Activity Drawer",
          accelerator: "CommandOrControl+J",
          click: command("toggle-activity"),
        },
        { type: "separator" },
        {
          label: "Show Command Palette",
          accelerator: "CommandOrControl+K",
          click: command("command-palette"),
        },
        {
          label: "Focus Search",
          accelerator: "CommandOrControl+F",
          click: command("focus-search"),
        },
        { label: "Reset Layout", click: command("reset-layout") },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "togglefullscreen" },
        ...(process.env.NODE_ENV === "development"
          ? [
              { type: "separator" },
              {
                accelerator: "Alt+Command+I",
                click: (_menuItem, browserWindow) =>
                  toggleFocusedDevToolsDetached(browserWindow),
                label: "Toggle Developer Tools",
              },
            ]
          : []),
      ],
    },
    {
      label: "Integrations",
      submenu: [
        { label: "Open Integrations", click: command("open-integrations") },
        {
          label: "Open Literature Workspace",
          click: command("open-literature"),
        },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
    {
      label: "Help",
      role: "help",
      submenu: [
        { label: "Keyboard Shortcuts", click: command("shortcuts") },
        { label: "Diagnostics", click: command("diagnostics") },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
