/**
 * Sticker HTML Generator — renders sticker HTML from settings
 * ─────────────────────────────────────────────────────────────────────────────
 * Used by both the live preview and the print window.
 * Guarantees the preview matches the printed output exactly.
 */

import { BarcodeSettings, getStickerDimensions } from "./barcode-settings";

export interface StickerData {
  shopName: string;
  shopLogo?: string | null;
  productName: string;
  productCode: string;
  barcodeSvg: string;
  salePrice: number;
  purchasePrice?: number;
  weight?: string;
  unit?: string;
  packingDate?: string;
  expiryDate?: string;
  batchNumber?: string;
  manufacturingDate?: string;
  currency: string;
}

/**
 * Build the HTML for a single sticker based on settings.
 * The HTML is self-contained and uses inline styles so it works in
 * both the preview div and the print window.
 */
export function buildStickerHtml(data: StickerData, settings: BarcodeSettings): string {
  const { widthMm, heightMm } = getStickerDimensions(settings);
  const fields = settings.stickerFields;

  // ─── Barcode SVG handling ────────────────────────────────────────────
  // JsBarcode renders SVG with explicit width/height attributes, so the
  // SVG displays correctly. We just ensure it's constrained to the
  // sticker width via CSS max-width.
  let barcodeSvg = data.barcodeSvg || "";
  if (barcodeSvg) {
    // Ensure SVG has style to constrain it within the sticker
    // JsBarcode sets width/height attrs, but we add max-width:100% as safety
    if (!barcodeSvg.includes("style=")) {
      barcodeSvg = barcodeSvg.replace(/<svg /, '<svg style="display:block;max-width:100%;height:auto;" ');
    }
  }

  // Barcode position: left, center, or right
  const barcodePos = settings.barcodePosition || "center";
  const barcodeJustify = barcodePos === "left" ? "flex-start" : barcodePos === "right" ? "flex-end" : "center";

  // Build each field's HTML
  const fieldHtml: Record<string, string> = {
    storeLogo: data.shopLogo
      ? `<img src="${escapeHtml(data.shopLogo)}" style="max-height: 4mm; max-width: 60%; object-fit: contain;" alt="logo" />`
      : "",
    storeName: `<div style="font-size: ${settings.fontSize + 1}px; font-weight: ${settings.fontBold ? "bold" : "normal"}; color: ${settings.textColor};">${escapeHtml(data.shopName)}</div>`,
    productName: `<div style="font-size: ${settings.fontSize}px; font-weight: ${settings.fontBold ? "bold" : "normal"}; color: ${settings.textColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${escapeHtml(data.productName)}</div>`,
    productCode: `<div style="font-size: ${settings.fontSize - 1}px; font-family: monospace; color: ${settings.textColor}; opacity: 0.8;">${escapeHtml(data.productCode)}</div>`,
    barcode: `<div style="display: flex; align-items: center; justify-content: ${barcodeJustify}; overflow: hidden; width: 100%; max-width: 100%;">${barcodeSvg}</div>`,
    barcodeNumber: settings.humanReadable
      ? `<div style="font-size: ${settings.fontSize - 1}px; font-family: monospace; font-weight: bold; color: ${settings.textColor};">${escapeHtml(data.productCode)}</div>`
      : "",
    sellingPrice: `<div style="font-size: ${settings.fontSize + 3}px; font-weight: bold; color: ${settings.textColor};">${escapeHtml(data.currency)} ${formatPrice(data.salePrice)}</div>`,
    purchasePrice: data.purchasePrice != null
      ? `<div style="font-size: ${settings.fontSize - 2}px; color: ${settings.textColor}; opacity: 0.6;">Cost: ${escapeHtml(data.currency)} ${formatPrice(data.purchasePrice)}</div>`
      : "",
    weight: data.weight ? `<div style="font-size: ${settings.fontSize - 2}px; color: ${settings.textColor}; opacity: 0.7;">Wt: ${escapeHtml(data.weight)}</div>` : "",
    unit: data.unit ? `<div style="font-size: ${settings.fontSize - 2}px; color: ${settings.textColor}; opacity: 0.7;">Unit: ${escapeHtml(data.unit)}</div>` : "",
    packingDate: data.packingDate ? `<div style="font-size: ${settings.fontSize - 2}px; color: ${settings.textColor}; opacity: 0.7;">Pkd: ${escapeHtml(data.packingDate)}</div>` : "",
    expiryDate: data.expiryDate ? `<div style="font-size: ${settings.fontSize - 2}px; color: ${settings.textColor}; opacity: 0.7;">Exp: ${escapeHtml(data.expiryDate)}</div>` : "",
    batchNumber: data.batchNumber ? `<div style="font-size: ${settings.fontSize - 2}px; color: ${settings.textColor}; opacity: 0.7;">Batch: ${escapeHtml(data.batchNumber)}</div>` : "",
    manufacturingDate: data.manufacturingDate ? `<div style="font-size: ${settings.fontSize - 2}px; color: ${settings.textColor}; opacity: 0.7;">Mfg: ${escapeHtml(data.manufacturingDate)}</div>` : "",
  };

  // Build ordered field list
  const orderedFieldsHtml = fields
    .filter(f => fieldHtml[f]) // skip empty fields
    .map(f => `<div style="margin: 0.3mm 0;">${fieldHtml[f]}</div>`)
    .join("");

  const textAlign = settings.textAlign;
  const alignItems = textAlign === "left" ? "flex-start" : textAlign === "right" ? "flex-end" : "center";

  return `
    <div class="sticker" style="
      width: ${widthMm}mm;
      height: ${heightMm}mm;
      padding: ${settings.margin}mm;
      display: flex;
      flex-direction: column;
      align-items: ${alignItems};
      justify-content: space-between;
      font-family: ${settings.fontFamily}, Arial, sans-serif;
      font-size: ${settings.fontSize}px;
      line-height: ${settings.lineSpacing};
      color: ${settings.textColor};
      background: #fff;
      text-align: ${textAlign};
      overflow: hidden;
      box-sizing: border-box;
    ">
      ${orderedFieldsHtml}
    </div>
  `;
}

