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
  // 1. IMMEDIATE cleanup — ONLY remove Radix-specific elements.
  // v2.10.144: DON'T remove elements just because they have role="dialog" —
  //   that was too broad and could catch legitimate non-Radix portals
  //   (e.g. sonner toast portals), causing React errors and page crashes.
  //   User: "سیل ہسٹری کے اندر جا کر ہم ٹرانزیکشن کو ایڈیٹ کرتے ہیں تو وہ
  //   کریش کر دیتا ہے پیج"
  const cleanup = () => {
    try {
      // Reset body styles (Radix sets these when a dialog opens)
      document.body.style.pointerEvents = "auto";
      document.body.style.overflow = "auto";
      document.body.removeAttribute("aria-hidden");
      document.body.removeAttribute("data-scroll-locked");
      document.body.removeAttribute("data-radix-scroll-locked");
      // Reset html element too (Radix sometimes locks this)
      document.documentElement.style.pointerEvents = "auto";
      document.documentElement.style.overflow = "auto";
      // ONLY remove elements with Radix-specific attributes.
      // DO NOT remove elements just because they have role="dialog".
      document.querySelectorAll("[data-radix-overlay]").forEach(el => el.remove());
      document.querySelectorAll("[data-radix-portal]").forEach(el => {
        // Only remove if it contains a dialog or overlay (Radix portals
        // are wrappers — only remove the ones that have dialog content).
        if ((el as HTMLElement).querySelector('[role="dialog"], [data-radix-overlay]')) {
          el.remove();
        }
      });
    } catch (e) {
      console.warn("aggressiveRadixCleanup error:", e);
    }
  };

  cleanup();

  // 2. Periodic re-cleanup at escalating intervals
  [50, 100, 200, 500, 1000, 2000].forEach(ms => {
    setTimeout(cleanup, ms);
  });

  // 3. Mutation observer — catches late-appearing Radix elements.
  // v2.10.144: Only remove elements with data-radix-overlay or data-radix-portal
  //   attributes. DO NOT remove elements just because they have role="dialog".
  try {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as HTMLElement;
          // ONLY remove if it has Radix-specific attributes
          if (
            el.hasAttribute("data-radix-overlay") ||
            el.hasAttribute("data-radix-portal")
          ) {
            el.remove();
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: false });
    // Stop observing after 2 seconds
    setTimeout(() => {
      observer.disconnect();
      cleanup();
    }, 2000);
  } catch (e) {
    console.warn("aggressiveRadixCleanup observer error:", e);
  }
}
