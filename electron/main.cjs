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
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Google Drive backup module
const gdrive = require("./google-drive.cjs");
const http = require("http");
const { spawn } = require("child_process");

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
let dbPath = path.join(userData, "pos.db"); // module-level, updated by startServer()

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
    // Auto-restart the server if it crashes (up to 3 attempts)
    if (!isQuitting && restartAttempts < 3) {
      restartAttempts++;
      console.log(`[POS] Auto-restarting server (attempt ${restartAttempts}/3) in 2s...`);
      setTimeout(() => {
        if (!isQuitting) {
          startServer();
          // Re-load the page in the window if it exists
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
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Show window only after content loads (avoid white flash)
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
    // Force focus on webview so keyboard shortcuts work
    setTimeout(() => mainWindow.focusOnWebView(), 200);
  });

  // CRITICAL: Force-show the window after 8 seconds even if ready-to-show
  // never fires (e.g. server slow to respond). This prevents the app from
  // appearing "dead" (nothing displays) when the Next.js server is still
  // starting up or hits an error.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log("[POS] Force-showing window after timeout");
      mainWindow.show();
      mainWindow.focus();
      mainWindow.focusOnWebView();
    }
  }, 8000);

  // Re-focus webview on window focus/click (ensures keyboard events work)
  mainWindow.on("focus", () => {
    mainWindow.focusOnWebView();
  });
  mainWindow.on("show", () => {
    setTimeout(() => mainWindow.focusOnWebView(), 100);
  });

  // If the page fails to load, show an error page so the user knows
  // something went wrong instead of a blank white screen.
  mainWindow.webContents.on("did-fail-load", (_evt, errorCode, errorDesc) => {
    console.error("[POS] Page failed to load:", errorCode, errorDesc);
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<html><body style="font-family:Tahoma,Arial,sans-serif;padding:40px;background:#f8fafc;color:#000">` +
            `<h2 style="color:#dc2626">Server is starting...</h2>` +
            `<p>The app is loading. Please wait a moment.</p>` +
            `<p style="color:#666;font-size:12px">Error: ${errorDesc} (${errorCode})</p>` +
            `<p style="color:#666;font-size:12px">If this persists, restart the app.</p>` +
            `</body></html>`
        )
    );
    // Retry loading the actual page after 3 seconds
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`http://${HOST}:${PORT}/`);
      }
    }, 3000);
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

  // ---- Auto-update checker (stub — actual update UI is in the Next.js app) ----
  // The in-app Settings page handles update checks via the Next.js API.
  // This is a no-op stub so the setTimeout/setInterval calls don't throw.
  function checkForUpdates() {
    // No-op: update checking is handled by the Next.js Settings UI.
    // Kept here for backwards compatibility with older main.cjs callers.
  }

  app.whenReady().then(async () => {
    startServer();
    const ok = await waitForServer();
    if (!ok) {
      console.error("[POS] Server did not start in time");
    }
    createWindow();
    startBackupScheduler();
    // Auto-update checks are handled in-app; no-op here.
  });

  app.on("window-all-closed", () => {
    isQuitting = true;
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
