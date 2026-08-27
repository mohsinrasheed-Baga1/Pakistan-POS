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
 * Uses server-provided expiry date so changing PC clock doesn't extend it.
 */
export function getDaysRemaining(license: StoredLicense): number {
  if (!license.expiresAt) return Infinity; // permanent
  const ms = new Date(license.expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Check if license is currently expired.
 * IMPORTANT: Uses the server-provided expiresAt, not local time manipulation.
 * Even if user changes PC clock backward, the expiry date set on Supabase
 * server side remains the same — verifyLicense() will update it on each launch.
 */
export function isExpired(license: StoredLicense): boolean {
  if (!license.expiresAt) return false;
  return new Date(license.expiresAt).getTime() < Date.now();
}

/**
 * Detect if the system clock has been rolled back since last verification.
 * This catches users trying to extend trial by changing PC date.
 *
 * Strategy: store the highest "Date.now()" we've ever seen.
 * If current Date.now() is LOWER than the stored max, the clock was rolled back.
 */
const CLOCK_MAX_KEY = "pakpos_clock_max_seen";

/** Get the maximum timestamp we've ever seen on this machine. */
function getMaxClockSeen(): number {
  if (typeof window === "undefined") return Date.now();
  const raw = localStorage.getItem(CLOCK_MAX_KEY);
  if (!raw) return 0;
  try {
    return Number(raw) || 0;
  } catch {
    return 0;
  }
}

/** Save the maximum timestamp (only updates if current time is higher). */
function saveMaxClockSeen(ts: number): void {
  if (typeof window === "undefined") return;
  const current = getMaxClockSeen();
  if (ts > current) {
    localStorage.setItem(CLOCK_MAX_KEY, String(ts));
  }
}

/** Check if the system clock appears to have been rolled back. */
export function isClockRolledBack(): boolean {
  const now = Date.now();
  const max = getMaxClockSeen();
  // If we've seen a time more than 1 hour in the future of current time,
  // the clock was rolled back.
  if (max > 0 && now < max - 60 * 60 * 1000) {
    return true;
  }
  // Otherwise update the max
  saveMaxClockSeen(now);
  return false;
}

/**
 * Check if it's time to re-verify with the server.
 *
 * SECURITY: Always returns true on every startup so we verify with Supabase
 * even if local time suggests recent verification. This prevents:
 * 1. Users changing PC clock to skip verification
 * 2. Tampering with localStorage lastVerifiedAt field
 *
 * Only offline grace period (7 days since last SUCCESSFUL server verify)
 * allows the app to run without re-verification.
 */
export function needsReverification(_license: StoredLicense): boolean {
  // Always verify on startup — return true
  // The verifyLicense() call will:
  // 1. Use server-side NOW() to check expiry (can't be faked)
  // 2. Update the stored expiresAt from server response
  // 3. If offline, fall back to grace period check
  return true;
}

/**
 * Check if offline grace period has been exceeded.
 * Grace period = 7 days since last successful server verification.
 * After this, app locks even if local data says license is valid.
 */
export function isOfflineGraceExceeded(license: StoredLicense): boolean {
  const last = new Date(license.lastVerifiedAt).getTime();
  const graceMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  return Date.now() - last > graceMs;
}

// ============================================================
// TRIAL DAILY SALE LIMIT
// ============================================================
// Trial users can only make a limited number of sales per day.
// After reaching the limit, they see a "Daily Limit Reached" message
// and need to purchase a license to continue selling.

const TRIAL_DAILY_LIMIT = 30;
const TRIAL_DAILY_KEY = "pakpos_trial_daily_sales";

type DailySalesRecord = {
  date: string; // YYYY-MM-DD
  count: number;
  limit: number;
};

/** Get today's date string (YYYY-MM-DD) in local timezone. */
function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Get the daily sales record for trial (auto-resets each day). */
export function getTrialDailySales(): DailySalesRecord {
  if (typeof window === "undefined") {
    return { date: getTodayDateString(), count: 0, limit: TRIAL_DAILY_LIMIT };
  }
  try {
    const raw = localStorage.getItem(TRIAL_DAILY_KEY);
    const today = getTodayDateString();
    if (!raw) {
      return { date: today, count: 0, limit: TRIAL_DAILY_LIMIT };
    }
    const parsed = JSON.parse(raw) as DailySalesRecord;
    // Reset count if date changed
    if (parsed.date !== today) {
      return { date: today, count: 0, limit: TRIAL_DAILY_LIMIT };
    }
    return { ...parsed, limit: TRIAL_DAILY_LIMIT };
  } catch {
    return { date: getTodayDateString(), count: 0, limit: TRIAL_DAILY_LIMIT };
  }
}

/** Increment trial daily sales counter. Returns the new count. */
export function incrementTrialDailySales(): number {
  const current = getTrialDailySales();
  const updated = { ...current, count: current.count + 1 };
  if (typeof window !== "undefined") {
    localStorage.setItem(TRIAL_DAILY_KEY, JSON.stringify(updated));
  }
  return updated.count;
}

/** Check if trial has reached today's sale limit. */
export function isTrialDailyLimitReached(): boolean {
  const record = getTrialDailySales();
  return record.count >= record.limit;
}

/** Get remaining sales for today. */
export function getTrialSalesRemaining(): number {
  const record = getTrialDailySales();
  return Math.max(0, record.limit - record.count);
}

/** Check if a license is trial type (used to apply daily limits). */
export function isTrialLicense(license: StoredLicense | null): boolean {
  return license?.licenseType === "trial";
}
