"use client";

/**
 * Barcode & Sticker Settings Page (v2 — Compact Professional Layout)
 * ─────────────────────────────────────────────────────────────────────────────
 * Layout: 3-column grid on desktop
 *   Left (60%): All 6 settings sections in a scrollable area
 *   Right (40%): Compact sticky sidebar with live preview + actions
 *
 * The live preview is small but always visible. Settings are the focus.
 */

import * as React from "react";
import {
  Save, Download, Upload, RotateCcw, Printer, Settings2,
  GripVertical, Eye, RefreshCw, FileDown, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useBarcodeSettings } from "@/hooks/use-barcode-settings";
import {
  BarcodeSettings, ALL_STICKER_FIELDS, STICKER_SIZES, PRINTER_TYPES, FONT_FAMILIES,
  getStickerDimensions,
} from "@/lib/barcode-settings";
import { buildStickerHtml, buildPrintHtml, StickerData } from "@/lib/sticker-builder";

export function BarcodeSettingsPage() {
  const { settings, loading, reload } = useBarcodeSettings();
  const [saving, setSaving] = React.useState(false);
  const previewBarcodeRef = React.useRef<SVGSVGElement>(null);

  const [draft, setDraft] = React.useState<BarcodeSettings>(settings);
  React.useEffect(() => { if (!loading) setDraft(settings); }, [settings, loading]);

  const [previewProduct, setPreviewProduct] = React.useState<StickerData>({
    shopName: "My Shop",
    productName: "Basmati Rice 1kg",
    productCode: "RICE00120",
    barcodeSvg: "",
    salePrice: 250,
    purchasePrice: 220,
    weight: "1 kg",
    unit: "kg",
    packingDate: "2026-08-01",
    expiryDate: "2027-08-01",
    batchNumber: "B-2026-001",
    manufacturingDate: "2026-08-01",
    currency: "Rs",
  });

  // Render barcode using JsBarcode (client-side — proven working)
  React.useEffect(() => {
    if (!previewBarcodeRef.current) return;
    const value = previewProduct.productCode;
    if (!value) return;

    const format = draft.defaultBarcodeType === "EAN13" && /^\d{13}$/.test(value) ? "EAN13" : "CODE128";

    const renderBarcode = () => {
      if (!(window as any).JsBarcode || !previewBarcodeRef.current) return;
      try {
        (window as any).JsBarcode(previewBarcodeRef.current, value, {
          format,
          width: draft.barcodeWidth || 2,
          height: draft.barcodeHeight || 40,
          displayValue: draft.humanReadable,
          fontSize: 12,
          font: "monospace",
          fontOptions: "bold",
          margin: draft.quietZone || 4,
          textMargin: 2,
          background: "#ffffff",
          lineColor: "#000000",
        });
        // Get the SVG outer HTML and store it in previewProduct for sticker builder
        const svgHtml = previewBarcodeRef.current.outerHTML;
        setPreviewProduct(prev => ({ ...prev, barcodeSvg: svgHtml }));
      } catch (e) {
        console.error("JsBarcode error:", e);
      }
    };

    if ((window as any).JsBarcode) {
      renderBarcode();
    } else {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js";
      script.onload = renderBarcode;
      document.head.appendChild(script);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.defaultBarcodeType, draft.barcodeWidth, draft.barcodeHeight, draft.humanReadable, draft.quietZone, previewProduct.productCode]);

  const update = <K extends keyof BarcodeSettings>(key: K, value: BarcodeSettings[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/barcode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to save"); return; }
      toast.success("Barcode settings saved");
      reload();
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  }

  async function handleReset() {
    if (!confirm("Reset all barcode settings to defaults?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/barcode", { method: "DELETE" });
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
    a.download = `barcode-settings-${new Date().toISOString().split("T")[0]}.json`;
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

  function handleTestPrint() {
    const stickerHtml = buildStickerHtml(previewProduct, draft);
    const printHtml = buildPrintHtml([stickerHtml], draft, "Test Print");
    const win = window.open("", "_blank", "width=600,height=600");
    if (!win) { toast.error("Pop-up blocked"); return; }
    win.document.write(printHtml);
    win.document.close();
    win.focus();
  }

  function handleCalibration() {
    const stickerHtml = buildStickerHtml(previewProduct, draft);
    const stickers = Array.from({ length: 12 }, () => stickerHtml);
    const printHtml = buildPrintHtml(stickers, { ...draft, printerType: "a4" }, "Calibration Test");
    const win = window.open("", "_blank", "width=800,height=600");
    if (!win) { toast.error("Pop-up blocked"); return; }
    win.document.write(printHtml);
    win.document.close();
    win.focus();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mr-2" />
        <span className="text-sm">Loading barcode settings...</span>
      </div>
    );
  }

  const { widthMm, heightMm } = getStickerDimensions(draft);
  // Smaller preview scale — fits in sidebar without taking half the screen
  const previewScale = Math.min(150 / widthMm, 4);

  return (
    <div className="space-y-3">
      {/* Compact header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-emerald-600" />
            Barcode & Sticker Settings
          </h1>
          <p className="text-xs text-muted-foreground">Configure once — every product uses these settings</p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={handleImport} className="h-8">
            <Upload className="w-3.5 h-3.5 mr-1" /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="h-8">
            <Download className="w-3.5 h-3.5 mr-1" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} className="h-8">
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={handleSave} disabled={saving}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* 2-column layout: settings (wide) + preview sidebar (narrow) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">

        {/* LEFT: Settings sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          {/* SECTION 1: General */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">1. General</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="flex flex-wrap gap-1.5">
                {(["CODE128", "QR", "EAN13"] as const).map(t => (
                  <button key={t} onClick={() => update("defaultBarcodeType", t)}
                    className={`px-2.5 py-1.5 rounded text-xs font-medium border ${draft.defaultBarcodeType === t ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-muted hover:border-emerald-300"}`}>
                    {t === "CODE128" ? "Code 128" : t === "QR" ? "QR Code" : "EAN-13"}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                <ToggleRow label="Auto Generate" checked={draft.autoGenerate} onChange={v => update("autoGenerate", v)} />
                <ToggleRow label="Auto Verify" checked={draft.autoVerify} onChange={v => update("autoVerify", v)} />
                <ToggleRow label="Regenerate Invalid" checked={draft.autoRegenerate} onChange={v => update("autoRegenerate", v)} />
                <ToggleRow label="Human Readable" checked={draft.humanReadable} onChange={v => update("humanReadable", v)} />
                <ToggleRow label="Save PNG" checked={draft.saveBarcodeImage} onChange={v => update("saveBarcodeImage", v)} />
                <ToggleRow label="Save SVG" checked={draft.saveBarcodeSvg} onChange={v => update("saveBarcodeSvg", v)} />
              </div>
            </CardContent>
          </Card>

          {/* SECTION 2: Sticker */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">2. Sticker Size</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="flex flex-wrap gap-1.5">
                {STICKER_SIZES.map(s => (
                  <button key={s.key} onClick={() => update("stickerSize", s.key as any)}
                    className={`px-2 py-1.5 rounded text-xs font-medium border ${draft.stickerSize === s.key ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-muted hover:border-emerald-300"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              {draft.stickerSize === "custom" && (
                <div className="grid grid-cols-2 gap-1.5">
                  <div><Label className="text-[10px]">Width (mm)</Label>
                    <Input type="number" value={draft.customWidth} onChange={e => update("customWidth", Number(e.target.value))} className="h-8 text-xs" min="20" max="100" /></div>
                  <div><Label className="text-[10px]">Height (mm)</Label>
                    <Input type="number" value={draft.customHeight} onChange={e => update("customHeight", Number(e.target.value))} className="h-8 text-xs" min="15" max="80" /></div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                <div><Label className="text-[10px]">Gap (mm)</Label>
                  <Input type="number" step="0.5" value={draft.labelGap} onChange={e => update("labelGap", Number(e.target.value))} className="h-8 text-xs" min="0" max="10" /></div>
                <div><Label className="text-[10px]">Margin (mm)</Label>
                  <Input type="number" step="0.5" value={draft.margin} onChange={e => update("margin", Number(e.target.value))} className="h-8 text-xs" min="0" max="10" /></div>
              </div>
            </CardContent>
          </Card>

          {/* SECTION 3: Printer */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">3. Printer</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="flex flex-wrap gap-1.5">
                {PRINTER_TYPES.map(p => (
                  <button key={p.key} onClick={() => update("printerType", p.key as any)}
                    className={`px-2 py-1.5 rounded text-xs font-medium border ${draft.printerType === p.key ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-muted hover:border-emerald-300"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div>
                <Label className="text-[10px]">Darkness: {draft.darkness}%</Label>
                <input type="range" min="0" max="100" value={draft.darkness} onChange={e => update("darkness", Number(e.target.value))} className="w-full h-4" />
              </div>
              <div>
                <Label className="text-[10px]">Speed: {draft.printSpeed}%</Label>
                <input type="range" min="0" max="100" value={draft.printSpeed} onChange={e => update("printSpeed", Number(e.target.value))} className="w-full h-4" />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <ToggleRow label="Auto Cut" checked={draft.autoCut} onChange={v => update("autoCut", v)} />
                <ToggleRow label="Feed After Print" checked={draft.feedAfterPrint} onChange={v => update("feedAfterPrint", v)} />
              </div>
            </CardContent>
          </Card>

          {/* SECTION 5: Text */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">5. Text</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="grid grid-cols-2 gap-1.5">
                <div><Label className="text-[10px]">Font Family</Label>
                  <select className="w-full rounded border px-2 py-1.5 text-xs h-8" value={draft.fontFamily} onChange={e => update("fontFamily", e.target.value)}>
                    {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select></div>
                <div><Label className="text-[10px]">Size (px)</Label>
                  <Input type="number" value={draft.fontSize} onChange={e => update("fontSize", Number(e.target.value))} className="h-8 text-xs" min="5" max="20" /></div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <ToggleRow label="Bold" checked={draft.fontBold} onChange={v => update("fontBold", v)} />
                <div>
                  <Label className="text-[10px]">Align</Label>
                  <div className="flex gap-1">
                    {(["left", "center", "right"] as const).map(a => (
                      <button key={a} onClick={() => update("textAlign", a)}
                        className={`px-2 py-1 rounded text-xs border flex-1 ${draft.textAlign === a ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-muted"}`}>
                        {a[0].toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div><Label className="text-[10px]">Line Spacing</Label>
                  <Input type="number" step="0.1" value={draft.lineSpacing} onChange={e => update("lineSpacing", Number(e.target.value))} className="h-8 text-xs" min="0.8" max="2" /></div>
                <div><Label className="text-[10px]">Color</Label>
                  <input type="color" value={draft.textColor} onChange={e => update("textColor", e.target.value)} className="w-full h-8 rounded border" /></div>
              </div>
            </CardContent>
          </Card>

          {/* SECTION 6: Barcode */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">6. Barcode</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="grid grid-cols-2 gap-1.5">
                <div><Label className="text-[10px]">Width (px)</Label>
                  <Input type="number" value={draft.barcodeWidth} onChange={e => update("barcodeWidth", Number(e.target.value))} className="h-8 text-xs" min="1" max="5" /></div>
                <div><Label className="text-[10px]">Height (px)</Label>
                  <Input type="number" value={draft.barcodeHeight} onChange={e => update("barcodeHeight", Number(e.target.value))} className="h-8 text-xs" min="20" max="100" /></div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div><Label className="text-[10px]">Quiet Zone</Label>
                  <Input type="number" value={draft.quietZone} onChange={e => update("quietZone", Number(e.target.value))} className="h-8 text-xs" min="0" max="20" /></div>
                <div><Label className="text-[10px]">Top (mm)</Label>
                  <Input type="number" value={draft.barcodeTopMargin} onChange={e => update("barcodeTopMargin", Number(e.target.value))} className="h-8 text-xs" min="0" max="10" /></div>
                <div><Label className="text-[10px]">Bottom (mm)</Label>
                  <Input type="number" value={draft.barcodeBottomMargin} onChange={e => update("barcodeBottomMargin", Number(e.target.value))} className="h-8 text-xs" min="0" max="10" /></div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <ToggleRow label="Center" checked={draft.centerBarcode} onChange={v => update("centerBarcode", v)} />
                <ToggleRow label="High Res SVG" checked={draft.highResSvg} onChange={v => update("highResSvg", v)} />
              </div>
            </CardContent>
          </Card>

          {/* SECTION 4: Sticker Design (full width) */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                4. Sticker Design
                <span className="text-[10px] text-muted-foreground font-normal">(toggle on/off, drag to reorder)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <DragDropFieldList
                fields={draft.stickerFields}
                onChange={(fields) => update("stickerFields", fields)}
              />
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Compact sticky sidebar — preview + actions */}
        <div className="space-y-3">
          <div className="sticky top-4 space-y-3">
            {/* Live Preview — compact */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Live Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <div className="text-[10px] text-muted-foreground text-center">
                  {widthMm} × {heightMm} mm
                </div>
                {/* Compact preview box — fixed height, sticker centered */}
                <div className="flex justify-center bg-muted/30 rounded-lg p-3" style={{ minHeight: "120px", maxHeight: "160px" }}>
                  <div
                    style={{
                      transform: `scale(${previewScale})`,
                      transformOrigin: "center center",
                      width: `${widthMm}mm`,
                      height: `${heightMm}mm`,
                      flexShrink: 0,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: buildStickerHtml(previewProduct, draft),
                    }}
                  />
                </div>
                {/* Editable preview data */}
                <div className="space-y-1">
                  <Input value={previewProduct.productName} onChange={e => setPreviewProduct(p => ({ ...p, productName: e.target.value }))} className="h-7 text-xs" placeholder="Product name" />
                  <Input type="number" value={previewProduct.salePrice} onChange={e => setPreviewProduct(p => ({ ...p, salePrice: Number(e.target.value) }))} className="h-7 text-xs" placeholder="Price" />
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Actions</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 pt-0">
                <Button variant="outline" size="sm" className="w-full justify-start h-8 text-xs" onClick={handleTestPrint}>
                  <Printer className="w-3.5 h-3.5 mr-1.5" /> Test Print
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start h-8 text-xs" onClick={handleCalibration}>
                  <Wrench className="w-3.5 h-3.5 mr-1.5" /> Calibration
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start h-8 text-xs" onClick={handleExport}>
                  <FileDown className="w-3.5 h-3.5 mr-1.5" /> Backup
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start h-8 text-xs" onClick={handleImport}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> Restore
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      {/* Hidden SVG for JsBarcode rendering — source for preview + print */}
      <svg ref={previewBarcodeRef} style={{ position: "absolute", left: "-9999px", width: "200px", height: "60px" }} />
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

function DragDropFieldList({ fields, onChange }: { fields: string[]; onChange: (fields: string[]) => void }) {
  const allFields = ALL_STICKER_FIELDS.map(f => ({
    ...f,
    enabled: fields.includes(f.key),
  }));

  const sorted = [
    ...fields.map(key => allFields.find(f => f.key === key)!).filter(Boolean),
    ...allFields.filter(f => !fields.includes(f.key)),
  ];

  const [dragIndex, setDragIndex] = React.useState<number | null>(null);

  function toggle(key: string, enabled: boolean) {
    if (enabled) {
      onChange([...fields, key]);
    } else {
      onChange(fields.filter(f => f !== key));
    }
  }

  function handleDragStart(idx: number) { setDragIndex(idx); }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) return;
    if (!sorted[idx].enabled || !sorted[dragIndex].enabled) return;
    const newFields = [...fields];
    const draggedKey = newFields[dragIndex];
    newFields.splice(dragIndex, 1);
    newFields.splice(idx, 0, draggedKey);
    onChange(newFields);
    setDragIndex(idx);
  }
  function handleDragEnd() { setDragIndex(null); }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
      {sorted.map((f, idx) => (
        <div
          key={f.key}
          draggable={f.enabled}
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDragEnd={handleDragEnd}
          className={`flex items-center gap-1 rounded border px-2 py-1.5 transition-all ${
            f.enabled ? "bg-emerald-50 border-emerald-200 cursor-move" : "bg-muted/30 opacity-60"
          } ${dragIndex === idx ? "ring-2 ring-emerald-400" : ""}`}
        >
          {f.enabled && <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
          <Switch checked={f.enabled} onCheckedChange={(v) => toggle(f.key, v)} className="scale-75" />
          <span className="text-xs flex-1 truncate">{f.label}</span>
          {f.enabled && <span className="text-[9px] text-muted-foreground">#{fields.indexOf(f.key) + 1}</span>}
        </div>
      ))}
    </div>
  );
}
