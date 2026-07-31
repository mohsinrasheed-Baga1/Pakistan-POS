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
