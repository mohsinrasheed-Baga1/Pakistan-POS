// Google Drive Backup Module for Electron POS App
// Handles OAuth 2.0 flow, token encryption, Drive API, scheduled backups.
const { app, BrowserWindow, safeStorage, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const zlib = require("zlib");
const { URL } = require("url");

let config = null;
let mainWindow = null;

// Load OAuth config from google-oauth.config.json
function loadConfig() {
  if (config) return config;
  const isDev = !app.isPackaged;
  const configPath = isDev
    ? path.join(__dirname, "..", "google-oauth.config.json")
    : path.join(process.resourcesPath, "google-oauth.config.json");
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } else {
      config = null;
    }
  } catch {
    config = null;
  }
  return config;
}

function getConfig() {
  return loadConfig();
}

function reloadConfig() {
  config = null;
  return loadConfig();
}

// Token storage: encrypted via safeStorage, saved to a file in userData
function getTokenStorePath() {
  return path.join(app.getPath("userData"), "gdrive-tokens.json");
}

function encryptTokens(tokens) {
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback: base64 encode (not ideal but better than plaintext)
    return { encrypted: false, data: Buffer.from(JSON.stringify(tokens)).toString("base64") };
  }
  const buf = safeStorage.encryptString(JSON.stringify(tokens));
  return { encrypted: true, data: buf.toString("base64") };
}

function decryptTokens(store) {
  if (!store) return null;
  try {
    if (store.encrypted) {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const decrypted = safeStorage.decryptString(Buffer.from(store.data, "base64"));
      return JSON.parse(decrypted);
    } else {
      return JSON.parse(Buffer.from(store.data, "base64").toString("utf-8"));
    }
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  const store = encryptTokens(tokens);
  fs.writeFileSync(getTokenStorePath(), JSON.stringify(store));
}

function loadTokens() {
  const p = getTokenStorePath();
  if (!fs.existsSync(p)) return null;
  try {
    const store = JSON.parse(fs.readFileSync(p, "utf-8"));
    return decryptTokens(store);
  } catch {
    return null;
  }
}

function clearTokens() {
  const p = getTokenStorePath();
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ---- OAuth Flow ----

function startOAuthFlow(win) {
  return new Promise((resolve, reject) => {
    const cfg = loadConfig();
    if (!cfg || !cfg.clientId || cfg.clientId.startsWith("YOUR_")) {
      reject(new Error("Google OAuth not configured. See GOOGLE-DRIVE-SETUP.md."));
      return;
    }

    const state = Math.random().toString(36).substring(2, 15);
    const redirectPort = new URL(cfg.redirectUri).port || 4784;
    const scope = (cfg.scopes || ["https://www.googleapis.com/auth/drive.file"]).join(" ");

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(cfg.clientId)}` +
      `&redirect_uri=${encodeURIComponent(cfg.redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${state}`;

    // Local server to capture the redirect
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, cfg.redirectUri);
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");

      if (code && returnedState === state) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Connected!</h2><p>You can close this window and return to Shop POS System.</p><script>window.close()</script></body></html>`);
        server.close();
        exchangeCodeForTokens(code)
          .then((tokens) => {
            saveTokens(tokens);
            resolve(tokens);
          })
          .catch(reject);
      } else {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h2>Authentication failed</h2><p>Please try again.</p></body></html>");
        server.close();
        reject(new Error("OAuth failed: invalid response"));
      }
    });

    server.listen(redirectPort, "127.0.0.1", () => {
      // Open the OAuth window
      const oauthWin = new BrowserWindow({
        width: 500,
        height: 700,
        parent: win,
        modal: true,
        title: "Connect Google Drive",
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });
      oauthWin.loadURL(authUrl);

      oauthWin.on("closed", () => {
        try { server.close(); } catch {}
        reject(new Error("OAuth window closed"));
      });
    });

    server.on("error", (e) => {
      reject(new Error("Cannot start OAuth server: " + e.message));
    });
  });
}

