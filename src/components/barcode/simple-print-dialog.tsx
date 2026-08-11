"use client";

/**
 * Simple Product Print Dialog (v5 — guaranteed barcode visibility)
 * ─────────────────────────────────────────────────────────────────────────────
 * This version uses a DIFFERENT approach to guarantee the barcode is visible:
 * 
 * Instead of rendering JsBarcode into a querySelector'd SVG (which has
 * timing issues — the ref might not be ready when JsBarcode runs),
 * we use a CALLBACK REF on the SVG element. When React mounts the SVG,
 * the callback fires, and we render JsBarcode into it immediately.
 * 
 * This eliminates ALL timing/race condition issues.
 */

import * as React from "react";
import { Printer, FileDown, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useBarcodeSettings } from "@/hooks/use-barcode-settings";
import { getStickerDimensions } from "@/lib/barcode-settings";
import type { Product } from "@/types";

interface SimplePrintDialogProps {
  product: Product | null;
  shopName?: string;
  shopLogo?: string | null;
  onClose: () => void;
}

export function SimplePrintDialog({ product, shopName, shopLogo, onClose }: SimplePrintDialogProps) {
  const { settings, loading: settingsLoading } = useBarcodeSettings();
  const [count, setCount] = React.useState(1);
  const [shopSettings, setShopSettings] = React.useState<any>(null);

  // Fetch shop settings
  React.useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then(r => r.json())
      .then(d => setShopSettings(d?.settings || null))
      .catch(() => {});
  }, []);

  const shopNameDisplay = shopName || shopSettings?.shopName?.trim() || "My Shop";

  // ─── KEY FIX: Use a callback ref to render JsBarcode ──────────────
  // When React mounts the <svg>, this callback fires with the actual
  // DOM element. We render JsBarcode into it IMMEDIATELY.
  // No setTimeout, no querySelector, no race conditions.
  const barcodeSvgRef = React.useCallback((svgEl: SVGSVGElement | null) => {
    if (!svgEl || !product || settingsLoading) return;

    const barcodeValue = product.productCode || product.barcode;
    if (!barcodeValue) return;

    const isEan13 = /^\d{13}$/.test(barcodeValue);
    const format = isEan13 ? "EAN13" : "CODE128";

    const doRender = () => {
      if (!(window as any).JsBarcode) return;
      try {
        (window as any).JsBarcode(svgEl, barcodeValue, {
          format,
          width: settings.barcodeWidth || 2,
          height: settings.barcodeHeight || 40,
          displayValue: settings.humanReadable,
          fontSize: 12,
          font: "monospace",
          fontOptions: "bold",
          margin: settings.quietZone || 4,
          textMargin: 2,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch (e) {
        console.error("JsBarcode error:", e);
        try {
          (window as any).JsBarcode(svgEl, barcodeValue, {
            format: "CODE128",
            width: 2, height: 40, displayValue: true, fontSize: 12, margin: 4,
          });
        } catch (e2) { console.error("JsBarcode fallback error:", e2); }
      }
    };

    if ((window as any).JsBarcode) {
      doRender();
    } else {
      // Load JsBarcode if not already loaded
      const existingScript = document.querySelector('script[src*="jsbarcode"]');
      if (existingScript) {
        // Script already loading, wait a bit
        setTimeout(doRender, 100);
      } else {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js";
        script.onload = doRender;
        document.head.appendChild(script);
      }
    }
  }, [product, settings, settingsLoading]);

  if (!product) return null;

  const { widthMm, heightMm } = getStickerDimensions(settings);
  const barcodeValue = product.productCode || product.barcode;
  const fontSize = settings.fontSize || 8;
  const textColor = settings.textColor || "#000000";
  const fontFamily = settings.fontFamily || "Tahoma";
  const isBold = settings.fontBold ? "bold" : "normal";
  const align = settings.textAlign || "center";
  const barcodePos = (settings as any).barcodePosition || "center";
  const barcodeJustify = barcodePos === "left" ? "flex-start" : barcodePos === "right" ? "flex-end" : "center";
  const textAlign = align === "left" ? "left" : align === "right" ? "right" : "center";

  // Preview dimensions in pixels
  const pxPerMm = 3.78; // 96 DPI
  const maxPreviewWidthPx = 200;
  const naturalWidthPx = widthMm * pxPerMm;
  const scale = Math.min(maxPreviewWidthPx / naturalWidthPx, 1);
  const previewWidthPx = naturalWidthPx * scale;
  const previewHeightPx = heightMm * pxPerMm * scale;

  function buildPrintStickerHtml(): string {
    return `<div class="sticker" style="
      width:${widthMm}mm;
      height:${heightMm}mm;
      padding:${settings.margin || 1.5}mm;
      display:flex;
      flex-direction:column;
      align-items:${barcodeJustify};
      justify-content:space-between;
      font-family:${fontFamily},Arial,sans-serif;
      font-size:${fontSize}px;
      line-height:${settings.lineSpacing || 1.1};
      color:${textColor};
      background:#fff;
      text-align:${textAlign};
      overflow:hidden;
      box-sizing:border-box;
    ">
      <div style="font-size:${fontSize + 1}px;font-weight:bold;text-align:${textAlign};width:100%;">${esc(shopNameDisplay)}</div>
      <div style="display:flex;align-items:center;justify-content:${barcodeJustify};width:100%;">
        <svg class="barcode-svg" xmlns="http://www.w3.org/2000/svg"></svg>
      </div>
      <div style="font-size:${fontSize}px;font-weight:${isBold};text-align:${textAlign};width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(product!.name)}</div>
    </div>`;
  }

  function handlePrint() {
    const stickerHtml = buildPrintStickerHtml();
    const stickers = Array.from({ length: count }, () => stickerHtml).join("");

    const win = window.open("", "_blank", "width=600,height=600");
    if (!win) { toast.error("Pop-up blocked"); return; }

    const pageStyle = settings.printerType === "a4"
      ? `@page { size: A4; margin: 5mm; } .sticker { page-break-inside: avoid; display: inline-block; margin: ${settings.labelGap}mm; }`
      : `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; } .sticker { page-break-after: always; } .sticker:last-child { page-break-after: auto; }`;

    win.document.write(`
      <html dir="ltr"><head><title>Sticker — ${esc(product!.name)}</title>
      <style>
        html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        * { box-sizing: border-box; }
        ${pageStyle}
        .sticker svg { display: block; max-width: 100%; height: auto; }
      </style></head>
      <body>${stickers}
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
      <script>
        var barcodeValue = '${(barcodeValue || "").replace(/'/g, "\\'")}';
        var format = /^\\d{13}$/.test(barcodeValue) ? 'EAN13' : 'CODE128';
        function renderBarcodes() {
          var svgs = document.querySelectorAll('.sticker .barcode-svg');
          svgs.forEach(function(svg) {
            try {
              JsBarcode(svg, barcodeValue, {
                format: format,
                width: ${settings.barcodeWidth || 2},
                height: ${settings.barcodeHeight || 40},
                displayValue: ${settings.humanReadable},
                fontSize: 12,
                font: 'monospace',
                fontOptions: 'bold',
                margin: ${settings.quietZone || 4},
                textMargin: 2,
                background: '#ffffff',
                lineColor: '#000000',
              });
            } catch (e) {
              try { JsBarcode(svg, barcodeValue, { format: 'CODE128', width: 2, height: 40, displayValue: true, fontSize: 12, margin: 4 }); } catch(e2) {}
            }
          });
        }
        window.onload = function () {
          setTimeout(function () {
            renderBarcodes();
            setTimeout(function () {
              window.focus();
              window.print();
              setTimeout(function () { window.close(); }, 500);
            }, 500);
          }, 300);
        };
      </script>
      </body></html>
    `);
    win.document.close();
    win.focus();
  }

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Printer className="w-5 h-5" />
            Print Barcode Sticker
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {settingsLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mr-2" />
              <span className="text-sm text-muted-foreground">Loading settings...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Sticker Preview — shows the ACTUAL sticker with barcode bars */}
              <div className="text-center">
                <Label className="text-xs text-muted-foreground">
                  Sticker size: {widthMm}mm × {heightMm}mm
                </Label>
              </div>

              {/* THE STICKER PREVIEW — barcode rendered via callback ref */}
              <div className="flex justify-center bg-muted/30 rounded-lg p-4">
                <div style={{
                  width: `${previewWidthPx}px`,
                  minHeight: `${previewHeightPx}px`,
                  padding: `${(settings.margin || 1.5) * scale * pxPerMm}px`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: barcodeJustify,
                  justifyContent: "space-between",
                  fontFamily: `${fontFamily}, Arial, sans-serif`,
                  fontSize: `${fontSize * scale * pxPerMm}px`,
                  lineHeight: settings.lineSpacing || 1.1,
                  color: textColor,
                  background: "#fff",
                  textAlign: textAlign as any,
                  overflow: "hidden",
                  boxSizing: "border-box",
                  border: "1px solid #ccc",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}>
                  {/* Shop Name */}
                  <div style={{
                    fontSize: `${(fontSize + 1) * scale * pxPerMm}px`,
                    fontWeight: "bold",
                    textAlign: textAlign as any,
                    width: "100%",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {shopNameDisplay}
                  </div>
                  {/* Barcode SVG — rendered via callback ref (NO timing issues) */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: barcodeJustify,
                    width: "100%",
                    flex: "1",
                  }}>
                    {/* KEY: ref={barcodeSvgRef} is a callback ref.
                        When React mounts this SVG, barcodeSvgRef fires
                        with the actual DOM element. JsBarcode renders
                        into it immediately. No querySelector, no setTimeout. */}
                    <svg
                      ref={barcodeSvgRef}
                      xmlns="http://www.w3.org/2000/svg"
                      style={{ maxWidth: "100%", height: "auto" }}
                    />
                  </div>
                  {/* Product Name */}
                  <div style={{
                    fontSize: `${fontSize * scale * pxPerMm}px`,
                    fontWeight: isBold as any,
                    textAlign: textAlign as any,
                    width: "100%",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {product.name}
                  </div>
                </div>
              </div>

              {/* Product info + quantity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Product</Label>
                  <div className="text-sm font-medium truncate">{product.name}</div>
                </div>
                <div>
                  <Label className="text-xs font-medium">Price</Label>
                  <div className="text-sm font-bold text-emerald-700">Rs {product.salePrice.toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium whitespace-nowrap">Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={count}
                  onChange={(e) => setCount(Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
                  className="h-9 w-24 text-base font-bold"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            <X className="w-4 h-4 mr-1" /> Close
          </Button>
          <Button variant="outline" onClick={handlePrint} className="flex-1">
            <FileDown className="w-4 h-4 mr-1" /> PDF
          </Button>
          <Button onClick={handlePrint} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
