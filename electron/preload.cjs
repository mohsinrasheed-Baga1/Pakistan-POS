// Preload script - exposes a small, safe surface to the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("posElectron", {
  version: "2.7.20",
  platform: process.platform,
  // Open a folder in the OS file explorer (used by Multi-Computer Sharing)
  openPath: (p) => ipcRenderer.invoke("pos:open-path", p),

  // Google Drive Cloud Backup API
  googleDrive: {
    connect: () => ipcRenderer.invoke("gdrive:connect"),
    disconnect: () => ipcRenderer.invoke("gdrive:disconnect"),
    status: () => ipcRenderer.invoke("gdrive:status"),
    backup: () => ipcRenderer.invoke("gdrive:backup"),
    listBackups: () => ipcRenderer.invoke("gdrive:listBackups"),
    restore: (fileId) => ipcRenderer.invoke("gdrive:restore", fileId),
  },
});
