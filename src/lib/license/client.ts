/**
 * License API Client
 * =====================================================
 * Talks to Supabase Edge Functions: activate, verify, trial-start.
 * Uses the anon key (safe to expose — RLS protects data).
 */

import { LICENSE_CONFIG } from "./config";

export type ActivationResponse = {
  success: boolean;
  message?: string;
  reason?: string;
  license?: {
    licenseKey: string;
    customerName: string;
    shopName: string;
    licenseType: "trial" | "permanent" | "subscription";
    expiresAt: string | null;
    durationDays: number | null;
  };
  trialStarted?: boolean;
  alreadyExists?: boolean;
  isExpired?: boolean;
  daysRemaining?: number;
  trialExpiresAt?: string;
};

export type VerifyResponse = {
  success: boolean;
  valid?: boolean;
  reason?: string;
  message?: string;
  expiredAt?: string;
  license?: {
    licenseKey: string;
    customerName: string;
    shopName: string;
    licenseType: "trial" | "permanent" | "subscription";
    expiresAt: string | null;
    daysRemaining: number | null;
  };
};

async function callEdgeFunction<T = unknown>(
  url: string,
  payload: Record<string, unknown>,
): Promise<T> {
  if (!LICENSE_CONFIG.supabaseUrl) {
    throw new Error(
      "Supabase URL not configured. Set NEXT_PUBLIC_SUPABASE_URL in your environment.",
    );
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LICENSE_CONFIG.supabaseAnonKey}`,
      apikey: LICENSE_CONFIG.supabaseAnonKey,
    },
    body: JSON.stringify(payload),
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Server returned status ${res.status} with non-JSON response`);
  }

  if (!res.ok) {
    const err = data as { error?: string; message?: string };
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }

  return data as T;
}

/** Start a 3-day free trial on this system. */
export async function startTrial(opts: {
  systemId: string;
  systemInfo: unknown;
  customerName?: string;
  shopName?: string;
  phone?: string;
}): Promise<ActivationResponse> {
  return callEdgeFunction<ActivationResponse>(LICENSE_CONFIG.trialUrl, {
    systemId: opts.systemId,
    systemInfo: opts.systemInfo,
    appVersion: LICENSE_CONFIG.appVersion,
    customerName: opts.customerName || null,
    shopName: opts.shopName || null,
    phone: opts.phone || null,
  });
}

/** Activate a paid license key on this system. */
export async function activateLicense(opts: {
  licenseKey: string;
  systemId: string;
  systemInfo: unknown;
}): Promise<ActivationResponse> {
  return callEdgeFunction<ActivationResponse>(LICENSE_CONFIG.activateUrl, {
    licenseKey: opts.licenseKey.trim().toUpperCase(),
    systemId: opts.systemId,
    systemInfo: opts.systemInfo,
    appVersion: LICENSE_CONFIG.appVersion,
  });
}

/** Verify the license is still valid (called on startup + every 24h). */
export async function verifyLicense(opts: {
  licenseKey: string;
  systemId: string;
}): Promise<VerifyResponse> {
  return callEdgeFunction<VerifyResponse>(LICENSE_CONFIG.verifyUrl, {
    licenseKey: opts.licenseKey.trim().toUpperCase(),
    systemId: opts.systemId,
    appVersion: LICENSE_CONFIG.appVersion,
  });
}
