"use client";

/**
 * Industrial Sticker Printer
 * ─────────────────────────────────────────────────────────────────────────────
 * Prints barcode stickers using pre-rendered SVG (from /api/barcode/generate).
 * Supports multiple sticker sizes, DPI options, and A4 label sheets.
 *
 * Sticker layout includes:
 * - Store Name (top, bold)
 * - Product Name (below store name)
 * - Barcode (CODE 128, centered, with quiet zones)
 * - Human-readable barcode number (below barcode)
 * - Selling Price (bottom, bold, prominent)
 * - Weight (optional)
 * - Packing Date (optional)
 * - Expiry Date (optional)
 *
 * Print targets:
 * - Thermal Printer 203 DPI (default for most thermal label printers)
 * - Thermal Printer 300 DPI (high-resolution thermal)
 * - A4 Label Sheets (multiple stickers per page)
 */

import * as React from "react";
import { Printer, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export interface StickerData {
  shopName: string;
  productName: string;
  /** Pre-rendered SVG string from /api/barcode/generate */
  barcodeSvg: string;
  /** Human-readable barcode value (e.g. "RICE00120") */
  barcodeText: string;
  /** Whether ZXing verified the barcode */
  verified: boolean;
  salePrice: number;
  currency?: string;
  weight?: string;
  packingDate?: string;
  expiryDate?: string;
}

export type StickerSize = "40x30" | "50x25" | "50x30" | "60x40" | "custom";
export type PrintTarget = "thermal203" | "thermal300" | "a4";

interface StickerSizeConfig {
  widthMm: number;
  heightMm: number;
  label: string;
}

const STICKER_SIZES: Record<StickerSize, StickerSizeConfig> = {
  "40x30": { widthMm: 40, heightMm: 30, label: "40 × 30 mm" },
  "50x25": { widthMm: 50, heightMm: 25, label: "50 × 25 mm" },
  "50x30": { widthMm: 50, heightMm: 30, label: "50 × 30 mm" },
  "60x40": { widthMm: 60, heightMm: 40, label: "60 × 40 mm" },
  "custom": { widthMm: 50, heightMm: 30, label: "Custom" },
};

const PRINT_TARGETS: Record<PrintTarget, { label: string; dpi: number }> = {
  thermal203: { label: "Thermal Printer (203 DPI)", dpi: 203 },
  thermal300: { label: "Thermal Printer (300 DPI)", dpi: 300 },
  a4: { label: "A4 Label Sheet", dpi: 300 },
};

interface StickerPrinterProps {
  data: StickerData;
  count: number;
  defaultSize?: StickerSize;
  onClose?: () => void;
}

export function StickerPrinter({ data, count, defaultSize = "50x30", onClose }: StickerPrinterProps) {
  const [stickerSize, setStickerSize] = React.useState<StickerSize>(defaultSize);
  const [customWidth, setCustomWidth] = React.useState("50");
  const [customHeight, setCustomHeight] = React.useState("30");
  const [printTarget, setPrintTarget] = React.useState<PrintTarget>("thermal203");
  const [includeWeight, setIncludeWeight] = React.useState(!!data.weight);
  const [includePackingDate, setIncludePackingDate] = React.useState(!!data.packingDate);
  const [includeExpiryDate, setIncludeExpiryDate] = React.useState(!!data.expiryDate);

  const sizeConfig = stickerSize === "custom"
    ? { widthMm: parseFloat(customWidth) || 50, heightMm: parseFloat(customHeight) || 30, label: "Custom" }
    : STICKER_SIZES[stickerSize];

  const dpi = PRINT_TARGETS[printTarget].dpi;

  // mm to px conversion for preview
  const mmToPx = (mm: number, dpiVal: number) => Math.round((mm * dpiVal) / 25.4);

  function handlePrint() {
    if (!data.barcodeSvg) {
      toast.error("No barcode SVG available. Generate barcode first.");
      return;
    }
    if (!data.verified) {
      toast.warning("Barcode is NOT verified. Print at your own risk.");
    }

    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) {
      toast.error("Pop-up blocked. Please allow pop-ups to print.");
      return;
    }

    const { widthMm, heightMm } = sizeConfig;

    // Build sticker HTML
    const stickerHtml = buildStickerHtml(data, widthMm, heightMm, {
      includeWeight,
      includePackingDate,
      includeExpiryDate,
    });

    // A4 layout: multiple stickers in a grid
    // Thermal: one sticker per page (page size = sticker size)
    let bodyHtml: string;
    let pageStyle: string;

    if (printTarget === "a4") {
      // A4: 210x297mm. Calculate how many stickers fit.
      const cols = Math.floor(200 / widthMm); // 5mm margin each side
      const rows = Math.floor(287 / heightMm);
      const totalPerPage = Math.min(cols * rows, count);

      const stickers: string[] = [];
      for (let i = 0; i < totalPerPage; i++) {
        stickers.push(`<div class="sticker-cell">${stickerHtml}</div>`);
      }

      bodyHtml = `<div class="a4-grid" style="grid-template-columns: repeat(${cols}, 1fr);">${stickers.join("")}</div>`;
      pageStyle = `
        @page { size: A4; margin: 5mm; }
        .a4-grid {
          display: grid;
          gap: 2mm;
          width: 200mm;
        }
        .sticker-cell {
          width: ${widthMm}mm;
          height: ${heightMm}mm;
          page-break-inside: avoid;
        }
      `;
    } else {
      // Thermal: one sticker per page, page size = sticker size
      const stickers: string[] = [];
      for (let i = 0; i < count; i++) {
        stickers.push(stickerHtml);
      }
      bodyHtml = stickers.join("");
      pageStyle = `
        @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
        .sticker { page-break-after: always; }
        .sticker:last-child { page-break-after: auto; }
      `;
    }

    win.document.write(`
      <html dir="ltr"><head><title>Sticker — ${escapeHtml(data.productName)}</title>
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
    `);
    win.document.close();
    win.focus();
  }

  // Preview dimensions (scaled to fit ~200px wide)
  const previewScale = 200 / sizeConfig.widthMm;
  const previewWidth = sizeConfig.widthMm * previewScale;
  const previewHeight = sizeConfig.heightMm * previewScale;

  return (
    <div className="space-y-4">
      {/* Verification status */}
      <div className={`rounded-lg border p-3 flex items-center gap-2 ${
        data.verified
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-rose-300 bg-rose-50 text-rose-800"
      }`}>
        {data.verified ? (
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
        ) : (
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
        )}
        <div className="text-sm">
          <div className="font-bold">
            {data.verified ? "Barcode Verified ✓" : "Barcode NOT Verified ✗"}
          </div>
          <div className="text-xs opacity-80">
            {data.verified
              ? "ZXing successfully decoded this barcode. Safe to print."
              : "ZXing could not decode this barcode. Please regenerate."}
          </div>
        </div>
      </div>

      {/* Sticker size selector */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Sticker Size</Label>
        <div className="grid grid-cols-5 gap-2">
          {(Object.keys(STICKER_SIZES) as StickerSize[]).map(s => (
            <button
              key={s}
              onClick={() => setStickerSize(s)}
              className={`px-2 py-2 rounded-md text-xs font-medium border-2 transition-colors ${
                stickerSize === s
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-muted hover:border-emerald-300"
              }`}
            >
              {STICKER_SIZES[s].label}
            </button>
          ))}
        </div>
        {stickerSize === "custom" && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <Label className="text-xs">Width (mm)</Label>
              <input
                type="number"
                value={customWidth}
                onChange={(e) => setCustomWidth(e.target.value)}
                className="w-full rounded-md border px-2 py-1 text-sm"
                min="20"
                max="100"
              />
            </div>
            <div>
              <Label className="text-xs">Height (mm)</Label>
              <input
                type="number"
                value={customHeight}
                onChange={(e) => setCustomHeight(e.target.value)}
                className="w-full rounded-md border px-2 py-1 text-sm"
                min="15"
                max="80"
              />
            </div>
          </div>
        )}
      </div>

      {/* Print target selector */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Print Target</Label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(PRINT_TARGETS) as PrintTarget[]).map(t => (
            <button
              key={t}
              onClick={() => setPrintTarget(t)}
              className={`px-2 py-2 rounded-md text-xs font-medium border-2 transition-colors ${
                printTarget === t
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-muted hover:border-emerald-300"
              }`}
            >
              {PRINT_TARGETS[t].label}
            </button>
          ))}
        </div>
      </div>

      {/* Optional fields */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Optional Fields</Label>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={includeWeight} onChange={(e) => setIncludeWeight(e.target.checked)} />
            Weight
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={includePackingDate} onChange={(e) => setIncludePackingDate(e.target.checked)} />
            Packing Date
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={includeExpiryDate} onChange={(e) => setIncludeExpiryDate(e.target.checked)} />
            Expiry Date
          </label>
        </div>
      </div>

      {/* Sticker preview */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Preview (scaled)</Label>
        <div className="flex justify-center bg-muted/30 p-4 rounded-lg">
          <div
            style={{
              width: `${previewWidth}px`,
              height: `${previewHeight}px`,
              transform: `scale(${previewScale})`,
              transformOrigin: "top left",
            }}
            className="bg-white border border-gray-300 shadow-sm"
            dangerouslySetInnerHTML={{
              __html: buildStickerHtml(data, sizeConfig.widthMm, sizeConfig.heightMm, {
                includeWeight,
                includePackingDate,
                includeExpiryDate,
              }),
            }}
          />
        </div>
        <div className="text-center text-xs text-muted-foreground">
          Actual size: {sizeConfig.widthMm} × {sizeConfig.heightMm} mm • {dpi} DPI
        </div>
      </div>

      {/* Print button */}
      <div className="flex gap-2">
        {onClose && (
          <Button variant="outline" onClick={onClose} className="flex-1">
            Close
          </Button>
        )}
        <Button
          onClick={handlePrint}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          disabled={!data.barcodeSvg}
        >
          <Printer className="w-4 h-4 mr-2" />
          Print {count} Sticker{count > 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sticker HTML builder
// ─────────────────────────────────────────────────────────────────────────────

function buildStickerHtml(
  data: StickerData,
  widthMm: number,
  heightMm: number,
  opts: { includeWeight: boolean; includePackingDate: boolean; includeExpiryDate: boolean }
): string {
  const currency = data.currency || "Rs";
  const weightHtml = opts.includeWeight && data.weight
    ? `<div class="field">Wt: ${escapeHtml(data.weight)}</div>`
    : "";
  const packingHtml = opts.includePackingDate && data.packingDate
    ? `<div class="field">Pkd: ${escapeHtml(data.packingDate)}</div>`
    : "";
  const expiryHtml = opts.includeExpiryDate && data.expiryDate
    ? `<div class="field">Exp: ${escapeHtml(data.expiryDate)}</div>`
    : "";

  return `
    <div class="sticker" style="
      width: ${widthMm}mm;
      height: ${heightMm}mm;
      padding: 1mm 1.5mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      font-family: Tahoma, Arial, sans-serif;
      color: #000;
      background: #fff;
      overflow: hidden;
      box-sizing: border-box;
    ">
      <div style="font-size: 8px; font-weight: bold; text-align: center; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        ${escapeHtml(data.shopName)}
      </div>
      <div style="font-size: 7px; font-weight: 600; text-align: center; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        ${escapeHtml(data.productName)}
      </div>
      <div style="display: flex; align-items: center; justify-content: center; width: 100%; flex: 1; min-height: 0; overflow: hidden;">
        ${data.barcodeSvg || "<div style='color:#999;font-size:8px;'>No barcode</div>"}
      </div>
      <div style="font-size: 7px; font-weight: bold; font-family: monospace; text-align: center; width: 100%;">
        ${escapeHtml(data.barcodeText)}
      </div>
      <div style="display: flex; justify-content: space-between; width: 100%; font-size: 6px; gap: 1mm;">
        ${weightHtml}
        ${packingHtml}
        ${expiryHtml}
      </div>
      <div style="font-size: 11px; font-weight: bold; text-align: center; width: 100%; color: #000;">
        ${currency} ${data.salePrice.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
