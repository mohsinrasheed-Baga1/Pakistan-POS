/**
 * License Configuration
 * =====================================================
 * Replace these values with your actual Supabase project details.
 * Find them at: Supabase Dashboard → Settings → API
 */

export const LICENSE_CONFIG = {
  /** Your Supabase project URL (e.g. https://xyzcompany.supabase.co) */
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",

  /** Your Supabase anon public key (safe to expose to client) */
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",

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
  appVersion: "2.9.32",

  /** Trial settings */
  trialDays: 3,

  /** Developer contact info (shown on activation/lockout screens) */
  developer: {
    name: "Mohsin Rasheed Bagaan",
    phone: "+923000088482",
    whatsappNumber: "923000088482", // without + or spaces for wa.me link
    whatsappMessage:
      "Assalam o Alaikum, mujhe Pakistan POS ke license ke baray mein maloomat chahiye.",
  },

  /** How often to re-verify license (in ms). Default: 24 hours */
  verifyIntervalMs: 24 * 60 * 60 * 1000,
} as const;
