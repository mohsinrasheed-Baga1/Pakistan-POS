/**
 * System ID Generator (Machine Fingerprint)
 * =====================================================
 * Creates a unique, stable ID for the current machine.
 * Used to enforce "one license = one system" rule.
 *
 * Browser-safe version: uses canvas fingerprint + screen + navigator.
 * Electron version: also available (see ElectronFingerprint below).
 */

import crypto from "crypto";

type SystemInfo = {
  hostname: string;
  platform: string;
  cpuModel: string;
  cpuCores: number;
  totalMemory: string;
  machineModel: string;
};

/**
 * Collect system information that we'll hash into the system ID.
 * Works in browser, Electron renderer, and Node.js.
 */
async function collectSystemInfo(): Promise<{
  systemId: string;
  systemInfo: SystemInfo;
}> {
  let hostname = "unknown-host";
  let platform = "unknown-platform";
  let cpuModel = "unknown-cpu";
  let cpuCores = 1;
  let totalMemory = "0 GB";
  let machineModel = "unknown";

  // Node.js / Electron main process
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

  // Canvas fingerprint (browser-only, stable across sessions)
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
        ctx.fillText("PakistanPOS-Fingerprint-2026", 2, 15);
        canvasHash = canvas.toDataURL().slice(-64);
      }
    }
  } catch {
    canvasHash = "canvas-error";
  }

  // MAC address (Electron only — needs os.networkInterfaces)
  let macAddress = "no-mac";
  try {
    if (typeof process !== "undefined" && process.versions?.node) {
      const os = await import("os");
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        const nets = interfaces[name];
        if (!nets) continue;
        for (const net of nets) {
          // Skip internal (loopback) and non-IPv4
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

  // Combine into fingerprint
  const fingerprint = [
    hostname,
    platform,
    cpuModel,
    `${cpuCores}cores`,
    totalMemory,
    machineModel,
    macAddress,
    canvasHash,
  ].join("|");

  // SHA-256 hash → take first 32 chars for readability
  const systemId = `SYS-${crypto
    .createHash("sha256")
    .update(fingerprint)
    .digest("hex")
    .substring(0, 24)
    .toUpperCase()}`;

  // Insert dashes for readability: SYS-XXXX-XXXX-XXXX-XXXX-XXXX
  const formatted = `${systemId.substring(0, 4)}-${systemId.substring(4, 8)}-${systemId.substring(
    8,
    12,
  )}-${systemId.substring(12, 16)}-${systemId.substring(16, 20)}-${systemId.substring(20, 24)}`;

  return {
    systemId: formatted,
    systemInfo: {
      hostname,
      platform,
      cpuModel,
      cpuCores,
      totalMemory,
      machineModel,
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
