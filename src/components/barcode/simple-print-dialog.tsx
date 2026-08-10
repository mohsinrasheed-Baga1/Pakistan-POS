"use client";

/**
 * Simple Product Print Dialog (v3 — JsBarcode client-side)
 * ─────────────────────────────────────────────────────────────────────────────
 * REVERTED to the proven JsBarcode client-side approach that worked in v2.7.x.
 * The bwip-js server-side approach had async bugs that prevented SVG from
 * reaching the client. JsBarcode renders directly in the browser — no API
 * call needed, guaranteed to show barcode bars.
 *
 * Settings (sticker size, font, fields) still come from saved settings.
 * But barcode generation is 100% client-side using JsBarcode.
 *
 * Layout: Compact 2-column (preview | controls), no scrolling.
 * Buttons: Close, PDF, Print.
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
  const barcodeSvgRef = React.useRef<SVGSVGElement>(null);
  const [barcodeReady, setBarcodeReady] = React.useState(false);

  // Fetch shop settings if not provided
  const [fetchedShopName, setFetchedShopName] = React.useState(shopName || "My Shop");
  React.useEffect(() => {
    if (shopName) { setFetchedShopName(shopName); return; }
    fetch("/api/settings", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { setFetchedShopName(d?.settings?.shopName?.trim() || "My Shop"); })
      .catch(() => setFetchedShopName("My Shop"));
  }, [shopName]);

  // Render barcode using JsBarcode (client-side, proven working)
  React.useEffect(() => {
    if (!product || !barcodeSvgRef.current || settingsLoading) return;

    const barcodeValue = product.productCode || product.barcode;
    if (!barcodeValue) return;

    // Determine format: EAN13 if 13 digits, otherwise CODE128
    const isEan13 = /^\d{13}$/.test(barcodeValue);
    const format = isEan13 ? "EAN13" : "CODE128";

    const renderFn = () => {
      if (!barcodeSvgRef.current || !(window as any).JsBarcode) return;
      try {
        (window as any).JsBarcode(barcodeSvgRef.current, barcodeValue, {
          format,
          width: settings.barcodeWidth || 2,
          height: settings.barcodeHeight || 40,
          displayValue: settings.humanReadable,
          fontSize: 12,
          font: "monospace",
          fontOptions: "bold",
          margin: settings.quietZone || 4,
          marginTop: settings.barcodeTopMargin || 0,
          marginBottom: settings.barcodeBottomMargin || 0,
          textMargin: 2,
          background: "#ffffff",
          lineColor: "#000000",
        });
        setBarcodeReady(true); // trigger preview re-render
      } catch (e) {
        console.error("JsBarcode error:", e);
        try {
          (window as any).JsBarcode(barcodeSvgRef.current, barcodeValue, {
            format: "CODE128",
            width: 2,
            height: 40,
            displayValue: true,
            fontSize: 12,
            margin: 4,
          });
          setBarcodeReady(true);
        } catch (e2) {
          console.error("JsBarcode fallback error:", e2);
        }
      }
    };

    if ((window as any).JsBarcode) {
      renderFn();
    } else {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js";
      script.onload = renderFn;
      document.head.appendChild(script);
    }
  }, [product, settings, settingsLoading]);

  if (!product) return null;

  const { widthMm, heightMm } = getStickerDimensions(settings);

  // Get SVG outer HTML for print — reads from the hidden ref element
  function getBarcodeSvgHtml(): string {
    if (!barcodeSvgRef.current) return "";
    const svg = barcodeSvgRef.current;
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute("style", "display:block;max-width:100%;height:auto;max-height:15mm;");
    clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
    return clone.outerHTML;
  }

  // Build sticker HTML for print
  function buildStickerHtml(): string {
    const barcodeValue = product!.productCode || product!.barcode;
    const fields = settings.stickerFields;
    const fontSize = settings.fontSize || 8;
    const textColor = settings.textColor || "#000000";
    const fontFamily = settings.fontFamily || "Tahoma";
    const isBold = settings.fontBold ? "bold" : "normal";
    const align = settings.textAlign || "center";
    const alignItems = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
    // Barcode position within sticker
    const barcodePos = (settings as any).barcodePosition || "center";
    const barcodeJustify = barcodePos === "left" ? "flex-start" : barcodePos === "right" ? "flex-end" : "center";

    const fieldHtml: Record<string, string> = {
      storeName: `<div style="font-size:${fontSize + 1}px;font-weight:bold;color:${textColor};">${esc(fetchedShopName)}</div>`,
      productName: `<div style="font-size:${fontSize}px;font-weight:${isBold};color:${textColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${esc(product!.name)}</div>`,
      productCode: `<div style="font-size:${fontSize - 1}px;font-family:monospace;color:${textColor};opacity:0.8;">${esc(barcodeValue)}</div>`,
      barcode: `<div style="display:flex;align-items:center;justify-content:${barcodeJustify};width:100%;max-width:100%;">${getBarcodeSvgHtml()}</div>`,
      barcodeNumber: settings.humanReadable ? `<div style="font-size:${fontSize - 1}px;font-family:monospace;font-weight:bold;color:${textColor};">${esc(barcodeValue)}</div>` : "",
      sellingPrice: `<div style="font-size:${fontSize + 3}px;font-weight:bold;color:${textColor};">Rs ${product!.salePrice.toLocaleString("en-PK")}</div>`,
      expiryDate: product!.expiryDate ? `<div style="font-size:${fontSize - 2}px;color:${textColor};opacity:0.7;">Exp: ${new Date(product!.expiryDate).toLocaleDateString("en-PK")}</div>` : "",
    };

    const orderedHtml = fields
      .filter(f => fieldHtml[f])
      .map(f => `<div style="margin:0.3mm 0;">${fieldHtml[f]}</div>`)
      .join("");

    return `<div class="sticker" style="width:${widthMm}mm;height:${heightMm}mm;padding:${settings.margin}mm;display:flex;flex-direction:column;align-items:${alignItems};justify-content:space-between;font-family:${fontFamily},Arial,sans-serif;font-size:${fontSize}px;line-height:${settings.lineSpacing};color:${textColor};background:#fff;text-align:${align};overflow:hidden;box-sizing:border-box;">${orderedHtml}</div>`;
  }

  function handlePrint() {
    const stickerHtml = buildStickerHtml();
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
        .sticker svg { display: block; width: 100% !important; height: auto !important; max-height: 15mm; }
      </style></head>
      <body>${stickers}
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
      <script>
        var barcodeValue = '${(product!.productCode || product!.barcode).replace(/'/g, "\\'")}';
        var format = /^\\d{13}$/.test(barcodeValue) ? 'EAN13' : 'CODE128';
        var settings = ${JSON.stringify({ width: settings.barcodeWidth, height: settings.barcodeHeight, humanReadable: settings.humanReadable, quietZone: settings.quietZone })};
        function renderBarcodes() {
          var svgs = document.querySelectorAll('.sticker svg');
          svgs.forEach(function(svg) {
            try {
              JsBarcode(svg, barcodeValue, {
                format: format,
                width: settings.width || 2,
                height: settings.height || 40,
                displayValue: settings.humanReadable,
                fontSize: 12,
                font: 'monospace',
                fontOptions: 'bold',
                margin: settings.quietZone || 4,
                textMargin: 2,
                background: '#ffffff',
                lineColor: '#000000',
              });
            } catch (e) {
              console.error('barcode error', e);
              try {
                JsBarcode(svg, barcodeValue, { format: 'CODE128', width: 2, height: 40, displayValue: true, fontSize: 12, margin: 4 });
              } catch (e2) { console.error('fallback error', e2); }
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

  function handleExportPdf() {
    const stickerHtml = buildStickerHtml();
    const stickers = Array.from({ length: count }, () => stickerHtml).join("");
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) { toast.error("Pop-up blocked"); return; }
    win.document.write(`
      <html dir="ltr"><head><title>Sticker — ${esc(product!.name)}</title>
      <style>
        html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        * { box-sizing: border-box; }
        @page { size: A4; margin: 5mm; }
        .sticker { display: inline-block; margin: 2mm; page-break-inside: avoid; }
        .sticker svg { display: block; width: 100% !important; height: auto !important; max-height: 15mm; }
      </style></head>
      <body>${stickers}
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
      <script>
        var barcodeValue = '${(product!.productCode || product!.barcode).replace(/'/g, "\\'")}';
        var format = /^\\d{13}$/.test(barcodeValue) ? 'EAN13' : 'CODE128';
        function renderBarcodes() {
          var svgs = document.querySelectorAll('.sticker svg');
          svgs.forEach(function(svg) {
            try {
              JsBarcode(svg, barcodeValue, {
                format: format, width: ${settings.barcodeWidth || 2}, height: ${settings.barcodeHeight || 40},
                displayValue: ${settings.humanReadable}, fontSize: 12, font: 'monospace', fontOptions: 'bold',
                margin: ${settings.quietZone || 4}, background: '#ffffff', lineColor: '#000000',
              });
            } catch (e) {
              try { JsBarcode(svg, barcodeValue, { format: 'CODE128', width: 2, height: 40, displayValue: true, fontSize: 12, margin: 4 }); } catch(e2) {}
            }
          });
        }
        window.onload = function () {
          setTimeout(function () {
            renderBarcodes();
            setTimeout(function () { window.focus(); window.print(); }, 500);
          }, 300);
        };
      </script>
      </body></html>
    `);
    win.document.close();
    win.focus();
    toast.info("Use 'Save as PDF' in the print dialog to export");
  }

  const previewScale = 200 / widthMm;

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Printer className="w-5 h-5" />
            Print Barcode Sticker
          </DialogTitle>
        </DialogHeader>

        {/* No-scroll layout: preview on left, controls on right */}
        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0 overflow-hidden">
          {/* Left: Sticker Preview */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium">Preview</Label>
            <div className="flex-1 flex items-center justify-center bg-muted/30 rounded-lg p-2 min-h-[180px]">
              {settingsLoading ? (
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                  <span className="text-xs text-muted-foreground">Loading...</span>
                </div>
              ) : (
                <div
                  key={barcodeReady ? "ready" : "pending"} // forces re-render when barcodeReady changes
                  style={{
                    transform: `scale(${previewScale})`,
                    transformOrigin: "center",
                    width: `${widthMm}mm`,
                    height: `${heightMm}mm`,
                  }}
                  className="bg-white border"
                  dangerouslySetInnerHTML={{ __html: buildStickerHtml() }}
                />
              )}
            </div>
            <div className="text-xs text-muted-foreground text-center">
              {widthMm}×{heightMm}mm
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex flex-col gap-2">
            <div>
              <Label className="text-xs font-medium">Product</Label>
              <div className="text-sm font-medium truncate" title={product.name}>{product.name}</div>
            </div>
            <div>
              <Label className="text-xs font-medium">Code</Label>
              <div className="text-xs font-mono text-muted-foreground">{product.productCode || product.barcode}</div>
            </div>
            <div>
              <Label className="text-xs font-medium">Price</Label>
              <div className="text-sm font-bold text-emerald-700">Rs {product.salePrice.toLocaleString()}</div>
            </div>
            <div>
              <Label className="text-xs font-medium">تعداد / Copies</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={count}
                onChange={(e) => setCount(Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
                className="h-9 text-base font-bold"
                autoFocus
              />
            </div>
          </div>
        </div>

        {/* Hidden SVG for barcode rendering (source for print) */}
        <svg ref={barcodeSvgRef} style={{ position: "absolute", left: "-9999px", width: "200px", height: "60px" }} />

        {/* Footer: action buttons */}
        <DialogFooter className="flex-shrink-0 gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            <X className="w-4 h-4 mr-1" /> Close
          </Button>
          <Button variant="outline" onClick={handleExportPdf} className="flex-1">
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
