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
 * Code-128 format — the most universally scannable barcode type, supported
 * by virtually every USB / Bluetooth / built-in barcode scanner on the market.
 *
 * Format: "20" + 10 random digits (12 digits total, all numeric — Code-128
 * accepts any ASCII but numeric-only codes scan fastest and are shortest).
 * The "20" prefix is reserved for in-store / internal use (GS1 prefix 2 =
 * "variable measure products sold in retail stores"), so these barcodes will
 * never collide with real manufacturer barcodes scanned from product boxes.
 *
 * Code-128 also has a built-in checksum that JsBarcode computes automatically
 * when rendering, so we don't need to compute it ourselves.
 */
export function generateInternalBarcode(): string {
  // Prefix "20" — internal retail range, won't clash with manufacturer barcodes
  let code = "20";
  for (let i = 0; i < 10; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code; // 12 digits, Code-128 compatible
}

/**
 * Generate a Code-128 barcode for a box / pack product. Uses prefix "21"
 * (in-store internal range) so it never clashes with piece-level barcodes.
 *
 * Format: "21" + 10 random digits.
 */
export function generateBoxBarcode(): string {
  let code = "21";
  for (let i = 0; i < 10; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
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
