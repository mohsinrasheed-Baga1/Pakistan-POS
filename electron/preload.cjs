// Preload script - exposes a small, safe surface to the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("posElectron", {
  version: "2.7.54",
  platform: process.platform,
  // Open a folder in the OS file explorer (used by Multi-Computer Sharing)
  openPath: (p) => ipcRenderer.invoke("pos:open-path", p),
  // Open a URL in the default browser (used by Check Updates download)
  openExternal: (url) => ipcRenderer.invoke("pos:open-external", url),

  // Google Drive Cloud Backup API
  googleDrive: {
    connect: () => ipcRenderer.invoke("gdrive:connect"),
    disconnect: () => ipcRenderer.invoke("gdrive:disconnect"),
    status: () => ipcRenderer.invoke("gdrive:status"),
    backup: () => ipcRenderer.invoke("gdrive:backup"),
    listBackups: () => ipcRenderer.invoke("gdrive:listBackups"),
    restore: (fileId) => ipcRenderer.invoke("gdrive:restore", fileId),
    saveConfig: (clientId, clientSecret) => ipcRenderer.invoke("gdrive:save-config", clientId, clientSecret),
  },

  // Software Updater API (electron-updater with delta/differential support)
  updater: {
    // Check for updates — returns { version, releaseNotes, releaseDate, downloadSize } or null
    check: () => ipcRenderer.invoke("updater:check"),
    // Download the available update (delta download if possible)
    download: () => ipcRenderer.invoke("updater:download"),
    // Quit and install the downloaded update
    install: () => ipcRenderer.invoke("updater:install"),
    // Listen for download progress events — callback receives percent (0-100)
    // Returns a cleanup function to remove the listener
    onProgress: (callback) => {
      const handler = (_event, percent) => callback(percent);
      ipcRenderer.on("updater:progress", handler);
      return () => ipcRenderer.removeListener("updater:progress", handler);
    },
  },
});
