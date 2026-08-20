"use client";

/**
 * Receipt Settings Page
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise-grade settings page for receipt configuration.
 * Similar to Barcode & Sticker Settings page.
 *
 * Sections:
 * 1. Receipt Size (58mm, 80mm, A4, custom)
 * 2. Layout (left/center/right + field toggles)
 * 3. Font (family, size, bold, header size)
 * 4. Colors (text, header)
 * 5. Margins & Spacing
 * 6. Content (footer text, item details, subtotal, tax, discount, change)
 * 7. Live Preview
 */

import * as React from "react";
import {
  Save, Download, Upload, RotateCcw, Eye, RefreshCw, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useReceiptSettings } from "@/hooks/use-receipt-settings";
import {
  ReceiptSettings, RECEIPT_SIZES, RECEIPT_FONTS, getReceiptWidth,
} from "@/lib/receipt-settings";

export function ReceiptSettingsPage() {
  const { settings, loading, reload } = useReceiptSettings();
  const [saving, setSaving] = React.useState(false);
  const [draft, setDraft] = React.useState<ReceiptSettings>(settings);
  React.useEffect(() => { if (!loading) setDraft(settings); }, [settings, loading]);

  const update = <K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/receipt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to save"); return; }
      toast.success("Receipt settings saved");
      reload();
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  }

  async function handleReset() {
    if (!confirm("Reset all receipt settings to defaults?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/receipt", { method: "DELETE" });
      if (res.ok) { toast.success("Settings reset to defaults"); reload(); }
    } catch { toast.error("Failed to reset"); }
    finally { setSaving(false); }
  }

  function handleExport() {
    const json = JSON.stringify(draft, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-settings-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Settings exported");
  }

  function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        setDraft(prev => ({ ...prev, ...imported }));
        toast.success("Settings imported — click Save to apply");
      } catch { toast.error("Invalid settings file"); }
    };
    input.click();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mr-2" />
        <span className="text-sm">Loading receipt settings...</span>
      </div>
    );
  }

  const previewWidth = getReceiptWidth(draft);
  // Calculate preview width in PIXELS (1mm ≈ 3.78px at 96dpi)
  // Cap at 220px so it fits in the sidebar
  const maxPreviewPx = 220;
  const naturalWidthPx = previewWidth * 3.78;
  const scale = Math.min(maxPreviewPx / naturalWidthPx, 1);
  const previewWidthPx = naturalWidthPx * scale;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Printer className="w-5 h-5 text-emerald-600" />
            Receipt Settings
          </h1>
          <p className="text-xs text-muted-foreground">Configure receipt appearance — saved settings apply to all receipts</p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={handleImport} className="h-8"><Upload className="w-3.5 h-3.5 mr-1" /> Import</Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="h-8"><Download className="w-3.5 h-3.5 mr-1" /> Export</Button>
          <Button variant="outline" size="sm" onClick={handleReset} className="h-8"><RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset</Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={handleSave} disabled={saving}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* v2.10.13: Hint to select default printer for silent printing */}
      <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm p-3 rounded-md flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Printer className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>Silent Printing:</strong> To print receipts without the
            printer dialog each time, select a default receipt printer in{" "}
            <strong>Settings → Printer</strong>.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
        {/* LEFT: Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* SECTION 1: Size */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">1. Receipt Size</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="flex flex-wrap gap-1.5">
                {RECEIPT_SIZES.map(s => (
                  <button key={s.key} onClick={() => update("receiptSize", s.key as any)}
                    className={`px-2 py-1.5 rounded text-xs font-medium border ${draft.receiptSize === s.key ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-muted hover:border-emerald-300"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              {draft.receiptSize === "custom" && (
                <div className="grid grid-cols-2 gap-1.5">
                  <div><Label className="text-[10px]">Width (mm)</Label>
                    <Input type="number" value={draft.customWidth} onChange={e => update("customWidth", Number(e.target.value))} className="h-8 text-xs" min="30" max="210" /></div>
                  <div><Label className="text-[10px]">Height (mm, 0=auto)</Label>
                    <Input type="number" value={draft.customHeight} onChange={e => update("customHeight", Number(e.target.value))} className="h-8 text-xs" min="0" max="300" /></div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SECTION 2: Layout */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">2. Layout & Fields</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div>
                <Label className="text-[10px]">Alignment</Label>
                <div className="flex gap-1">
                  {(["left", "center", "right"] as const).map(a => (
                    <button key={a} onClick={() => update("layout", a)}
                      className={`px-2 py-1 rounded text-xs border flex-1 ${draft.layout === a ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-muted"}`}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <ToggleRow label="Logo" checked={draft.showLogo} onChange={v => update("showLogo", v)} />
                <ToggleRow label="Shop Name" checked={draft.showShopName} onChange={v => update("showShopName", v)} />
                <ToggleRow label="Sub Name" checked={draft.showSubName} onChange={v => update("showSubName", v)} />
                <ToggleRow label="Address" checked={draft.showShopAddress} onChange={v => update("showShopAddress", v)} />
                <ToggleRow label="Phone" checked={draft.showShopPhone} onChange={v => update("showShopPhone", v)} />
                <ToggleRow label="Invoice No" checked={draft.showInvoiceNo} onChange={v => update("showInvoiceNo", v)} />
                <ToggleRow label="Date/Time" checked={draft.showDateTime} onChange={v => update("showDateTime", v)} />
                <ToggleRow label="Customer Name" checked={draft.showCustomerName} onChange={v => update("showCustomerName", v)} />
                <ToggleRow label="Customer Phone" checked={draft.showCustomerPhone} onChange={v => update("showCustomerPhone", v)} />
                <ToggleRow label="Sale Type" checked={draft.showSaleType} onChange={v => update("showSaleType", v)} />
                <ToggleRow label="Payment Method" checked={draft.showPaymentMethod} onChange={v => update("showPaymentMethod", v)} />
                <ToggleRow label="Card Details" checked={draft.showCardDetails} onChange={v => update("showCardDetails", v)} />
                <ToggleRow label="Barcode" checked={draft.showBarcode} onChange={v => update("showBarcode", v)} />
                <ToggleRow label="Footer" checked={draft.showFooter} onChange={v => update("showFooter", v)} />
              </div>
            </CardContent>
          </Card>

          {/* SECTION 3: Font */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">3. Font Settings</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="grid grid-cols-2 gap-1.5">
                <div><Label className="text-[10px]">Font Family</Label>
                  <select className="w-full rounded border px-2 py-1.5 text-xs h-8" value={draft.fontFamily} onChange={e => update("fontFamily", e.target.value)}>
                    {RECEIPT_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select></div>
                <div><Label className="text-[10px]">Font Size (px)</Label>
                  <Input type="number" value={draft.fontSize} onChange={e => update("fontSize", Number(e.target.value))} className="h-8 text-xs" min="6" max="16" /></div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div><Label className="text-[10px]">Header Size (px)</Label>
                  <Input type="number" value={draft.headerFontSize} onChange={e => update("headerFontSize", Number(e.target.value))} className="h-8 text-xs" min="10" max="20" /></div>
                <div><Label className="text-[10px]">Title Size (px)</Label>
                  <Input type="number" value={draft.titleFontSize} onChange={e => update("titleFontSize", Number(e.target.value))} className="h-8 text-xs" min="8" max="16" /></div>
              </div>
              <ToggleRow label="Bold Text" checked={draft.fontBold} onChange={v => update("fontBold", v)} />
            </CardContent>
          </Card>

          {/* SECTION 4: Colors */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">4. Colors</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="grid grid-cols-2 gap-1.5">
                <div><Label className="text-[10px]">Text Color</Label>
                  <input type="color" value={draft.textColor} onChange={e => update("textColor", e.target.value)} className="w-full h-8 rounded border" /></div>
                <div><Label className="text-[10px]">Header Color</Label>
                  <input type="color" value={draft.headerColor} onChange={e => update("headerColor", e.target.value)} className="w-full h-8 rounded border" /></div>
              </div>
            </CardContent>
          </Card>

          {/* SECTION 5: Margins */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">5. Margins & Spacing</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="grid grid-cols-2 gap-1.5">
                <div><Label className="text-[10px]">Top (mm)</Label>
                  <Input type="number" step="0.5" value={draft.marginTop} onChange={e => update("marginTop", Number(e.target.value))} className="h-8 text-xs" min="0" max="20" /></div>
                <div><Label className="text-[10px]">Bottom (mm)</Label>
                  <Input type="number" step="0.5" value={draft.marginBottom} onChange={e => update("marginBottom", Number(e.target.value))} className="h-8 text-xs" min="0" max="20" /></div>
                <div><Label className="text-[10px]">Left (mm)</Label>
                  <Input type="number" step="0.5" value={draft.marginLeft} onChange={e => update("marginLeft", Number(e.target.value))} className="h-8 text-xs" min="0" max="20" /></div>
                <div><Label className="text-[10px]">Right (mm)</Label>
                  <Input type="number" step="0.5" value={draft.marginRight} onChange={e => update("marginRight", Number(e.target.value))} className="h-8 text-xs" min="0" max="20" /></div>
              </div>
              <div><Label className="text-[10px]">Line Spacing: {draft.lineSpacing}</Label>
                <input type="range" min="0.8" max="2" step="0.1" value={draft.lineSpacing} onChange={e => update("lineSpacing", Number(e.target.value))} className="w-full" /></div>
            </CardContent>
          </Card>

          {/* SECTION 6: Content */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">6. Content Options</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                <ToggleRow label="Item Details (price × qty)" checked={draft.showItemDetails} onChange={v => update("showItemDetails", v)} />
                <ToggleRow label="Subtotal" checked={draft.showSubtotal} onChange={v => update("showSubtotal", v)} />
                <ToggleRow label="Tax" checked={draft.showTax} onChange={v => update("showTax", v)} />
                <ToggleRow label="Discount" checked={draft.showDiscount} onChange={v => update("showDiscount", v)} />
                <ToggleRow label="Change" checked={draft.showChange} onChange={v => update("showChange", v)} />
              </div>
              <div><Label className="text-[10px]">Custom Footer Text</Label>
                <Input value={draft.receiptFooter || ""} onChange={e => update("receiptFooter", e.target.value)} placeholder="Thank you! Please come again." className="h-8 text-xs" /></div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Live Preview */}
        <div className="space-y-3">
          <div className="sticky top-4 space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Live Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <div className="text-[10px] text-muted-foreground text-center">
                  {previewWidth}mm • Scale {Math.round(scale * 100)}%
                </div>
                <div className="flex justify-center bg-muted/30 rounded-lg p-3 overflow-hidden" style={{ minHeight: "200px", maxHeight: "400px" }}>
                  <div
                    style={{
                      width: `${previewWidthPx}px`,
                      fontFamily: draft.fontFamily,
                      fontSize: `${draft.fontSize * scale}px`,
                      fontWeight: draft.fontBold ? "bold" : "normal",
                      color: draft.textColor,
                      lineHeight: draft.lineSpacing,
                      textAlign: draft.layout as any,
                      padding: `${draft.marginTop * scale * 3.78}px ${draft.marginRight * scale * 3.78}px ${draft.marginBottom * scale * 3.78}px ${draft.marginLeft * scale * 3.78}px`,
                      background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                      overflow: "hidden",
                    }}
                  >
                    {draft.showShopName && (
                      <div style={{ fontSize: `${draft.headerFontSize * scale}px`, fontWeight: "bold", color: draft.headerColor, marginBottom: "2px" }}>
                        My Shop
                      </div>
                    )}
                    {draft.showSubName && <div style={{ fontSize: `${draft.titleFontSize * scale}px` }}>Sub Name</div>}
                    {draft.showShopAddress && <div style={{ fontSize: `${8 * scale}px` }}>Main Bazaar, City</div>}
                    {draft.showShopPhone && <div style={{ fontSize: `${8 * scale}px` }}>Ph: 03001234567</div>}
                    <div style={{ borderTop: "1px solid #000", margin: "4px 0" }} />
                    {draft.showInvoiceNo && <div style={{ display: "flex", justifyContent: "space-between", fontSize: `${8 * scale}px` }}><span>Inv:</span><span>INV-001</span></div>}
                    {draft.showDateTime && <div style={{ display: "flex", justifyContent: "space-between", fontSize: `${8 * scale}px` }}><span>Date:</span><span>2026-08-08</span></div>}
                    {draft.showSaleType && <div style={{ display: "flex", justifyContent: "space-between", fontSize: `${8 * scale}px` }}><span>Type:</span><span>Regular</span></div>}
                    {draft.showCustomerName && <div style={{ display: "flex", justifyContent: "space-between", fontSize: `${8 * scale}px` }}><span>Customer:</span><span>Ahmed</span></div>}
                    <div style={{ borderTop: "1px solid #000", margin: "4px 0" }} />
                    <div style={{ fontSize: `${8 * scale}px` }}>Sugar 1kg × 2 = Rs 500</div>
                    <div style={{ fontSize: `${8 * scale}px` }}>Rice 5kg × 1 = Rs 1200</div>
                    <div style={{ borderTop: "1px solid #000", margin: "4px 0" }} />
                    {draft.showSubtotal && <div style={{ display: "flex", justifyContent: "space-between", fontSize: `${8 * scale}px` }}><span>Subtotal:</span><span>Rs 1700</span></div>}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: `${draft.titleFontSize * scale}px`, fontWeight: "bold" }}><span>TOTAL:</span><span>Rs 1700</span></div>
                    {draft.showPaymentMethod && <div style={{ display: "flex", justifyContent: "space-between", fontSize: `${8 * scale}px` }}><span>Payment:</span><span>Cash</span></div>}
                    {draft.showChange && <div style={{ display: "flex", justifyContent: "space-between", fontSize: `${8 * scale}px` }}><span>Change:</span><span>Rs 300</span></div>}
                    {draft.showFooter && (
                      <div style={{ textAlign: "center", fontSize: `${8 * scale}px`, marginTop: "4px" }}>
                        {draft.receiptFooter || "Thank you! Please come again."}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded border px-2 py-1.5 h-8">
      <span className="text-[10px]">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
