// Electron main process for Shop POS System
// Spawns the Next.js standalone server as an isolated child process (using
// Electron's bundled Node via ELECTRON_RUN_AS_NODE) and loads it in a window.
// This is more robust than require()-ing server.js in-process because the
// Next server gets its own clean cwd, env and module resolution (important
// for native modules like Prisma's query engine and sharp).
const {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  globalShortcut,
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Google Drive backup module
const gdrive = require("./google-drive.cjs");
const http = require("http");

// electron-updater for delta/differential updates
let autoUpdater = null;
try {
  autoUpdater = require("electron-updater").autoUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  console.log("[POS] electron-updater loaded successfully");
} catch (e) {
  console.log("[POS] electron-updater not available, auto-update disabled:", e.message);
}
const { spawn } = require("child_process");

// Old Hardware Fix: disable GPU acceleration for Pentium/Old PCs (black screen fix)
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("disable-gpu");

const PORT = 4783;
const HOST = "127.0.0.1";

const isDev = !app.isPackaged;
const serverDir = isDev
  ? path.join(__dirname, "..", ".next", "standalone")
  : path.join(process.resourcesPath, "server");

// Database lives in userData (writable, persists across versions)
const userData = app.getPath("userData");
const localDbPath = path.join(userData, "pos.db");

// Path to a small config file the Next.js API writes when the user changes
// the multi-computer sharing mode in Settings. Read BEFORE ensureDatabase()
// so we know which database file to actually use (local AppData vs. a
// network share pointed to by another computer on the LAN).
const SHARE_CONFIG_PATH = path.join(os.homedir(), ".shoppos-config.json");

/**
 * Read ~/.shoppos-config.json (if present) and return the stored sharing
 * config. Returns null if the file does not exist or is malformed.
 *
 * Shape: { shareMode: "local" | "host" | "client", dbNetworkPath: string|null }
 */
function readShareConfig() {
  try {
    if (!fs.existsSync(SHARE_CONFIG_PATH)) return null;
    const raw = fs.readFileSync(SHARE_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const mode = parsed.shareMode;
    if (mode !== "local" && mode !== "host" && mode !== "client") return null;
    return {
      shareMode: mode,
      dbNetworkPath:
        typeof parsed.dbNetworkPath === "string" && parsed.dbNetworkPath
          ? parsed.dbNetworkPath
          : null,
    };
  } catch (e) {
    console.warn("[POS] Could not read share config:", e?.message || e);
    return null;
  }
}

/**
 * Decide which database path to use based on the share config:
 *   - "client" mode with a network path → use the network .db file
 *   - "host" or "local" (default)      → use the local AppData .db file
 *
 * Returns an object with the resolved path + a label for logging.
 */
function resolveDbPath() {
  const cfg = readShareConfig();
  if (cfg && cfg.shareMode === "client" && cfg.dbNetworkPath) {
    console.log(
      `[POS] Share config: client mode → using network DB at ${cfg.dbNetworkPath}`
    );
    return { dbPath: cfg.dbNetworkPath, mode: "client" };
  }
  if (cfg && cfg.shareMode === "host") {
    console.log("[POS] Share config: host mode → using local DB (shared via folder)");
    return { dbPath: localDbPath, mode: "host" };
  }
  if (cfg) {
    console.log(`[POS] Share config: ${cfg.shareMode} → using local DB`);
  }
  return { dbPath: localDbPath, mode: "local" };
}

// Copy the template DB (shipped in resources) on first launch.
// NOTE: when in client mode the DB lives on another computer, so we
// must NOT seed a local file — the host is responsible for that.
function ensureDatabase(dbPath, mode) {
  if (mode === "client") {
    // Don't try to create/copy a template file on the network share from
    // the client side — the host owns that file. We only log.
    if (fs.existsSync(dbPath)) {
      console.log(`[POS] Using existing network database at ${dbPath}`);
    } else {
      console.warn(
        `[POS] Network DB not found at ${dbPath}. Make sure the host computer is running and has shared the folder.`
      );
    }
    return;
  }
  if (!fs.existsSync(dbPath)) {
    const template = path.join(serverDir, "pos.db");
    try {
      if (fs.existsSync(template)) {
        fs.copyFileSync(template, dbPath);
        console.log("[POS] Copied template database to", dbPath);
      } else {
        console.warn("[POS] Template DB not found at", template);
      }
    } catch (e) {
      console.error("[POS] Failed to copy template DB:", e);
    }
  } else {
    console.log("[POS] Using existing database at", dbPath);
  }
}

let mainWindow = null;
let serverProcess = null;
let dbPath = path.join(userData, "pos.db"); // module-level, used by gdrive handlers

function startServer() {
  const resolved = resolveDbPath();
  dbPath = resolved.dbPath;
  ensureDatabase(dbPath, resolved.mode);

  const serverJs = path.join(serverDir, "server.js");
  if (!fs.existsSync(serverJs)) {
    console.error("[POS] server.js not found at", serverJs);
    return false;
  }

  // Use Electron's own executable as a Node runtime (ELECTRON_RUN_AS_NODE=1)
  // so the standalone server runs as a plain Node script in its own process.
  // We renamed node_modules -> nm (in the packaged resources) to bypass
  // electron-builder's node_modules pruning in extraResources, so set
  // NODE_PATH so Node can still resolve modules from nm.
  const nmDir = path.join(serverDir, "nm");
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(PORT),
    HOSTNAME: HOST,
    DATABASE_URL: `file:${dbPath}`,
    NEXTAUTH_SECRET:
      process.env.NEXTAUTH_SECRET || "pos-electron-shop-secret-secure-2024",
    NEXTAUTH_URL: `http://${HOST}:${PORT}`,
    NODE_ENV: "production",
    NODE_PATH: nmDir,
  };

  serverProcess = spawn(process.execPath, [serverJs], {
    cwd: serverDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProcess.stdout.on("data", (d) =>
    process.stdout.write(`[server] ${d}`)
  );
  serverProcess.stderr.on("data", (d) =>
    process.stderr.write(`[server] ${d}`)
  );
  serverProcess.on("exit", (code) => {
    console.log("[POS] Server process exited with code", code);
    serverProcess = null;
    // Auto-restart server if it crashes (up to 3 attempts)
    if (!isQuitting && restartAttempts < 3) {
      restartAttempts++;
      console.log(`[POS] Auto-restarting server (attempt ${restartAttempts}/3) in 2s...`);
      setTimeout(() => {
        if (!isQuitting) {
          startServer();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(`http://${HOST}:${PORT}/`);
          }
        }
      }, 2000);
    }
  });

  return true;
}

let isQuitting = false;
let restartAttempts = 0;

function waitForServer(retries = 90) {
  return new Promise((resolve) => {
    let tries = 0;
    const check = () => {
      const req = http.get(
        { host: HOST, port: PORT, path: "/", timeout: 1000 },
        (res) => {
          res.destroy();
          resolve(true);
        }
      );
      req.on("error", () => {
        tries++;
        if (tries >= retries) resolve(false);
        else setTimeout(check, 400);
      });
      req.on("timeout", () => {
        req.destroy();
        tries++;
        if (tries >= retries) resolve(false);
        else setTimeout(check, 400);
      });
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    title: "Shop POS System",
    backgroundColor: "#f8fafc",
    autoHideMenuBar: true,
    show: false,
    // Center on screen so window doesn't appear off-screen
    center: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Center explicitly (belt-and-suspenders for multi-monitor setups)
  mainWindow.center();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Show window only after content loads (avoid white flash)
  mainWindow.once("ready-to-show", () => {
    mainWindow.center();
    mainWindow.show();
    mainWindow.focus();
    // Briefly set always-on-top to ensure it appears above other windows
    mainWindow.setAlwaysOnTop(true);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(false);
        mainWindow.focusOnWebView();
      }
    }, 300);
  });

  // CRITICAL FIX: Force-show the window after 5 seconds even if
  // ready-to-show never fires. This fixes the "app runs in task manager
  // but nothing displays" issue. Causes: slow server start, GPU issues,
  // or Next.js page taking too long on first load.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.log("[POS] Force-showing window after 5s timeout");
      mainWindow.center();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.setAlwaysOnTop(true);
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setAlwaysOnTop(false);
          mainWindow.focusOnWebView();
        }
      }, 500);
    }
  }, 5000);

  // Second force-show at 15 seconds with a loading message
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.log("[POS] Force-showing window after 15s with loading message");
      mainWindow.center();
      mainWindow.show();
      mainWindow.focus();
    }
  }, 15000);

  // Re-focus webview on window focus/click (ensures keyboard events work)
  mainWindow.on("focus", () => {
    mainWindow.focusOnWebView();
  });
  mainWindow.on("show", () => {
    setTimeout(() => mainWindow.focusOnWebView(), 100);
  });

  // If the page fails to load, show a loading message and retry
  mainWindow.webContents.on("did-fail-load", (_evt, errorCode, errorDesc) => {
    console.error("[POS] Page failed to load:", errorCode, errorDesc);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) {
        mainWindow.center();
        mainWindow.show();
        mainWindow.focus();
      }
      mainWindow.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<html><body style="font-family:Tahoma,Arial,sans-serif;padding:40px;background:#f8fafc;color:#000;text-align:center">` +
              `<h2 style="color:#059669">Shop POS System</h2>` +
              `<p style="font-size:14px">Loading... Please wait.</p>` +
              `<p style="color:#666;font-size:12px">The server is starting up.</p>` +
              `</body></html>`
          )
      );
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(`http://${HOST}:${PORT}/`);
        }
      }, 2000);
    }
  });

  mainWindow.loadURL(`http://${HOST}:${PORT}/`);
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  // Open a folder in the OS file explorer. Used by the Multi-Computer
  // Sharing card so the user can reveal the local data folder and share it
  // on the LAN. Falls back to opening the parent directory if the file
  // does not exist yet.
  ipcMain.handle("pos:open-path", async (_evt, p) => {
    if (typeof p !== "string" || !p) {
      return { ok: false, error: "Invalid path" };
    }
    try {
      // If the path points to a file that doesn't exist yet, open its
      // parent directory instead so the user can still see where it would
      // live (e.g. the ShopPOS folder they need to share).
      if (!fs.existsSync(p)) {
        const dir = path.dirname(p);
        if (fs.existsSync(dir)) {
          await shell.openPath(dir);
          return { ok: true, opened: dir };
        }
        return { ok: false, error: "Path does not exist" };
      }
      const result = await shell.openPath(p);
      if (result) {
        return { ok: false, error: result };
      }
      return { ok: true, opened: p };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // ---- Google Drive IPC handlers ----
  ipcMain.handle("gdrive:connect", async (event) => {
    try {
      await gdrive.startOAuthFlow(mainWindow);
      return { ok: true, status: gdrive.getStatus() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("gdrive:disconnect", async () => {
    try {
      await gdrive.disconnect();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("gdrive:status", async () => {
    return gdrive.getStatus();
  });

  ipcMain.handle("gdrive:backup", async () => {
    try {
      const result = await gdrive.uploadBackup(dbPath);
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("gdrive:listBackups", async () => {
    try {
      const backups = await gdrive.listCloudBackups();
      return { ok: true, backups };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("gdrive:save-config", async (event, clientId, clientSecret) => {
    try {
      const isDev = !app.isPackaged;
      const configPath = isDev
        ? path.join(__dirname, "..", "google-oauth.config.json")
        : path.join(process.resourcesPath, "google-oauth.config.json");
      const currentConfig = gdrive.getConfig();
      const newConfig = {
        ...(currentConfig || {}),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        redirectUri: currentConfig?.redirectUri || "http://localhost:4784",
        scopes: currentConfig?.scopes || ["https://www.googleapis.com/auth/drive.file"],
        backupFolderName: currentConfig?.backupFolderName || "POS Backups",
        backupScheduleHours: currentConfig?.backupScheduleHours || 4,
      };
      fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
      gdrive.reloadConfig();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle("gdrive:restore", async (event, fileId) => {
    try {
      const tempPath = path.join(os.tmpdir(), "pos-restore-" + Date.now() + ".db");
      await gdrive.downloadBackup(fileId, tempPath);
      const safetyDir = path.join(os.homedir(), "ShopPOSBackups");
      if (!fs.existsSync(safetyDir)) fs.mkdirSync(safetyDir, { recursive: true });
      fs.copyFileSync(dbPath, path.join(safetyDir, `pre-restore-${Date.now()}.db`));
      fs.copyFileSync(tempPath, dbPath);
      fs.unlinkSync(tempPath);
      return { ok: true, message: "Restored. Please restart the app." };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ---- Auto backup scheduler ----
  let backupTimer = null;
  let lastAutoBackup = 0;
  function startBackupScheduler() {
    if (backupTimer) clearInterval(backupTimer);
    backupTimer = setInterval(async () => {
      const status = gdrive.getStatus();
      if (!status.connected) return;
      const now = Date.now();
      if (now - lastAutoBackup < 4 * 60 * 60 * 1000) return;
      try {
        await gdrive.uploadBackup(dbPath);
        lastAutoBackup = now;
        console.log("[POS] Auto cloud backup completed");
      } catch (e) {
        console.log("[POS] Auto backup failed:", e.message);
      }
    }, 60 * 60 * 1000);
  }

  // ============================================================
  // electron-updater IPC handlers (delta/differential updates)
  // ============================================================
  if (autoUpdater) {
    // Check for updates
    ipcMain.handle("updater:check", async () => {
      try {
        const result = await autoUpdater.checkForUpdates();
        if (result && result.updateInfo && result.updateInfo.version) {
          const info = result.updateInfo;
          // Format release notes
          let notes = "";
          if (info.releaseNotes) {
            if (typeof info.releaseNotes === "string") {
              notes = info.releaseNotes;
            } else if (Array.isArray(info.releaseNotes)) {
              notes = info.releaseNotes.map((n) => n.note || String(n)).join("\n");
            } else if (info.releaseNotes.note) {
              notes = info.releaseNotes.note;
            }
          }
          return {
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: notes || null,
            downloadSize: info.files?.[0]?.size || null,
          };
        }
        return null; // No update available
      } catch (e) {
        console.error("[POS] Update check failed:", e.message);
        throw new Error(e.message);
      }
    });

    // Download update
    ipcMain.handle("updater:download", async () => {
      try {
        await autoUpdater.downloadUpdate();
        return { ok: true };
      } catch (e) {
        console.error("[POS] Update download failed:", e.message);
        throw new Error(e.message);
      }
    });

    // Install update (quit and install)
    ipcMain.handle("updater:install", async () => {
      try {
        autoUpdater.quitAndInstall();
      } catch (e) {
        console.error("[POS] Install failed:", e.message);
        throw new Error(e.message);
      }
    });

    // Forward download progress to renderer
    autoUpdater.on("download-progress", (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const percent = progress.percent ? Math.round(progress.percent) : 0;
        mainWindow.webContents.send("updater:progress", percent);
      }
    });

    // Notify renderer when download completes
    autoUpdater.on("update-downloaded", () => {
      console.log("[POS] Update downloaded, ready to install");
    });

    autoUpdater.on("error", (err) => {
      console.error("[POS] Updater error:", err.message);
    });
  } else {
    // Fallback no-op handlers when electron-updater is not available
    ipcMain.handle("updater:check", async () => null);
    ipcMain.handle("updater:download", async () => {
      throw new Error("Auto-update is not available in this build");
    });
    ipcMain.handle("updater:install", async () => {
      throw new Error("Auto-update is not available in this build");
    });
  }

  app.whenReady().then(async () => {
    // F1 shortcut: open POS view and focus barcode input
    globalShortcut.register("F1", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(`
          try {
            // Click POS nav item first
            const posNav = document.querySelector('[data-view-id="POS"]');
            if (posNav) posNav.click();
            // Then focus barcode input
            setTimeout(() => {
              const bi = document.querySelector('[data-testid="barcode-input"]');
              if (bi) bi.focus();
            }, 200);
          } catch(e) {}
        `).catch(() => {});
        mainWindow.focus();
      }
    });

    startServer();
    const ok = await waitForServer();
    if (!ok) {
      console.error("[POS] Server did not start in time");
    }
    createWindow();
    startBackupScheduler();
  });

  app.on("window-all-closed", () => {
    isQuitting = true;
    globalShortcut.unregisterAll();
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch {}
    }
    app.quit();
  });

  app.on("before-quit", () => {
    isQuitting = true;
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch {}
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

process.on("exit", () => {
  isQuitting = true;
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {}
  }
});
