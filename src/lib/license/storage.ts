/**
 * License Storage (Client-side persistence)
 * =====================================================
 * Stores the active license + system ID in localStorage so
 * the user doesn't need to re-enter their key on every launch.
 *
 * In Electron, you may want to swap localStorage for a file-based
 * store (electron-store) for better persistence.
 */

import { LICENSE_CONFIG } from "./config";
import { getSystemId } from "./system-id";

const STORAGE_KEY = "pakpos_license_data";
const SYSTEM_ID_KEY = "pakpos_system_id";

export type StoredLicense = {
  licenseKey: string;
  customerName: string;
  shopName: string;
  licenseType: "trial" | "permanent" | "subscription";
  expiresAt: string | null;
  activatedAt: string;
  lastVerifiedAt: string;
  systemId: string;
};

/** Get the stored system ID (or compute + cache if first run). */
export async function ensureSystemId(): Promise<{ systemId: string; systemInfo: unknown }> {
  // Check if we already have it in storage
  if (typeof window !== "undefined") {
    const cached = localStorage.getItem(SYSTEM_ID_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return { systemId: parsed.systemId, systemInfo: parsed.systemInfo };
      } catch {
        // corrupted — recompute below
      }
    }
  }

  // Compute fresh
  const { systemId, systemInfo } = await getSystemId();
  if (typeof window !== "undefined") {
    localStorage.setItem(SYSTEM_ID_KEY, JSON.stringify({ systemId, systemInfo }));
  }
  return { systemId, systemInfo };
}

/** Get the stored license, if any. */
export function getStoredLicense(): StoredLicense | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredLicense;
  } catch {
    return null;
  }
}

/** Save a license after activation or verification. */
export function saveLicense(license: StoredLicense): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(license));
}

/** Clear stored license (used when revoked or expired beyond recovery). */
export function clearLicense(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/** Check if a stored license exists. */
export function hasStoredLicense(): boolean {
  return !!getStoredLicense();
}

/**
 * Compute days remaining until expiry (0 if expired or permanent).
 */
export function getDaysRemaining(license: StoredLicense): number {
  if (!license.expiresAt) return Infinity; // permanent
  const ms = new Date(license.expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/** Check if license is currently expired. */
export function isExpired(license: StoredLicense): boolean {
  if (!license.expiresAt) return false;
  return new Date(license.expiresAt).getTime() < Date.now();
}

/**
 * Check if it's time to re-verify with the server.
 * Returns true if last verification was > 24 hours ago.
 */
export function needsReverification(license: StoredLicense): boolean {
  const last = new Date(license.lastVerifiedAt).getTime();
  return Date.now() - last > LICENSE_CONFIG.verifyIntervalMs;
}
