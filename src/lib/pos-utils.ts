// Utility helpers for POS

export function formatMoney(amount: number, currency = "Rs"): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${currency} ${n.toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatNumber(n: number, digits = 2): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

/**
 * Generate an internal barcode for loose items (sugar, ghee, etc.) using
 * EAN-13 format — the most widely supported retail barcode standard.
 *
 * EAN-13 requires exactly 13 digits. The 13th digit is a checksum
 * computed from the first 12. This checksum makes EAN-13 barcodes
 * extremely reliable — scanners can detect and reject misreads.
 *
 * Format: "200" + 9 random digits (12 digits) + 1 checksum digit (13 total)
 * The "200" prefix is reserved for in-store / internal use (GS1 prefix 20 =
 * "variable measure products sold in retail stores"), so these barcodes
 * will never collide with real manufacturer barcodes.
 *
 * ⚠️ DO NOT CHANGE THIS FORMAT unless the user explicitly requests it.
 * The user confirmed EAN-13 is the permanent standard for this app.
 */
export function generateInternalBarcode(): string {
  // Prefix "200" — internal retail range (GS1 prefix 20 = in-store use)
  let base = "200";
  for (let i = 0; i < 9; i++) {
    base += Math.floor(Math.random() * 10).toString();
  }
  // Now base has 12 digits. Compute EAN-13 checksum (13th digit).
  return base + ean13Checksum(base);
}

/**
 * Generate an EAN-13 barcode for a box / pack product. Uses prefix "210"
 * (in-store internal range) so it never clashes with piece-level barcodes.
 *
 * Format: "210" + 9 random digits (12 digits) + 1 checksum digit (13 total)
 *
 * ⚠️ DO NOT CHANGE THIS FORMAT unless the user explicitly requests it.
 */
export function generateBoxBarcode(): string {
  let base = "210";
  for (let i = 0; i < 9; i++) {
    base += Math.floor(Math.random() * 10).toString();
  }
  return base + ean13Checksum(base);
}

/**
 * Compute the EAN-13 check digit from the first 12 digits.
 * Algorithm (GS1 standard):
 *   1. Sum all digits in ODD positions (1st, 3rd, 5th, ...) — these are
 *      multiplied by 1.
 *   2. Sum all digits in EVEN positions (2nd, 4th, 6th, ...) — these are
 *      multiplied by 3.
 *   3. checksum = (10 - (sum % 10)) % 10
 *
 * The check digit is appended as the 13th digit. When a scanner reads
 * the barcode, it recomputes this checksum and compares it to the 13th
 * digit — if they don't match, the scan is rejected (prevents misreads).
 */
function ean13Checksum(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(first12[i], 10);
    // i=0 is position 1 (odd), i=1 is position 2 (even), etc.
    // Odd positions (1,3,5,...) are multiplied by 1
    // Even positions (2,4,6,...) are multiplied by 3
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check.toString();
}

export function generateInvoiceNo(prefix = "INV", count = 0): string {
  const d = new Date();
  const ymd =
    d.getFullYear().toString() +
    (d.getMonth() + 1).toString().padStart(2, "0") +
    d.getDate().toString().padStart(2, "0");
  const seq = (count + 1).toString().padStart(4, "0");
  return `${prefix}-${ymd}-${seq}`;
}

export function isLooseUnit(unit: string): boolean {
  return ["kg", "gram", "litre", "ml", "metre", "feet"].includes(unit);
}

export function unitLabel(unit: string): string {
  const map: Record<string, string> = {
    piece: "pc",
    kg: "kg",
    gram: "g",
    litre: "L",
    ml: "ml",
    dozen: "dz",
    metre: "m",
    feet: "ft",
  };
  return map[unit] || unit;
}

// ─────────────────────────────────────────────────────────────────────────────
// v2.10.146: Pakistani denomination breakdown.
// ─────────────────────────────────────────────────────────────────────────────
// Given an amount (the change to give back to the customer), calculate
// how to break it down into Pakistani notes and coins.
//
// Notes: Rs 5000, 1000, 500, 100, 50, 20, 10
// Coins: Rs 5, 2, 1
//
// Uses a greedy algorithm (largest denominations first) which always
// produces the optimal (fewest notes) breakdown for these denominations.
//
// User: "پاکستان میں پانچ ہزار ایک ہزار 500 50 20 10 اور پانچ تین دو اور
// ایک کے سکے موجود ہیں تو بقایا کون سا لوٹ کیسے دیں گے"

export const PAKISTANI_DENOMINATIONS = [
  { value: 5000, type: "note" as const, label: "Rs 5000", labelUr: "5000" },
  { value: 1000, type: "note" as const, label: "Rs 1000", labelUr: "1000" },
  { value: 500, type: "note" as const, label: "Rs 500", labelUr: "500" },
  { value: 100, type: "note" as const, label: "Rs 100", labelUr: "100" },
  { value: 50, type: "note" as const, label: "Rs 50", labelUr: "50" },
  { value: 20, type: "note" as const, label: "Rs 20", labelUr: "20" },
  { value: 10, type: "note" as const, label: "Rs 10", labelUr: "10" },
  { value: 5, type: "coin" as const, label: "Rs 5", labelUr: "5" },
  { value: 2, type: "coin" as const, label: "Rs 2", labelUr: "2" },
  { value: 1, type: "coin" as const, label: "Rs 1", labelUr: "1" },
];

export function calculateDenominationBreakdown(amount: number): Array<{
  value: number;
  count: number;
  type: "note" | "coin";
  label: string;
  labelUr: string;
}> {
  const result: Array<{
    value: number;
    count: number;
    type: "note" | "coin";
    label: string;
    labelUr: string;
  }> = [];
  let remaining = Math.round(amount);
  if (remaining <= 0) return result;
  for (const denom of PAKISTANI_DENOMINATIONS) {
    const count = Math.floor(remaining / denom.value);
    if (count > 0) {
      result.push({
        value: denom.value,
        count,
        type: denom.type,
        label: denom.label,
        labelUr: denom.labelUr,
      });
      remaining -= count * denom.value;
    }
    if (remaining <= 0) break;
  }
  return result;
}

export function todayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// ─────────────────────────────────────────────────────────────────────────────
// v2.10.143: Aggressive Radix Dialog cleanup utility.
// ─────────────────────────────────────────────────────────────────────────────
// The "Edit Sale hang" bug has been recurring across multiple versions
// (v2.10.131-142). Root cause: Radix Dialog sets pointer-events:none and
// overflow:hidden on document.body when a dialog opens. When the dialog
// closes + the component unmounts in the same tick (e.g., navigating to
// POS view after Edit Sale), Radix doesn't get a chance to run its
// cleanup logic, leaving body permanently locked.
//
// This utility does THREE things:
//   1. IMMEDIATE cleanup — reset body styles + remove Radix DOM elements
//   2. MUTATION OBSERVER — for 2 seconds, watch for any NEW Radix overlays
//      that appear (Radix sometimes adds them asynchronously) and remove them
//   3. Periodic re-cleanup at 50ms, 100ms, 200ms, 500ms, 1000ms, 2000ms
//      — catches late cleanup that the mutation observer might miss
//
// User: "ایڈٹ پر کلک کرنے کے بعد سارا سسٹم پورے کو پورا سافٹ وئر کہیں پر
// ہم کلک نہیں کر سکتے ... اکثر اسی طرح سیم پرانا مسئلہ بھی شو کر دیتا ہے"
//
// Usage: call this RIGHT BEFORE setView("pos") in any Edit Sale handler.
export function aggressiveRadixCleanup(): void {
  // v2.10.146: COMPLETELY REWRITTEN with a polling approach.
  //   The previous version used setTimeout at fixed intervals (50, 100, 200,
  //   500, 1000, 2000ms) + a 2-second MutationObserver. But the Edit Sale
  //   hang persisted across 10+ versions because Radix RE-APPLIES
  //   pointer-events:none AFTER our cleanup runs.
  //
  //   NEW APPROACH: Poll every 50ms for 5 SECONDS. Each poll CHECKS if
  //   body/html has pointer-events:none and resets it to "auto". Also
  //   removes any Radix overlay/portal elements. This catches ANY point
  //   where Radix re-locks the body, no matter when it happens.
  //
  //   User: "10 مرتبہ یہ چیز کو ختم کرنے کے لیے اپڈیٹ کر چکے ہیں لیکن
  //   یہ مسئلہ حل نہیں ہوا"

  const resetStyles = () => {
    try {
      // Reset body
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = "auto";
      }
      if (document.body.style.overflow === "hidden") {
        document.body.style.overflow = "auto";
      }
      document.body.removeAttribute("aria-hidden");
      document.body.removeAttribute("data-scroll-locked");
      document.body.removeAttribute("data-radix-scroll-locked");
      // Reset html element
      if (document.documentElement.style.pointerEvents === "none") {
        document.documentElement.style.pointerEvents = "auto";
      }
      if (document.documentElement.style.overflow === "hidden") {
        document.documentElement.style.overflow = "auto";
      }
    } catch (e) {
      console.warn("aggressiveRadixCleanup resetStyles error:", e);
    }
  };

  const removeRadixElements = () => {
    try {
      document.querySelectorAll("[data-radix-overlay]").forEach(el => el.remove());
      document.querySelectorAll("[data-radix-portal]").forEach(el => {
        if ((el as HTMLElement).querySelector('[role="dialog"], [data-radix-overlay]')) {
          el.remove();
        }
      });
    } catch (e) {
      console.warn("aggressiveRadixCleanup removeRadixElements error:", e);
    }
  };

  // Immediate cleanup
  resetStyles();
  removeRadixElements();

  // v2.10.146: POLLING loop — check every 50ms for 5 seconds.
  //   This catches Radix re-locking the body at ANY point during the
  //   view transition. The previous fixed-interval approach missed
  //   cases where Radix re-applied styles between intervals.
  const startTime = Date.now();
  const POLL_INTERVAL = 50; // ms
  const POLL_DURATION = 5000; // 5 seconds

  const pollId = setInterval(() => {
    resetStyles();
    removeRadixElements();

    // Also try to enable + focus the search bar in POS view
    const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
    if (searchInput) {
      if (searchInput.disabled) searchInput.disabled = false;
      if (searchInput.readOnly) searchInput.readOnly = false;
      if (searchInput.style.pointerEvents === "none") {
        searchInput.style.pointerEvents = "auto";
      }
    }

    // Stop polling after 5 seconds
    if (Date.now() - startTime > POLL_DURATION) {
      clearInterval(pollId);
    }
  }, POLL_INTERVAL);

  // Also add a one-time focus after 500ms (when POS view should be mounted)
  setTimeout(() => {
    const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  }, 500);
}
