import { BrowserWindow, Menu } from "electron";

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

  const command = (id) => (_menuItem, browserWindow) => {
    const targetWindow = browserWindow ?? BrowserWindow.getFocusedWindow();
    if (!targetWindow || targetWindow.isDestroyed()) {
      return;
    }
    targetWindow.webContents.send("cly:menu-command", id);
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
        { label: "New Project", click: command("new-project") },
        {
          label: "Open Project…",
          accelerator: "CommandOrControl+O",
          click: command("open-project"),
        },
        {
          label: "Switch Project…",
          accelerator: "CommandOrControl+Alt+O",
          click: command("project-switcher"),
        },
        { type: "separator" },
        { label: "Import Sources…", click: command("import-sources") },
        { label: "Import Notebook…", click: command("import-notebook") },
        {
          label: "Import Experiment Folder…",
          click: command("import-experiment"),
        },
        { type: "separator" },
        { label: "Close Project", click: command("close-project") },
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
        { label: "New Question", click: command("new-question") },
        { label: "New Hypothesis", click: command("new-hypothesis") },
        {
          label: "New Claim",
          accelerator: "CommandOrControl+N",
          click: command("new-claim"),
        },
        { label: "New Experiment", click: command("new-experiment") },
        { label: "New Decision", click: command("new-decision") },
        { type: "separator" },
        { label: "Run Reproducibility Audit", click: command("run-audit") },
        { label: "Generate Next Steps", click: command("generate-next-steps") },
      ],
    },
    {
      label: "Agents",
      submenu: [
        { label: "New Agent Session", click: command("new-agent-session") },
        {
          label: "Show Agent Sessions Overview",
          accelerator: "CommandOrControl+Shift+O",
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
        { type: "separator" },
        {
          label: "Open Browser Tab",
          accelerator: "CommandOrControl+Alt+B",
          click: command("agent-tab-browser"),
        },
        {
          label: "Open Terminal Tab",
          accelerator: "CommandOrControl+Alt+T",
          click: command("agent-tab-terminal"),
        },
        {
          label: "Open Diff Tab",
          accelerator: "CommandOrControl+Alt+D",
          click: command("agent-tab-diff"),
        },
        {
          label: "Open Agents Tab",
          accelerator: "CommandOrControl+Alt+A",
          click: command("agent-tab-agents"),
        },
        {
          label: "Open Live Files Tab",
          accelerator: "CommandOrControl+Alt+F",
          click: command("agent-tab-live-files"),
        },
        {
          label: "Toggle Workbench",
          accelerator: "CommandOrControl+Alt+W",
          click: command("agent-toggle-workbench"),
        },
        { type: "separator" },
        { label: "Run Claim Audit", click: command("claim-audit") },
        { label: "Run Code Review", click: command("code-review") },
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
        { label: "Manage Connections", click: command("manage-integrations") },
        { label: "Import from GitHub", click: command("import-github") },
        {
          label: "Import from Hugging Face",
          click: command("import-huggingface"),
        },
        {
          label: "Create NotebookLM Bundle",
          click: command("notebooklm-bundle"),
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
        { label: "Documentation", click: command("documentation") },
        { label: "Keyboard Shortcuts", click: command("shortcuts") },
        { label: "Diagnostics", click: command("diagnostics") },
        { type: "separator" },
        { label: `About ${appName}`, click: command("about") },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
