const electron = require("electron");
const { contextBridge, ipcRenderer } = electron.default ?? electron;

contextBridge.exposeInMainWorld("clyStartup", {
  act: (action) => {
    if (["retry", "quit", "copy-diagnostics"].includes(action)) {
      ipcRenderer.send("startup:action", action);
    }
  },
  onState: (listener) => {
    const subscription = (_event, state) => listener(state);
    ipcRenderer.on("startup:state", subscription);
    return () => ipcRenderer.removeListener("startup:state", subscription);
  },
});
