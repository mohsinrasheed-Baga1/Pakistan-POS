"use client";

/**
 * Simple Product Print Dialog
 * ─────────────────────────────────────────────────────────────────────────────
 * Per spec section 8: When user clicks Barcode icon from Product List,
 * DO NOT show settings again. Only display:
 * - Product Name
 * - Barcode Preview
 * - Number of Copies
 * - Print
 * - Export PDF
 * - Close
 *
 * Everything else comes from saved settings (loaded via useBarcodeSettings).
 * No scrolling — compact layout that fits in a single view.
 */

import * as React from "react";
import { Printer, FileDown, X, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useBarcodeSettings } from "@/hooks/use-barcode-settings";
import { useBarcodeGeneration } from "@/hooks/use-barcode-generation";
import { buildStickerHtml, buildPrintHtml, StickerData } from "@/lib/sticker-builder";
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
  const { generate: generateBarcode, loading: generating, result } = useBarcodeGeneration();
  const [count, setCount] = React.useState(1);

  // Fetch shop settings if not provided
  const [fetchedShopName, setFetchedShopName] = React.useState(shopName || "My Shop");
  const [fetchedShopLogo, setFetchedShopLogo] = React.useState(shopLogo || null);
  React.useEffect(() => {
    if (shopName) { setFetchedShopName(shopName); setFetchedShopLogo(shopLogo || null); return; }
    fetch("/api/settings", { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        const s = d?.settings;
        setFetchedShopName(s?.shopName?.trim() || "My Shop");
        setFetchedShopLogo(s?.logo || null);
      })
      .catch(() => setFetchedShopName("My Shop"));
  }, [shopName, shopLogo]);

  // Auto-generate barcode when product changes
  React.useEffect(() => {
    if (!product) return;
    // Use pre-rendered SVG from DB if available
    if (product.barcodeSvg) return;
    // Otherwise generate on-demand
    generateBarcode({
      format: (product.barcodeType as any) || settings.defaultBarcodeType,
      value: product.productCode || product.barcode,
      scale: settings.barcodeWidth,
      height: settings.barcodeHeight,
      includeText: settings.humanReadable,
      verify: settings.autoVerify,
    }).catch(() => toast.error("Failed to generate barcode"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  if (!product) return null;

  // Determine which SVG to use (DB-cached or freshly generated)
  const barcodeSvg = product.barcodeSvg || result?.svg || "";
  const verified = product.barcodeVerified || result?.verified || false;

  // Build sticker data
  const stickerData: StickerData = {
    shopName: fetchedShopName,
    shopLogo: fetchedShopLogo,
    productName: product.name,
    productCode: product.productCode || product.barcode,
    barcodeSvg,
    salePrice: product.salePrice,
    purchasePrice: product.costPrice,
    weight: product.unit !== "piece" ? `${product.stock} ${product.unit}` : undefined,
    unit: product.unit,
    packingDate: product.packingDate ? new Date(product.packingDate).toLocaleDateString("en-PK") : undefined,
    expiryDate: product.expiryDate ? new Date(product.expiryDate).toLocaleDateString("en-PK") : undefined,
    manufacturingDate: product.manufacturingDate ? new Date(product.manufacturingDate).toLocaleDateString("en-PK") : undefined,
    currency: "Rs",
  };

  const { widthMm, heightMm } = getStickerDimensions(settings);
  const previewScale = 200 / widthMm;

  // Print button
  function handlePrint() {
    if (!barcodeSvg) { toast.error("Barcode not generated yet"); return; }
    if (!verified && settings.autoVerify) {
      toast.warning("Barcode is not verified — printing anyway");
    }
    const stickerHtml = buildStickerHtml(stickerData, settings);
    const stickers = Array.from({ length: count }, () => stickerHtml);
    const printHtml = buildPrintHtml(stickers, settings, product!.name);
    const win = window.open("", "_blank", "width=600,height=600");
    if (!win) { toast.error("Pop-up blocked"); return; }
    win.document.write(printHtml);
    win.document.close();
    win.focus();
  }

  // Export PDF — opens print dialog with PDF option
  function handleExportPdf() {
    if (!barcodeSvg) { toast.error("Barcode not generated yet"); return; }
    const stickerHtml = buildStickerHtml(stickerData, settings);
    const stickers = Array.from({ length: count }, () => stickerHtml);
    const printHtml = buildPrintHtml(stickers, { ...settings, printerType: "a4" }, product!.name);
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) { toast.error("Pop-up blocked"); return; }
    win.document.write(printHtml);
    win.document.close();
    win.focus();
    toast.info("Use 'Save as PDF' in the print dialog to export");
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

        {/* No-scroll layout: preview on left, controls on right */}
        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0 overflow-hidden">

          {/* Left: Sticker Preview */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium">Preview</Label>
            <div className="flex-1 flex items-center justify-center bg-muted/30 rounded-lg p-2 min-h-[180px]">
              {settingsLoading || generating ? (
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                  <span className="text-xs text-muted-foreground">Generating...</span>
                </div>
              ) : (
                <div
                  style={{
                    transform: `scale(${previewScale})`,
                    transformOrigin: "center",
                    width: `${widthMm}mm`,
                    height: `${heightMm}mm`,
                  }}
                  dangerouslySetInnerHTML={{ __html: buildStickerHtml(stickerData, settings) }}
                />
              )}
            </div>
            {/* Verification badge */}
            <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md ${
              verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}>
              {verified ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
              <span>{verified ? "Verified" : "Unverified"}</span>
              <span className="text-muted-foreground ml-auto">{widthMm}×{heightMm}mm</span>
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex flex-col gap-3">
            <div>
              <Label className="text-xs font-medium">Product</Label>
              <div className="text-sm font-medium truncate" title={product.name}>{product.name}</div>
            </div>
            <div>
              <Label className="text-xs font-medium">Code</Label>
              <div className="text-xs font-mono text-muted-foreground">{stickerData.productCode}</div>
            </div>
            <div>
              <Label className="text-xs font-medium">Price</Label>
              <div className="text-sm font-bold text-emerald-700">Rs {product.salePrice.toLocaleString()}</div>
            </div>
            <div>
              <Label className="text-xs font-medium">Copies</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={count}
                onChange={(e) => setCount(Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
                className="h-9"
              />
            </div>
          </div>
        </div>

        {/* Footer: action buttons */}
        <DialogFooter className="flex-shrink-0 gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            <X className="w-4 h-4 mr-1" /> Close
          </Button>
          <Button variant="outline" onClick={handleExportPdf} className="flex-1" disabled={!barcodeSvg}>
            <FileDown className="w-4 h-4 mr-1" /> PDF
          </Button>
          <Button onClick={handlePrint} className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={!barcodeSvg}>
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