function exchangeCodeForTokens(code) {
  return new Promise((resolve, reject) => {
    const cfg = loadConfig();
    const postData =
      `code=${encodeURIComponent(code)}` +
      `&client_id=${encodeURIComponent(cfg.clientId)}` +
      `&client_secret=${encodeURIComponent(cfg.clientSecret)}` +
      `&redirect_uri=${encodeURIComponent(cfg.redirectUri)}` +
      `&grant_type=authorization_code`;

    const options = {
      hostname: "oauth2.googleapis.com",
      path: "/token",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          if (data.access_token) {
            resolve({
              access_token: data.access_token,
              refresh_token: data.refresh_token,
              expires_at: Date.now() + (data.expires_in - 60) * 1000,
            });
          } else {
            reject(new Error(data.error_description || "Token exchange failed"));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

function refreshAccessToken() {
  return new Promise((resolve, reject) => {
    const cfg = loadConfig();
    const tokens = loadTokens();
    if (!tokens || !tokens.refresh_token) {
      reject(new Error("Not connected"));
      return;
    }
    const postData =
      `client_id=${encodeURIComponent(cfg.clientId)}` +
      `&client_secret=${encodeURIComponent(cfg.clientSecret)}` +
      `&refresh_token=${encodeURIComponent(tokens.refresh_token)}` +
      `&grant_type=refresh_token`;

    const req = https.request(
      {
        hostname: "oauth2.googleapis.com",
        path: "/token",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (data.access_token) {
              tokens.access_token = data.access_token;
              tokens.expires_at = Date.now() + (data.expires_in - 60) * 1000;
              saveTokens(tokens);
              resolve(tokens);
            } else {
              reject(new Error("Refresh failed"));
            }
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function getValidAccessToken() {
  let tokens = loadTokens();
  if (!tokens) throw new Error("Not connected");
  if (Date.now() >= tokens.expires_at) {
    tokens = await refreshAccessToken();
  }
  return tokens.access_token;
}

// ---- Drive API ----

function driveRequest(method, path, headers, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "www.googleapis.com",
      path: path,
      method: method,
      headers: headers || {},
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body: buf });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function findOrCreateFolder() {
  const cfg = loadConfig();
  const token = await getValidAccessToken();
  const folderName = cfg.backupFolderName || "POS Backups";

  // Search for folder
  const q = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await driveRequest("GET", `/drive/v3/files?q=${q}`, {
    Authorization: `Bearer ${token}`,
  });
  const searchData = JSON.parse(searchRes.body.toString());
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const createBody = JSON.stringify({
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  });
  const createRes = await driveRequest("POST", "/drive/v3/files", {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(createBody),
  }, createBody);
  const createData = JSON.parse(createRes.body.toString());
  return createData.id;
}

async function uploadBackup(dbPath) {
  const token = await getValidAccessToken();
  const folderId = await findOrCreateFolder();

  // Read + compress DB
  const dbData = fs.readFileSync(dbPath);
  const compressed = zlib.gzipSync(dbData);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `pos-backup-${timestamp}.db.gz`;

  // Multipart upload
  const boundary = "POS" + Math.random().toString(36).substring(2);
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(metadata),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`),
    compressed,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await driveRequest("POST", `/upload/drive/v3/files?uploadType=multipart`, {
    Authorization: `Bearer ${token}`,
    "Content-Type": `multipart/related; boundary=${boundary}`,
    "Content-Length": body.length,
  }, body);

  const data = JSON.parse(res.body.toString());
  if (data.id) {
    // Save backup record locally
    saveBackupRecord({ id: data.id, name: filename, size: compressed.length, date: timestamp, cloud: true });
    return { ok: true, fileId: data.id, name: filename, size: compressed.length };
  }
  throw new Error("Upload failed: " + (data.error?.message || "Unknown"));
}

async function listCloudBackups() {
  const token = await getValidAccessToken();
  const cfg = loadConfig();
  const folderName = cfg.backupFolderName || "POS Backups";

  // Find folder first
  const folder = await findOrCreateFolder();
  const q = encodeURIComponent(`'${folder}' in parents and trashed=false`);
  const res = await driveRequest("GET", `/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=50&fields=files(id,name,size,createdTime)`, {
    Authorization: `Bearer ${token}`,
  });
  const data = JSON.parse(res.body.toString());
  return data.files || [];
}

async function downloadBackup(fileId, destPath) {
  const token = await getValidAccessToken();
  const res = await driveRequest("GET", `/drive/v3/files/${fileId}?alt=media`, {
    Authorization: `Bearer ${token}`,
  });
  if (res.status !== 200) throw new Error("Download failed");
  // Decompress
  const decompressed = zlib.gunzipSync(res.body);
  fs.writeFileSync(destPath, decompressed);
  return { ok: true, size: decompressed.length };
}

async function disconnect() {
  const tokens = loadTokens();
  if (tokens) {
    // Revoke token
    try {
      const token = tokens.access_token;
      await driveRequest("POST", `/oauth2/v2/revoke?token=${token}`, {});
    } catch {}
  }
  clearTokens();
  return { ok: true };
}

// ---- Backup records (local log) ----
function getBackupRecordsPath() {
  return path.join(app.getPath("userData"), "backup-records.json");
}

function saveBackupRecord(record) {
  const p = getBackupRecordsPath();
  let records = [];
  if (fs.existsSync(p)) {
    try { records = JSON.parse(fs.readFileSync(p, "utf-8")); } catch {}
  }
  records.unshift(record);
  records = records.slice(0, 100);
  fs.writeFileSync(p, JSON.stringify(records));
}

function getBackupRecords() {
  const p = getBackupRecordsPath();
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return []; }
}

// ---- Status ----
function getStatus() {
  const tokens = loadTokens();
  const cfg = loadConfig();
  const records = getBackupRecords();
  return {
    connected: !!tokens,
    configured: !!cfg && !cfg.clientId.startsWith("YOUR_"),
    lastBackup: records.length > 0 ? records[0] : null,
    totalBackups: records.length,
    configPath: cfg ? null : "NOT_CONFIGURED",
  };
}

module.exports = {
  startOAuthFlow,
  uploadBackup,
  listCloudBackups,
  downloadBackup,
  disconnect,
  getStatus,
  getBackupRecords,
  loadTokens,
  getConfig,
  reloadConfig,
};
