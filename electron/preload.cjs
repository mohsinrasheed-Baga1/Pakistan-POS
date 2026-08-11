// Preload script - exposes a small, safe surface to the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("posElectron", {
  version: process.env.npm_package_version || "unknown",
  platform: process.platform,
  openPath: (p) => ipcRenderer.invoke("pos:open-path", p),
  openExternal: (url) => ipcRenderer.invoke("pos:open-external", url),

  googleDrive: {
    connect: () => ipcRenderer.invoke("gdrive:connect"),
    disconnect: () => ipcRenderer.invoke("gdrive:disconnect"),
    status: () => ipcRenderer.invoke("gdrive:status"),
    backup: () => ipcRenderer.invoke("gdrive:backup"),
    listBackups: () => ipcRenderer.invoke("gdrive:listBackups"),
    restore: (fileId) => ipcRenderer.invoke("gdrive:restore", fileId),
    saveConfig: (clientId, clientSecret) => ipcRenderer.invoke("gdrive:save-config", clientId, clientSecret),
  },

  // Software Updater API — ALWAYS available (even without electron-updater)
  // If electron-updater is missing, fallback handlers do direct HTTPS download
  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    download: (downloadUrl) => ipcRenderer.invoke("updater:download", downloadUrl),
    install: () => ipcRenderer.invoke("updater:install"),
    onProgress: (callback) => {
      const handler = (_event, percent) => callback(percent);
      ipcRenderer.on("updater:progress", handler);
      return () => ipcRenderer.removeListener("updater:progress", handler);
    },
  },
});
