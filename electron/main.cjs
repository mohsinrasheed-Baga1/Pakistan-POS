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
  autoUpdater.allowDowngrade = false;
  autoUpdater.requestHeaders = {
    "Cache-Control": "no-cache",
  };
  // Explicitly set the GitHub repository as the update provider.
  // This ensures electron-updater knows exactly where to look for releases
  // even if app-update.yml is missing or incorrect.
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "mohsinrasheed-Baga1",
    repo: "shop-pos-system",
    releaseType: "release",
  });
  console.log("[POS] electron-updater loaded successfully (delta updates enabled, GitHub feed set)");
} catch (e) {
  console.log("[POS] electron-updater not available, auto-update disabled:", e.message);
}
const { spawn } = require("child_process");

// ─── Version comparison helper ─────────────────────────────────────────────
// Returns true if 'latest' is newer than 'current'
// Both are strings like "2.9.15"
function isNewerVersion(latest, current) {
  const l = latest.split(".").map(Number);
  const c = current.split(".").map(Number);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const lv = l[i] || 0;
    const cv = c[i] || 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

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

  // Open a URL in the default browser (used by Check Updates download)
  ipcMain.handle("pos:open-external", async (_evt, url) => {
    if (typeof url !== "string" || !url) return;
    try {
      await shell.openExternal(url);
    } catch (e) {
      console.error("[POS] Failed to open external URL:", e);
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
  let lastBackupError = null;
  const AUTO_BACKUP_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
  const AUTO_BACKUP_RETRY_MS = 5 * 60 * 1000; // retry after 5 minutes on failure
  const AUTO_BACKUP_INITIAL_DELAY_MS = 30 * 1000; // 30 seconds after app start

  async function performAutoBackup(reason = "scheduled") {
    try {
      const status = gdrive.getStatus();
      if (!status.connected) {
        lastBackupError = "Google Drive not connected";
        return { ok: false, reason: "not_connected" };
      }
      // Rate limit: don't backup more than once per 5 minutes
      // (prevents excessive backups if many sales happen quickly)
      const now = Date.now();
      const MIN_BACKUP_GAP_MS = 5 * 60 * 1000; // 5 minutes
      if (now - lastAutoBackup < MIN_BACKUP_GAP_MS && reason !== "manual") {
        return { ok: false, reason: "rate_limited", message: "Backup too recent" };
      }
      console.log(`[POS] Auto backup starting (${reason})...`);
      const result = await gdrive.uploadBackup(dbPath);
      lastAutoBackup = Date.now();
      lastBackupError = null;
      console.log(`[POS] Auto cloud backup completed (${reason}):`, result.name);
      // Notify the renderer so it can update the UI
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("gdrive:auto-backup-done", {
          ok: true,
          reason,
          fileName: result.name,
          size: result.size,
          timestamp: new Date().toISOString(),
        });
      }
      return { ok: true, ...result };
    } catch (e) {
      lastBackupError = e.message;
      console.log(`[POS] Auto backup failed (${reason}):`, e.message);
      // Notify renderer about failure
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("gdrive:auto-backup-failed", {
          ok: false,
          reason,
          error: e.message,
          timestamp: new Date().toISOString(),
        });
      }
      return { ok: false, error: e.message };
    }
  }

  function startBackupScheduler() {
    if (backupTimer) clearInterval(backupTimer);
    // Initial backup after 30 seconds (if connected)
    setTimeout(async () => {
      const status = gdrive.getStatus();
      if (status.connected && Date.now() - lastAutoBackup > AUTO_BACKUP_INTERVAL_MS) {
        await performAutoBackup("initial");
      }
    }, AUTO_BACKUP_INITIAL_DELAY_MS);

    // Then check every hour
    backupTimer = setInterval(async () => {
      const status = gdrive.getStatus();
      if (!status.connected) return;
      const now = Date.now();
      const timeSinceLast = now - lastAutoBackup;
      // Normal schedule: 4 hours since last successful backup
      // Retry schedule: if last backup failed, retry after 5 minutes
      const shouldRetry =
        lastBackupError && timeSinceLast > AUTO_BACKUP_RETRY_MS;
      const shouldSchedule = !lastBackupError && timeSinceLast > AUTO_BACKUP_INTERVAL_MS;
      if (shouldRetry || shouldSchedule) {
        await performAutoBackup(shouldRetry ? "retry" : "scheduled");
      }
    }, 60 * 60 * 1000); // check every hour
  }

  // IPC: Manual trigger for backup (used by Settings > Backup Now button)
  // and triggered automatically after each sale is completed
  ipcMain.handle("gdrive:trigger-backup", async (_evt, reason = "manual") => {
    return await performAutoBackup(reason);
  });

  // IPC: Get last auto-backup status (for UI display)
  ipcMain.handle("gdrive:backup-status", async () => {
    return {
      lastBackupAt: lastAutoBackup > 0 ? new Date(lastAutoBackup).toISOString() : null,
      lastError: lastBackupError,
      connected: gdrive.getStatus().connected,
      nextScheduledIn: Math.max(0, AUTO_BACKUP_INTERVAL_MS - (Date.now() - lastAutoBackup)),
    };
  });

  // ============================================================
  // System Fingerprint — Real Machine ID (v2.10.11)
  // ============================================================
  // The renderer process (browser) can't access MAC address, hostname,
  // or disk serial — these are OS-level APIs. So we collect them here
  // in the main process and return to renderer via IPC.
  ipcMain.handle("system:get-fingerprint", async () => {
    try {
      const os = require("os");
      const { execSync } = require("child_process");
      const crypto = require("crypto");

      // 1. MAC address (primary identifier)
      let macAddress = "no-mac";
      try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
          const nets = interfaces[name];
          if (!nets) continue;
          for (const net of nets) {
            if (!net.internal && net.family === "IPv4" && net.mac && net.mac !== "00:00:00:00:00:00") {
              macAddress = net.mac;
              break;
            }
          }
          if (macAddress !== "no-mac") break;
        }
      } catch {}

      // 2. Hostname
      let hostname = "unknown-host";
      try { hostname = os.hostname() || hostname; } catch {}

      // 3. CPU model
      let cpuModel = "unknown-cpu";
      let cpuCores = 1;
      try {
        const cpus = os.cpus();
        cpuModel = cpus?.[0]?.model || cpuModel;
        cpuCores = cpus?.length || cpuCores;
      } catch {}

      // 4. Total memory
      let totalMemory = "0 GB";
      try {
        const totalBytes = os.totalmem();
        totalMemory = `${(totalBytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
      } catch {}

      // 5. Machine UUID / Serial (Windows: registry, Mac: ioreg, Linux: /etc/machine-id)
      let machineUuid = "no-uuid";
      try {
        if (process.platform === "win32") {
          // Windows: get machine GUID from registry
          const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', { windowsHide: true }).toString();
          const match = out.match(/MachineGuid\s+REG_SZ\s+([A-Fa-f0-9-]+)/);
          if (match) machineUuid = match[1];
        } else if (process.platform === "darwin") {
          // Mac: IOPlatformUUID
          const out = execSync("ioreg -rd1 -c IOPlatformExpertDevice | awk '/IOPlatformUUID/ { print $3 }'", { windowsHide: true }).toString().trim();
          if (out) machineUuid = out.replace(/"/g, "");
        } else if (process.platform === "linux") {
          // Linux: /etc/machine-id
          const fs = require("fs");
          if (fs.existsSync("/etc/machine-id")) {
            machineUuid = fs.readFileSync("/etc/machine-id", "utf-8").trim();
          }
        }
      } catch {}

      // 6. Disk volume serial (Windows only)
      let diskSerial = "no-disk";
      try {
        if (process.platform === "win32") {
          const out = execSync("vol C:", { windowsHide: true }).toString();
          const match = out.match(/Serial Number is\s+([A-Fa-f0-9-]+)/);
          if (match) diskSerial = match[1];
        }
      } catch {}

      // 7. Current user
      let userName = "unknown-user";
      try { userName = os.userInfo()?.username || userName; } catch {}

      // Combine ALL unique identifiers into fingerprint
      const fingerprint = [
        `mac=${macAddress}`,
        `host=${hostname}`,
        `cpu=${cpuModel}`,
        `cores=${cpuCores}`,
        `mem=${totalMemory}`,
        `uuid=${machineUuid}`,
        `disk=${diskSerial}`,
        `user=${userName}`,
      ].join("|");

      // SHA-256 hash → take first 24 chars
      const hash = crypto.createHash("sha256").update(fingerprint).digest("hex").substring(0, 24).toUpperCase();

      // Format: SYS-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
      const systemId = `SYS-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 24)}`;

      return {
        systemId,
        systemInfo: {
          hostname,
          platform: `${os.type()} ${os.release()}`,
          cpuModel,
          cpuCores,
          totalMemory,
          machineModel: `${userName}@${hostname}`,
          macAddress,
          machineUuid,
          diskSerial,
        },
      };
    } catch (e) {
      console.error("[POS] System fingerprint error:", e.message);
      return { error: e.message, systemId: null, systemInfo: null };
    }
  });

  // ============================================================
  // electron-updater IPC handlers (delta/differential updates)
  // ============================================================
  if (autoUpdater) {
    // Check for updates
    ipcMain.handle("updater:check", async () => {
      try {
        // ─── Method 1: Try electron-updater first ────────────────────
        console.log("[POS] Checking for updates via electron-updater...");
        const result = await autoUpdater.checkForUpdates();
        if (result && result.updateInfo && result.updateInfo.version) {
          const info = result.updateInfo;
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
          console.log("[POS] Update found via electron-updater:", info.version);
          return {
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: notes || null,
            downloadSize: info.files?.[0]?.size || null,
            source: "electron-updater",
          };
        }
        console.log("[POS] electron-updater returned no update, trying GitHub API fallback...");

        // ─── Method 2: Fallback — fetch directly from GitHub Releases API ───
        // This ensures we ALWAYS find the latest release even if
        // electron-updater's internal logic fails.
        const https = require("https");
        const githubData = await new Promise((resolve, reject) => {
          const options = {
            hostname: "api.github.com",
            path: "/repos/mohsinrasheed-Baga1/shop-pos-system/releases/latest",
            headers: {
              "User-Agent": "Shop-POS-System-Updater",
              "Accept": "application/vnd.github.v3+json",
            },
          };
          https.get(options, (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => {
              try { resolve(JSON.parse(body)); }
              catch (e) { reject(new Error("Failed to parse GitHub response")); }
            });
          }).on("error", reject);
        });

        if (githubData && githubData.tag_name) {
          const latestVersion = githubData.tag_name.replace(/^v/, "");
          // Get current app version
          const currentVersion = app.getVersion();
          console.log("[POS] GitHub latest:", latestVersion, "Current:", currentVersion);

          // Compare versions
          if (latestVersion && isNewerVersion(latestVersion, currentVersion)) {
            // Find the .exe download URL
            const exeAsset = (githubData.assets || []).find(a => a.name.endsWith(".exe"));
            const downloadUrl = exeAsset ? exeAsset.browser_download_url : null;
            const downloadSize = exeAsset ? exeAsset.size : null;

            console.log("[POS] Update found via GitHub API:", latestVersion, "URL:", downloadUrl);
            return {
              version: latestVersion,
              releaseDate: githubData.published_at,
              releaseNotes: githubData.body || null,
              downloadSize: downloadSize,
              downloadUrl: downloadUrl,
              source: "github-api",
            };
          }
        }

        console.log("[POS] No update available (both methods checked)");
        return null; // No update available
      } catch (e) {
        console.error("[POS] Update check failed:", e.message);
        throw new Error(e.message);
      }
    });

    // Download update
    ipcMain.handle("updater:download", async (event, downloadUrl) => {
      try {
        // If a downloadUrl is provided (from GitHub API fallback),
        // download the .exe directly and save it to temp directory.
        if (downloadUrl) {
          console.log("[POS] Downloading update from GitHub URL:", downloadUrl);
          const https = require("https");
          const fs = require("fs");
          const path = require("path");
          const os = require("os");

          const tempDir = os.tmpdir();
          const fileName = "Shop-POS-System-Update.exe";
          const filePath = path.join(tempDir, fileName);
          const fileStream = fs.createWriteStream(filePath);

          await new Promise((resolve, reject) => {
            const download = (url) => {
              https.get(url, (res) => {
                // Handle redirects (GitHub uses 302 redirects)
                if (res.statusCode === 302 || res.statusCode === 301) {
                  download(res.headers.location);
                  return;
                }
                if (res.statusCode !== 200) {
                  reject(new Error(`Download failed: HTTP ${res.statusCode}`));
                  return;
                }

                const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
                let downloadedBytes = 0;

                res.on("data", (chunk) => {
                  downloadedBytes += chunk.length;
                  if (totalBytes > 0) {
                    const percent = Math.round((downloadedBytes / totalBytes) * 100);
                    if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.send("updater:progress", percent);
                    }
                  }
                });

                res.pipe(fileStream);
                fileStream.on("finish", () => {
                  fileStream.close();
                  console.log("[POS] Download complete:", filePath);
                  resolve(filePath);
                });
              }).on("error", reject);
            };
            download(downloadUrl);
          });

          // Save the file path for installation
          global.downloadedUpdatePath = filePath;
          return { ok: true, filePath };
        }

        // Default: use electron-updater's built-in download (delta if possible)
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
        // If we downloaded via GitHub API fallback, run the installer directly
        if (global.downloadedUpdatePath) {
          console.log("[POS] Installing from:", global.downloadedUpdatePath);
          const { exec, spawn } = require("child_process");
          const fs = require("fs");
          const path = require("path");

          // Get the app executable path (for re-launching after install)
          const appExePath = process.execPath;
          const appDir = path.dirname(appExePath);
          console.log("[POS] Will re-launch app from:", appExePath);

          // Write a small helper batch file that:
          // 1. Waits for current app to exit
          // 2. Runs the installer silently
          // 3. Re-launches the new app after install completes
          const helperBat = path.join(app.getPath("temp"), "pos-update-helper.bat");
          const batContent = `@echo off
REM Wait for current app to exit
timeout /t 2 /nobreak >nul
REM Run installer silently
start /wait "" "${global.downloadedUpdatePath}" /S
REM Wait for install to complete
timeout /t 3 /nobreak >nul
REM Re-launch the new app
start "" "${appExePath}"
REM Self-cleanup
del "%~f0"
`;
          fs.writeFileSync(helperBat, batContent);

          // Launch the helper batch detached from this app
          const child = spawn("cmd.exe", ["/c", helperBat], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
          });
          child.unref();

          // Give the helper a moment, then quit
          setTimeout(() => {
            app.quit();
          }, 500);
          return;
        }
        // Default: electron-updater's quit and install
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
    // ─── FALLBACK: electron-updater NOT available ──────────────────────
    // Still provide download/install via direct HTTPS (no electron-updater needed)
    // This handles the case where electron-updater module is missing from the build
    console.log("[POS] electron-updater NOT available — using direct download fallback");

    ipcMain.handle("updater:check", async () => {
      // Check handled by renderer (GitHub API fetch) — return null
      return null;
    });

    ipcMain.handle("updater:download", async (event, downloadUrl) => {
      // If no downloadUrl provided, try to get it from GitHub API directly
      if (!downloadUrl) {
        console.log("[POS] No download URL provided — fetching from GitHub API...");
        const https = require("https");
        const githubData = await new Promise((resolve, reject) => {
          const options = {
            hostname: "api.github.com",
            path: "/repos/mohsinrasheed-Baga1/shop-pos-system/releases/latest",
            headers: {
              "User-Agent": "Shop-POS-System-Updater",
              "Accept": "application/vnd.github.v3+json",
            },
          };
          https.get(options, (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => {
              try { resolve(JSON.parse(body)); }
              catch (e) { reject(new Error("Failed to parse GitHub response")); }
            });
          }).on("error", reject);
        });

        const exeAsset = (githubData?.assets || []).find(a => a.name.endsWith(".exe"));
        if (!exeAsset) {
          throw new Error("No .exe file found in latest GitHub release");
        }
        downloadUrl = exeAsset.browser_download_url;
        console.log("[POS] Got download URL from GitHub:", downloadUrl);
      }

      console.log("[POS] Downloading update from:", downloadUrl);
      const https = require("https");
      const fs = require("fs");
      const path = require("path");
      const os = require("os");

      const tempDir = os.tmpdir();
      const fileName = "Shop-POS-System-Update.exe";
      const filePath = path.join(tempDir, fileName);
      const fileStream = fs.createWriteStream(filePath);

      await new Promise((resolve, reject) => {
        const download = (url) => {
          https.get(url, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
              download(res.headers.location);
              return;
            }
            if (res.statusCode !== 200) {
              reject(new Error(`Download failed: HTTP ${res.statusCode}`));
              return;
            }

            const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
            let downloadedBytes = 0;

            res.on("data", (chunk) => {
              downloadedBytes += chunk.length;
              if (totalBytes > 0) {
                const percent = Math.round((downloadedBytes / totalBytes) * 100);
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send("updater:progress", percent);
                }
              }
            });

            res.pipe(fileStream);
            fileStream.on("finish", () => {
              fileStream.close();
              console.log("[POS] Download complete:", filePath);
              resolve(filePath);
            });
          }).on("error", reject);
        };
        download(downloadUrl);
      });

      global.downloadedUpdatePath = filePath;
      return { ok: true, filePath };
    });

    ipcMain.handle("updater:install", async () => {
      if (global.downloadedUpdatePath) {
        console.log("[POS] Installing from:", global.downloadedUpdatePath);
        const { spawn } = require("child_process");
        const fs = require("fs");
        const path = require("path");

        const appExePath = process.execPath;
        const helperBat = path.join(app.getPath("temp"), "pos-update-helper.bat");
        const batContent = `@echo off
timeout /t 2 /nobreak >nul
start /wait "" "${global.downloadedUpdatePath}" /S
timeout /t 3 /nobreak >nul
start "" "${appExePath}"
del "%~f0"
`;
        fs.writeFileSync(helperBat, batContent);
        const child = spawn("cmd.exe", ["/c", helperBat], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();
        setTimeout(() => app.quit(), 500);
        return;
      }
      throw new Error("No update downloaded yet");
    });
  }

  app.whenReady().then(async () => {
    // ─── Set up Windows network sharing permissions automatically ───────
    // This allows Multi-PC mode to work just by connecting to WiFi/LAN,
    // without the customer needing to manually configure Windows settings.
    try {
      await setupNetworkSharingPermissions();
    } catch (e) {
      console.log("[POS] Network sharing setup warning:", e.message);
    }

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

  // ============================================================
  // Auto Network Sharing Permissions Setup
  // ============================================================
  // On Windows, this automatically configures:
  // 1. Windows Firewall inbound rule for the app's port (3000)
  // 2. Network discovery + file sharing enabled on the current network profile
  // 3. SMB share 'ShopPOS' on the data folder (host mode)
  //
  // This runs in the background after app launch. If it fails (e.g. user is
  // not admin), the app still works in single-PC mode — only multi-PC mode
  // would require manual firewall configuration by the user.
  async function setupNetworkSharingPermissions() {
    if (process.platform !== "win32") {
      console.log("[POS] Network sharing: skipping on non-Windows");
      return;
    }

    const { exec } = require("child_process");
    const path = require("path");
    const fs = require("fs");
    const os = require("os");

    const dataDir = path.join(app.getPath("userData"), "data");
    if (!fs.existsSync(dataDir)) {
      try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
    }

    // Run a series of netsh commands to enable network sharing
    // (silent — no UAC prompt in most cases since we use 'netsh' which is allowed)
    const commands = [
      // 1. Enable network discovery (current profile)
      'netsh advfirewall firewall set rule group="Network Discovery" new enable=Yes',
      // 2. Enable file and printer sharing (current profile)
      'netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes',
      // 3. Allow inbound on port 3000 (POS app's HTTP port)
      'netsh advfirewall firewall add rule name="Pakistan POS HTTP" dir=in action=allow protocol=TCP localport=3000',
      // 4. Set current network profile to Private (so sharing works)
      // Note: This needs PowerShell and may fail silently if not admin
      'powershell -Command "Set-NetConnectionProfile -NetworkCategory Private" 2>nul',
    ];

    console.log("[POS] Setting up network sharing permissions...");
    for (const cmd of commands) {
      try {
        await new Promise((resolve) => {
          exec(cmd, { windowsHide: true }, (err) => {
            if (err) {
              // Silent — these may fail if user is not admin
              console.log(`[POS] Network setup cmd failed (may need admin): ${cmd.substring(0, 60)}...`);
            }
            resolve(); // always resolve — don't block app on this
          });
        });
      } catch (e) {
        // Silent — continue
      }
    }

    // Try to create a network share "ShopPOS" pointing to the data folder
    // This needs admin rights; if it fails, user can do it manually
    const shareCmd = `net share ShopPOS="${dataDir}" /GRANT:Everyone,FULL`;
    try {
      await new Promise((resolve) => {
        exec(shareCmd, { windowsHide: true }, (err, stdout) => {
          if (err) {
            console.log(`[POS] Network share creation failed (needs admin). User can run as admin once.`);
          } else {
            console.log(`[POS] Network share 'ShopPOS' created at ${dataDir}`);
          }
          resolve();
        });
      });
    } catch {
      // Silent — non-fatal
    }

    console.log("[POS] Network sharing setup complete (best-effort)");
  }

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
