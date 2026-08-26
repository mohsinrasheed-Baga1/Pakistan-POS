/**
 * License Configuration
 * =====================================================
 * Supabase credentials are hardcoded here because:
 * 1. NEXT_PUBLIC_* env vars are not always inlined during
 *    Electron builds (especially in GitHub Actions CI)
 * 2. The "sb_publishable_" key is designed to be public —
 *    Supabase RLS policies protect the actual data
 * 3. This ensures the license module works reliably across
 *    dev, production, and packaged Electron builds
 */

export const LICENSE_CONFIG = {
  /** Supabase project URL (hardcoded for reliability across build environments) */
  supabaseUrl: "https://yghnbmtuyjzebqrcbavk.supabase.co",

  /** Supabase publishable anon key (safe to expose — protected by RLS) */
  supabaseAnonKey: "sb_publishable_SNwoIutQIT-gky8PoCDiRg_BerVDD8n",

  /** Edge Function URLs (auto-built from supabaseUrl) */
  get activateUrl() {
    return `${this.supabaseUrl}/functions/v1/license-activate`;
  },
  get verifyUrl() {
    return `${this.supabaseUrl}/functions/v1/license-verify`;
  },
  get trialUrl() {
    return `${this.supabaseUrl}/functions/v1/trial-start`;
  },

  /** App version (for tracking in admin panel) */
  appVersion: "2.10.30",

  /** Trial settings */
  trialDays: 3,

  /** Developer contact info (shown on activation/lockout screens) */
  developer: {
    name: "Mohsin Rasheed Baga",
    phone: "+923000088482",
    whatsappNumber: "923000088482", // without + or spaces for wa.me link
    whatsappMessage:
      "Assalam o Alaikum, mujhe Pakistan POS ke license ke baray mein maloomat chahiye.",
  },

  /** How often to re-verify license (in ms). Default: 24 hours */
  verifyIntervalMs: 24 * 60 * 60 * 1000,
} as const;
