/**
 * System ID Generator (Machine Fingerprint)
 * =====================================================
 * Creates a unique, stable ID for the current machine.
 * Used to enforce "one license = one system" rule.
 *
 * Priority:
 * 1. Electron IPC (real machine fingerprint: MAC, hostname, disk serial, UUID)
 * 2. Browser fallback (canvas + navigator — less unique, but works in dev)
 */

import crypto from "crypto";

type SystemInfo = {
  hostname: string;
  platform: string;
  cpuModel: string;
  cpuCores: number;
  totalMemory: string;
  machineModel: string;
  macAddress?: string;
  machineUuid?: string;
  diskSerial?: string;
};

/**
 * Collect system information that we'll hash into the system ID.
 * Works in browser, Electron renderer, and Node.js.
 */
async function collectSystemInfo(): Promise<{
  systemId: string;
  systemInfo: SystemInfo;
}> {
  // ─── PRIORITY 1: Electron IPC (real machine fingerprint) ──────────────
  // This is the most reliable — uses MAC, hostname, machine UUID, disk serial
  if (typeof window !== "undefined" && window.posElectron?.getSystemFingerprint) {
    try {
      const result = await window.posElectron.getSystemFingerprint();
      if (result && result.systemId && !result.error) {
        return {
          systemId: result.systemId,
          systemInfo: result.systemInfo as SystemInfo,
        };
      }
      console.warn("[SystemID] Electron fingerprint returned no ID, falling back");
    } catch (e) {
      console.warn("[SystemID] Electron fingerprint failed, falling back:", e);
    }
  }

  // ─── FALLBACK: Browser-based fingerprint (dev mode or non-Electron) ────
  let hostname = "unknown-host";
  let platform = "unknown-platform";
  let cpuModel = "unknown-cpu";
  let cpuCores = 1;
  let totalMemory = "0 GB";
  let machineModel = "unknown";

  // Node.js / Electron main process (only works if running in main)
  if (typeof process !== "undefined" && process.versions?.node) {
    try {
      const os = await import("os");
      hostname = os.hostname() || hostname;
      platform = `${os.type()} ${os.release()}` || platform;
      cpuModel = os.cpus()?.[0]?.model || cpuModel;
      cpuCores = os.cpus()?.length || cpuCores;
      const totalBytes = os.totalmem();
      const totalGB = (totalBytes / 1024 / 1024 / 1024).toFixed(1);
      totalMemory = `${totalGB} GB`;
      machineModel = (os.userInfo?.()?.username || "user") + "@" + hostname;
    } catch {
      // ignore — fall back to browser info
    }
  }

  // Browser / Electron renderer extras
  if (typeof navigator !== "undefined") {
    if (!cpuCores || cpuCores === 1) cpuCores = navigator.hardwareConcurrency || cpuCores;
    if (platform === "unknown-platform") platform = navigator.platform || platform;
  }

  // Canvas fingerprint (browser-only)
  let canvasHash = "no-canvas";
  try {
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.textBaseline = "top";
        ctx.font = "14px 'Arial'";
        ctx.fillStyle = "#f60";
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = "#069";
        // Use a more specific string to make canvas more unique per machine
        ctx.fillText(
          `PakistanPOS-FP-${hostname}-${cpuModel}-${navigator?.userAgent?.substring(0, 50) || ""}`,
          2,
          15,
        );
        canvasHash = canvas.toDataURL().slice(-64);
      }
    }
  } catch {
    canvasHash = "canvas-error";
  }

  // MAC address (Electron main process only — renderer can't access this)
  let macAddress = "no-mac";
  try {
    if (typeof process !== "undefined" && process.versions?.node) {
      const os = await import("os");
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
    }
  } catch {
    // ignore
  }

  // Combine into fingerprint — include hostname + user + canvas for uniqueness
  const fingerprint = [
    hostname,
    platform,
    cpuModel,
    `${cpuCores}cores`,
    totalMemory,
    machineModel,
    macAddress,
    canvasHash,
    navigator?.userAgent?.substring(0, 100) || "no-ua",
  ].join("|");

  // SHA-256 hash → take first 24 chars
  const hash = crypto
    .createHash("sha256")
    .update(fingerprint)
    .digest("hex")
    .substring(0, 24)
    .toUpperCase();

  const systemId = `SYS-${hash.substring(0, 4)}-${hash.substring(4, 8)}-${hash.substring(
    8,
    12,
  )}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 24)}`;

  return {
    systemId,
    systemInfo: {
      hostname,
      platform,
      cpuModel,
      cpuCores,
      totalMemory,
      machineModel,
      macAddress,
    },
  };
}

// Cache the result so we don't recompute on every call
let cachedResult: { systemId: string; systemInfo: SystemInfo } | null = null;

export async function getSystemId(): Promise<{ systemId: string; systemInfo: SystemInfo }> {
  if (cachedResult) return cachedResult;
  cachedResult = await collectSystemInfo();
  return cachedResult;
}

/** Synchronous version — only works after getSystemId() has been called once. */
export function getCachedSystemId(): string | null {
  return cachedResult?.systemId || null;
}
