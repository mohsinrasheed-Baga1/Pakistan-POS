// Preload script - exposes a small, safe surface to the renderer.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("posElectron", {
  version: process.env.npm_package_version || "unknown",
  platform: process.platform,
  openPath: (p) => ipcRenderer.invoke("pos:open-path", p),
  openExternal: (url) => ipcRenderer.invoke("pos:open-external", url),

  // System Fingerprint — get REAL machine ID from main process (v2.10.11)
  // Returns unique ID based on MAC address, hostname, machine UUID, disk serial
  getSystemFingerprint: () => ipcRenderer.invoke("system:get-fingerprint"),

  googleDrive: {
    connect: () => ipcRenderer.invoke("gdrive:connect"),
    disconnect: () => ipcRenderer.invoke("gdrive:disconnect"),
    status: () => ipcRenderer.invoke("gdrive:status"),
    backup: () => ipcRenderer.invoke("gdrive:backup"),
    listBackups: () => ipcRenderer.invoke("gdrive:listBackups"),
    restore: (fileId) => ipcRenderer.invoke("gdrive:restore", fileId),
    saveConfig: (clientId, clientSecret) => ipcRenderer.invoke("gdrive:save-config", clientId, clientSecret),
    // NEW: Trigger an auto-backup immediately (used after each sale)
    triggerBackup: (reason = "manual") => ipcRenderer.invoke("gdrive:trigger-backup", reason),
    // NEW: Get last backup status (for UI display)
    getBackupStatus: () => ipcRenderer.invoke("gdrive:backup-status"),
    // NEW: Listen for auto-backup events (success/failure)
    onAutoBackupDone: (callback) => {
      const handler = (_evt, data) => callback(data);
      ipcRenderer.on("gdrive:auto-backup-done", handler);
      return () => ipcRenderer.removeListener("gdrive:auto-backup-done", handler);
    },
    onAutoBackupFailed: (callback) => {
      const handler = (_evt, data) => callback(data);
      ipcRenderer.on("gdrive:auto-backup-failed", handler);
      return () => ipcRenderer.removeListener("gdrive:auto-backup-failed", handler);
    },
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
