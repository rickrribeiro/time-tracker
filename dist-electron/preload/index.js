"use strict";
const electron = require("electron");
const serverUrl = electron.ipcRenderer.sendSync("desktop:serverUrl");
const token = electron.ipcRenderer.sendSync("desktop:token");
const desktop = {
  serverUrl,
  token,
  onQuickCapture: (cb) => {
    const listener = () => cb();
    electron.ipcRenderer.on("quick-capture:open", listener);
    return () => {
      electron.ipcRenderer.removeListener("quick-capture:open", listener);
    };
  },
  notify: (title, body) => electron.ipcRenderer.send("desktop:notify", title, body),
  openExternal: (url) => electron.ipcRenderer.send("desktop:openExternal", url)
};
electron.contextBridge.exposeInMainWorld("desktop", desktop);
