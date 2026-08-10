// Preload script - exposes a small, safe surface to the renderer.
const { contextBridge, ipcRenderer } = require("electron");

// Get version from package.json (read by Electron at build time)
// electron-builder embeds the version in the app, so app.getVersion() works
// in main process. In preload, we read it from the app's package.json.
let appVersion = "2.9.22";
try {
  // In packaged app, __dirname is inside app.asar
  const pkg = require("./package.json");
  if (pkg && pkg.version) appVersion = pkg.version;
} catch (e) {
  // Fallback: try reading from parent directory
  try {
    const pkg = require("../package.json");
    if (pkg && pkg.version) appVersion = pkg.version;
  } catch (e2) {
    // Use default
  }
}

contextBridge.exposeInMainWorld("posElectron", {
  version: appVersion,
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
    // Check for updates — returns { version, releaseNotes, releaseDate, downloadSize, downloadUrl? } or null
    check: () => ipcRenderer.invoke("updater:check"),
    // Download the available update
    // If downloadUrl is provided (from GitHub API fallback), downloads directly
    download: (downloadUrl) => ipcRenderer.invoke("updater:download", downloadUrl),
    // Quit and install the downloaded update
    install: () => ipcRenderer.invoke("updater:install"),
    // Listen for download progress events — callback receives percent (0-100)
    onProgress: (callback) => {
      const handler = (_event, percent) => callback(percent);
      ipcRenderer.on("updater:progress", handler);
      return () => ipcRenderer.removeListener("updater:progress", handler);
    },
  },
});
