"use client";

/**
 * Simple Product Print Dialog (v6 — crash-proof)
 * ─────────────────────────────────────────────────────────────────────────────
 * v2.10.141: WRAPPED IN ERROR BOUNDARY.
 *   User reported: "شاپ سٹور کے اندر جا کر سٹیکر والے ائیکن پر کلک کرتے
 *   ہیں تو پورا سافٹ ویئر کریش کر جاتا ہے" — clicking the sticker icon
 *   in Shop Store crashed the entire app with "Application error: a
 *   client-side exception has occurred".
 *
 *   Root cause was elusive (likely a property access on a product with
 *   missing fields, or an unhandled error in the async print path).
 *
 *   FIX: Wrap the entire dialog body in a local ErrorBoundary so any
 *   render-time exception is caught locally — the dialog shows a
 *   friendly error message instead of taking down the whole Electron
 *   renderer. Also added defensive null checks for product.salePrice,
 *   product.name, etc. so missing fields don't throw.
 */

import * as React from "react";
import { Printer, FileDown, X, RefreshCw, AlertCircle } from "lucide-react";
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

// ─────────────────────────────────────────────────────────────────────────────
// v2.10.141: Local Error Boundary — catches any render exception thrown by
// the dialog body so the whole Electron renderer doesn't crash to the
// Next.js "Application error" page.
// ─────────────────────────────────────────────────────────────────────────────
class DialogErrorBoundary extends React.Component<
  { children: React.ReactNode; onClose: () => void; productName?: string },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error?.message || String(error) };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("SimplePrintDialog render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-md mx-auto text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
          <h3 className="text-base font-bold">Print dialog could not open</h3>
          <p className="text-xs text-muted-foreground">
            Something went wrong while opening the sticker print dialog.
            The product may have missing fields. Try a different product,
            or close and reopen the dialog.
          </p>
          {this.props.productName && (
            <p className="text-[10px] text-muted-foreground">
              Product: {this.props.productName}
            </p>
          )}
          {this.state.errorMessage && (
            <p className="text-[10px] text-red-600 font-mono break-all">
              {this.state.errorMessage.slice(0, 200)}
            </p>
          )}
          <Button onClick={this.props.onClose} size="sm" className="mt-2">
            <X className="w-4 h-4 mr-1" /> Close
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function SimplePrintDialog(props: SimplePrintDialogProps) {
  const { product, onClose } = props;
  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogErrorBoundary onClose={onClose} productName={product?.name}>
          <SimplePrintDialogBody {...props} />
        </DialogErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}

function SimplePrintDialogBody({ product, shopName, shopLogo, onClose }: SimplePrintDialogProps) {
  const { settings, loading: settingsLoading } = useBarcodeSettings();
  const [count, setCount] = React.useState(1);
  const [shopSettings, setShopSettings] = React.useState<any>(null);
  // v2.10.143: Local stickersPerRow state — initialized from saved settings,
  //   but user can override it RIGHT IN THE DIALOG without going to Settings.
  //   This fixes the issue where the saved setting wasn't being applied:
  //   the user can now SEE the current value and change it for this print.
  //   User: "سٹکر کی سیٹنگ تو چینج ہو رہی ہے لیکن جب ہم شاپ سٹور کے اندر
  //   جا کر سٹکر کے ائیکون پر کلک کر کے پرنٹ کرتے ہیں تو سنگل سٹکر ہی
  //   نکلتا ہے"
  const [localStickersPerRow, setLocalStickersPerRow] = React.useState<number>(1);
  const [userOverrodeStickersPerRow, setUserOverrodeStickersPerRow] = React.useState(false);

  // When settings load, initialize localStickersPerRow from the saved value
  // (but only if the user hasn't manually changed it in this dialog session)
  React.useEffect(() => {
    if (!settingsLoading && !userOverrodeStickersPerRow) {
      const saved = Number((settings as any).stickersPerRow);
      if ([1, 2, 3, 4].includes(saved)) {
        setLocalStickersPerRow(saved);
      }
    }
  }, [settingsLoading, settings, userOverrodeStickersPerRow]);

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
      <div style="font-size:${fontSize}px;font-weight:${isBold};text-align:${textAlign};width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(product!.name || "(unnamed)")}</div>
    </div>`;
  }

  // v2.10.139→140: handlePrint restructured to fix CRASH.
  //   v2.10.139 made handlePrint async and put `await fetch(...)` BEFORE
  //   `window.open(...)`. In Chromium/Electron, calling window.open() AFTER
  //   an await loses the user gesture → popup blocked → `win` is null or a
  //   broken proxy → writing to win.document throws → app crashes.
  //
  //   v2.10.140 FIX: Open the window FIRST (synchronously, user gesture
  //   preserved), THEN do the async fetch, THEN write content to the
  //   already-open window. This eliminates the popup-blocker crash entirely.
  //
  //   User: "جب میں نے شاپ سٹور کے اندر جا کر سٹیکر کو پرنٹ کرنے کی کوشش
  //   کرتا ہوں سٹکر پر کلک کرتا ہوں تو سافٹ ویئر کریش کر جاتا ہے"
  async function handlePrint() {
    // 1. Open the print window IMMEDIATELY (sync, before any await) so the
    //    user gesture is preserved and Electron's popup blocker doesn't fire.
    const win = window.open("", "_blank", "width=600,height=600");
    if (!win) {
      toast.error("Pop-up blocked. Please allow pop-ups for this app.");
      return;
    }

    // 2. Show a "Preparing…" placeholder in the window while we fetch settings.
    //    This also confirms the window was opened successfully.
    try {
      win.document.open();
      win.document.write(`
        <html><head><title>Preparing sticker…</title></head>
        <body style="font-family:sans-serif;padding:24px;color:#555;">
          <h3>Preparing sticker…</h3>
          <p>Loading barcode settings, please wait.</p>
        </body></html>
      `);
      win.document.close();
    } catch (e) {
      console.error("Print window write failed:", e);
      toast.error("Could not open print window.");
      return;
    }

    // 3. Determine effective stickersPerRow.
    // v2.10.143: If the user changed the selector in THIS dialog session,
    //   use their value (userOverrodeStickersPerRow=true). Otherwise, fetch
    //   the saved value from the API to get the latest.
    let effectiveStickersPerRow = localStickersPerRow;
    let savedPrinterType = settings.printerType;
    if (!userOverrodeStickersPerRow) {
      try {
        const r = await fetch("/api/settings/barcode", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          const s = d?.settings;
          if (s) {
            const v = Number(s.stickersPerRow);
            if ([1, 2, 3, 4].includes(v)) {
              effectiveStickersPerRow = v;
              setLocalStickersPerRow(v); // also update the UI selector
            }
            if (s.printerType) savedPrinterType = s.printerType;
          }
        }
      } catch {}
    }

    // 4. Build the sticker HTML + page style using effectiveStickersPerRow.
    const stickerHtml = buildPrintStickerHtml();
    const perRow = effectiveStickersPerRow;

    let stickersHtml: string;
    let pageStyle: string;

    if (perRow > 1 && savedPrinterType !== "a4") {
      // Multi-sticker per row layout (Triple/Double/Quad)
      const pageWidthMm = widthMm * perRow;
      const totalRows = Math.ceil(count / perRow);
      const rows: string[] = [];
      let idx = 0;
      for (let row = 0; row < totalRows; row++) {
        const rowStickers: string[] = [];
        for (let col = 0; col < perRow; col++) {
          if (idx < count) {
            rowStickers.push(`<div class="sticker-cell">${stickerHtml}</div>`);
            idx++;
          } else {
            rowStickers.push(`<div class="sticker-cell empty"></div>`);
          }
        }
        rows.push(`<div class="sticker-row">${rowStickers.join("")}</div>`);
      }
      stickersHtml = `<div class="multi-sticker">${rows.join("")}</div>`;
      pageStyle = `
        @page { size: ${pageWidthMm}mm ${heightMm}mm; margin: 0; }
        .multi-sticker { width: ${pageWidthMm}mm; }
        .sticker-row { display: flex; width: ${pageWidthMm}mm; height: ${heightMm}mm; page-break-after: always; }
        .sticker-row:last-child { page-break-after: auto; }
        .sticker-cell { width: ${widthMm}mm; height: ${heightMm}mm; overflow: hidden; }
        .sticker-cell.empty { visibility: hidden; }
        .sticker { width: ${widthMm}mm; height: ${heightMm}mm; }
      `;
    } else if (savedPrinterType === "a4") {
      stickersHtml = Array.from({ length: count }, () => stickerHtml).join("");
      pageStyle = `@page { size: A4; margin: 5mm; } .sticker { page-break-inside: avoid; display: inline-block; margin: ${settings.labelGap}mm; }`;
    } else {
      // Single sticker per page (original behavior)
      stickersHtml = Array.from({ length: count }, () => stickerHtml).join("");
      pageStyle = `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; } .sticker { page-break-after: always; } .sticker:last-child { page-break-after: auto; }`;
    }

    // 5. Write the actual print HTML to the already-open window.
    try {
      win.document.open();
      win.document.write(`
        <html dir="ltr"><head><title>Sticker — ${esc(product!.name || "(unnamed)")}</title>
        <style>
          html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          * { box-sizing: border-box; }
          ${pageStyle}
          .sticker svg { display: block; max-width: 100%; height: auto; }
        </style></head>
        <body>${stickersHtml}
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
    } catch (e) {
      console.error("Print window final write failed:", e);
      toast.error("Failed to write sticker to print window.");
    }
  }

  // v2.10.139: Track in-flight print to prevent double-clicks during async fetch
  const [printing, setPrinting] = React.useState(false);

  async function handlePrintClicked() {
    if (printing) return;
    if (settingsLoading) {
      toast.info("Settings are still loading — please wait a moment and try again.");
      return;
    }
    setPrinting(true);
    try {
      await handlePrint();
    } finally {
      setPrinting(false);
    }
  }

  // v2.10.141: Defensive null guards — if product has missing fields (e.g.
  //   salePrice is undefined for some old rows), we render safe fallbacks
  //   instead of throwing and crashing the whole app.
  const safeSalePrice = typeof product.salePrice === "number" && !isNaN(product.salePrice)
    ? product.salePrice
    : 0;
  const safeProductName = product.name || "(unnamed product)";

  return (
    <>
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

              {/* THE STICKER PREVIEW — EXACT replica of print output
                  Uses mm units (same as print) so what you see = what you print */}
              <div className="flex justify-center bg-muted/30 rounded-lg p-4">
                <div style={{
                  width: `${widthMm}mm`,
                  minHeight: `${heightMm}mm`,
                  padding: `${settings.margin || 1.5}mm`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: barcodeJustify,
                  justifyContent: "space-between",
                  fontFamily: `${fontFamily}, Arial, sans-serif`,
                  fontSize: `${fontSize}px`,
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
                    fontSize: `${fontSize + 1}px`,
                    fontWeight: "bold",
                    textAlign: textAlign as any,
                    width: "100%",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {shopNameDisplay}
                  </div>
                  {/* Barcode SVG — rendered via callback ref */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: barcodeJustify,
                    width: "100%",
                    flex: "1",
                  }}>
                    <svg
                      ref={barcodeSvgRef}
                      xmlns="http://www.w3.org/2000/svg"
                      style={{ maxWidth: "100%", height: "auto" }}
                    />
                  </div>
                  {/* Product Name */}
                  <div style={{
                    fontSize: `${fontSize}px`,
                    fontWeight: isBold as any,
                    textAlign: textAlign as any,
                    width: "100%",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    {safeProductName}
                  </div>
                </div>
              </div>

              {/* v2.10.143: Stickers Per Row selector — RIGHT IN THE DIALOG.
                  User can see the current setting and change it for this
                  print without going back to Settings → Barcode & Sticker.
                  User: "سٹکر کی سیٹنگ تو چینج ہو رہی ہے لیکن ... سنگل سٹکر
                  ہی نکلتا ہے" */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Stickers Per Row — فی لائن سٹیکر
                  <span className="ml-1 text-[9px] text-muted-foreground">
                    (saved: {Number((settings as any).stickersPerRow) || 1})
                  </span>
                </Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { val: 1, label: "Single", urdu: "ایک" },
                    { val: 2, label: "Double", urdu: "دو" },
                    { val: 3, label: "Triple", urdu: "تین" },
                    { val: 4, label: "Quad", urdu: "چار" },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => {
                        setLocalStickersPerRow(opt.val);
                        setUserOverrodeStickersPerRow(true);
                      }}
                      className={`px-2 py-1.5 rounded text-xs font-medium border-2 transition-colors ${
                        localStickersPerRow === opt.val
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-muted hover:border-blue-300"
                      }`}
                    >
                      <div>{opt.label}</div>
                      <div className="text-[9px] opacity-70">{opt.urdu}</div>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {localStickersPerRow === 1
                    ? "One sticker per line"
                    : `${localStickersPerRow} stickers per line — page width = ${widthMm * localStickersPerRow}mm`}
                </p>
              </div>

              {/* Product info + quantity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Product</Label>
                  <div className="text-sm font-medium truncate">{safeProductName}</div>
                </div>
                <div>
                  <Label className="text-xs font-medium">Price</Label>
                  <div className="text-sm font-bold text-emerald-700">Rs {safeSalePrice.toLocaleString()}</div>
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
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={printing}>
            <X className="w-4 h-4 mr-1" /> Close
          </Button>
          <Button variant="outline" onClick={handlePrintClicked} className="flex-1" disabled={printing || settingsLoading}>
            <FileDown className="w-4 h-4 mr-1" /> {printing ? "Preparing…" : "PDF"}
          </Button>
          <Button onClick={handlePrintClicked} className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={printing || settingsLoading}>
            <Printer className="w-4 h-4 mr-1" /> {printing ? "Preparing…" : "Print"}
          </Button>
        </DialogFooter>
    </>
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
