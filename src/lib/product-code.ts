/**
 * Product Code Generator
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates unique, human-readable product codes based on category.
 *
 * Format: <PREFIX><6-digit-zero-padded-number>
 * Examples:
 *   P000001, P000002      (default / uncategorized)
 *   DAL00045              (Daal / Lentils category)
 *   RICE00120             (Rice category)
 *   FLR00078              (Flour category)
 *
 * The prefix is derived from the category name (first 3-4 consonants),
 * or 'P' for uncategorized/default products.
 *
 * Uniqueness is enforced by checking the database for existing codes.
 */

import { db } from "@/lib/db";

// Common category → prefix overrides (avoids ambiguity)
const CATEGORY_PREFIX_OVERRIDES: Record<string, string> = {
  // Urdu/English category names → 3-4 char prefix
  "rice": "RICE",
  "chawal": "RICE",
  "flour": "FLR",
  "atta": "FLR",
  "daal": "DAL",
  "dal": "DAL",
  "lentils": "DAL",
  "sugar": "SGR",
  "cheeni": "SGR",
  "oil": "OIL",
  "tel": "OIL",
  "ghee": "GHE",
  "spices": "SPC",
  "masala": "SPC",
  "tea": "TEA",
  "chai": "TEA",
  "milk": "MLK",
  "doodh": "MLK",
  "biscuit": "BIS",
  "beverages": "BEV",
  "cold drink": "BEV",
  "cleaning": "CLN",
  "groceries": "GRC",
  "household": "HSH",
  "snacks": "SNK",
  "chocolate": "CHC",
  "water": "WTR",
  "pani": "WTR",
  "bread": "BRD",
  "fruits": "FRU",
  "vegetables": "VEG",
  "sabzi": "VEG",
  "meat": "MT",
  "chicken": "CHK",
  "fish": "FSH",
};

/**
 * Derive a prefix from a category name.
 * Uses override table first, then falls back to first 3-4 consonants.
 */
function derivePrefix(categoryName: string): string {
  if (!categoryName) return "P";

  const lower = categoryName.toLowerCase().trim();

  // Check overrides
  for (const [key, prefix] of Object.entries(CATEGORY_PREFIX_OVERRIDES)) {
    if (lower.includes(key)) return prefix;
  }

  // Fallback: first 3-4 alphabetic characters, uppercased
  const cleaned = lower.replace(/[^a-z]/g, "");
  if (cleaned.length === 0) return "P";
  if (cleaned.length <= 4) return cleaned.toUpperCase();
  return cleaned.substring(0, 4).toUpperCase();
}

/**
 * Generate the next unique product code for a given category.
 *
 * @param categoryId - The category ID (optional, defaults to uncategorized 'P')
 * @returns A unique product code like "RICE00120" or "P000045"
 */
export async function generateProductCode(categoryId?: string): Promise<string> {
  let prefix = "P";
  let categoryName = "";

  if (categoryId) {
    try {
      const category = await db.category.findUnique({ where: { id: categoryId } });
      if (category) {
        categoryName = category.name;
        prefix = derivePrefix(category.name);
      }
    } catch {
      // If category lookup fails, use default 'P' prefix
    }
  }

  // Find the highest existing number for this prefix
  // Pattern: <PREFIX><6 digits>
  const pattern = new RegExp(`^${prefix}(\\d+)$`, "i");
  const existingProducts = await db.product.findMany({
    where: {
      productCode: { not: null },
    },
    select: { productCode: true },
  });

  let maxNumber = 0;
  for (const p of existingProducts) {
    if (!p.productCode) continue;
    const match = p.productCode.match(pattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNumber) maxNumber = num;
    }
  }

  // Next number
  const nextNumber = maxNumber + 1;
  // Pad to 6 digits
  const padded = String(nextNumber).padStart(6, "0");
  const code = `${prefix}${padded}`;

  // Verify uniqueness (extremely unlikely to collide, but safety first)
  const existing = await db.product.findFirst({
    where: { productCode: code },
  });
  if (existing) {
    // Collision — increment until we find a free one
    let attempts = 0;
    let testNum = nextNumber + 1;
    while (attempts < 1000) {
      const testCode = `${prefix}${String(testNum).padStart(6, "0")}`;
      const collision = await db.product.findFirst({ where: { productCode: testCode } });
      if (!collision) return testCode;
      testNum++;
      attempts++;
    }
  }

  return code;
}

/**
 * Generate a barcode value for a product.
 * For CODE128, we use the product code directly (e.g. "RICE00120").
 * This is human-readable AND machine-readable.
 *
 * For EAN-13, we'd need a numeric value, but internal products
 * should always use CODE128 (per the spec).
 */
export function generateBarcodeValue(productCode: string): string {
  // CODE128 supports alphanumeric, so we use the product code directly.
  // This makes the human-readable text under the bars match the product code,
  // which is ideal for grocery stores (cashier can type the code if scanner fails).
  return productCode;
}

/**
 * Validate a product code format.
 * Must be: 1-4 alphabetic chars + 6 digits.
 */
export function isValidProductCode(code: string): boolean {
  return /^[A-Z]{1,4}\d{6}$/.test(code);
}