/**
 * Build the print window HTML for one or more stickers.
 * Handles thermal (one per page) vs A4 (grid) layouts.
 */
export function buildPrintHtml(
  stickers: string[],
  settings: BarcodeSettings,
  productTitle: string
): string {
  const { widthMm, heightMm } = getStickerDimensions(settings);

  let bodyHtml: string;
  let pageStyle: string;

  if (settings.printerType === "a4") {
    // A4: 210x297mm. Calculate how many stickers fit.
    const cols = Math.max(1, Math.floor((210 - 2 * settings.margin) / (widthMm + settings.labelGap)));
    const rows = Math.max(1, Math.floor((297 - 2 * settings.margin) / (heightMm + settings.labelGap)));

    bodyHtml = `<div class="a4-grid" style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: ${settings.labelGap}mm; padding: ${settings.margin}mm;">${stickers.join("")}</div>`;
    pageStyle = `
      @page { size: A4; margin: 0; }
      .a4-grid { width: 210mm; min-height: 297mm; }
      .sticker { page-break-inside: avoid; }
    `;
  } else {
    // Thermal: one sticker per page, page size = sticker size
    bodyHtml = stickers.join("");
    pageStyle = `
      @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
      .sticker { page-break-after: always; }
      .sticker:last-child { page-break-after: auto; }
    `;
  }

  return `
    <html dir="ltr"><head><title>Sticker — ${escapeHtml(productTitle)}</title>
    <style>
      html, body {
        margin: 0; padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      * { box-sizing: border-box; }
      ${pageStyle}
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style></head>
    <body>${bodyHtml}
    <script>
      window.onload = function () {
        setTimeout(function () {
          window.focus();
          window.print();
          setTimeout(function () { window.close(); }, 500);
        }, 800);
      };
    </script>
    </body></html>
  `;
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Safe number formatter — handles undefined/null/NaN without crashing
function safeNumber(n: number | null | undefined): number {
  if (n == null || isNaN(n as number)) return 0;
  return n;
}

function formatPrice(n: number | null | undefined, min = 0, max = 2): string {
  return safeNumber(n).toLocaleString("en-PK", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}
