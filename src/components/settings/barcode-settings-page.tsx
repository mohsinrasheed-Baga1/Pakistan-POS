"use client";

/**
 * Barcode & Sticker Settings Page
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise-grade settings page for all barcode/sticker/printer configuration.
 * Settings are saved to DB and used by every sticker print.
 *
 * Sections:
 * 1. General Settings (barcode type, auto-generate, verify, etc.)
 * 2. Sticker Settings (size, gap, margins)
 * 3. Printer Settings (type, darkness, speed, auto-cut, feed)
 * 4. Sticker Design (which fields + drag & drop ordering)
 * 5. Text Settings (font, size, bold, alignment, spacing, color)
 * 6. Barcode Settings (width, height, quiet zone, margins, center, high-res)
 * 7. Live Preview (real-time sticker preview)
 * 8. Professional Features (import, export, backup, restore, reset, test print, calibration)
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
import { useBarcodeGeneration } from "@/hooks/use-barcode-generation";

export function BarcodeSettingsPage() {
  const { settings, loading, reload } = useBarcodeSettings();
  const [saving, setSaving] = React.useState(false);
  const { generate: generateBarcode } = useBarcodeGeneration();

  // Local working copy — user edits this, then clicks Save to persist
  const [draft, setDraft] = React.useState<BarcodeSettings>(settings);
  React.useEffect(() => { if (!loading) setDraft(settings); }, [settings, loading]);

  // Live preview data — uses a sample product so user sees realistic output
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

  // Generate barcode for preview whenever barcode settings change
  React.useEffect(() => {
    let active = true;
    (async () => {
      const result = await generateBarcode({
        format: draft.defaultBarcodeType as any,
        value: previewProduct.productCode,
        scale: draft.barcodeWidth,
        height: draft.barcodeHeight,
        includeText: draft.humanReadable,
        verify: draft.autoVerify,
      });
      if (active && result) {
        setPreviewProduct(prev => ({ ...prev, barcodeSvg: result.svg }));
      }
    })();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.defaultBarcodeType, draft.barcodeWidth, draft.barcodeHeight, draft.humanReadable, draft.autoVerify, previewProduct.productCode]);

  // Update a single field in draft
  const update = <K extends keyof BarcodeSettings>(key: K, value: BarcodeSettings[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  // Save settings to DB
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

  // Reset to defaults
  async function handleReset() {
    if (!confirm("Reset all barcode settings to defaults?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/barcode", { method: "DELETE" });
      if (res.ok) { toast.success("Settings reset to defaults"); reload(); }
    } catch { toast.error("Failed to reset"); }
    finally { setSaving(false); }
  }

  // Export settings to JSON file
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

  // Import settings from JSON file
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

  // Test print — prints a single sticker with current settings
  function handleTestPrint() {
    const stickerHtml = buildStickerHtml(previewProduct, draft);
    const printHtml = buildPrintHtml([stickerHtml], draft, "Test Print");
    const win = window.open("", "_blank", "width=600,height=600");
    if (!win) { toast.error("Pop-up blocked"); return; }
    win.document.write(printHtml);
    win.document.close();
    win.focus();
  }

  // Print calibration — prints a grid of stickers to check alignment
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
  const previewScale = 240 / widthMm; // Scale preview to ~240px wide

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 className="w-6 h-6 text-emerald-600" />
            Barcode & Sticker Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure once — every product uses these settings automatically
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload className="w-4 h-4 mr-1" /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 mr-1" /> Reset
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" /> {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Settings (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">

          {/* SECTION 1: General */}
          <Card>
            <CardHeader><CardTitle className="text-base">1. General Settings</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs font-medium mb-2 block">Default Barcode Type</Label>
                <div className="flex gap-2">
                  {(["CODE128", "QR", "EAN13"] as const).map(t => (
                    <button key={t} onClick={() => update("defaultBarcodeType", t)}
                      className={`px-3 py-2 rounded-md text-xs font-medium border-2 ${draft.defaultBarcodeType === t ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-muted hover:border-emerald-300"}`}>
                      {t === "CODE128" ? "Code 128 (Default)" : t === "QR" ? "QR Code" : "EAN-13"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ToggleRow label="Auto Generate Barcode" checked={draft.autoGenerate} onChange={v => update("autoGenerate", v)} />
                <ToggleRow label="Auto Verify (ZXing)" checked={draft.autoVerify} onChange={v => update("autoVerify", v)} />
                <ToggleRow label="Auto Regenerate Invalid" checked={draft.autoRegenerate} onChange={v => update("autoRegenerate", v)} />
                <ToggleRow label="Human Readable Number" checked={draft.humanReadable} onChange={v => update("humanReadable", v)} />
                <ToggleRow label="Save Barcode Image (PNG)" checked={draft.saveBarcodeImage} onChange={v => update("saveBarcodeImage", v)} />
                <ToggleRow label="Save Barcode SVG" checked={draft.saveBarcodeSvg} onChange={v => update("saveBarcodeSvg", v)} />
              </div>
            </CardContent>
          </Card>

          {/* SECTION 2: Sticker */}
          <Card>
            <CardHeader><CardTitle className="text-base">2. Sticker Settings</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs font-medium mb-2 block">Default Sticker Size</Label>
                <div className="flex gap-2 flex-wrap">
                  {STICKER_SIZES.map(s => (
                    <button key={s.key} onClick={() => update("stickerSize", s.key as any)}
                      className={`px-3 py-2 rounded-md text-xs font-medium border-2 ${draft.stickerSize === s.key ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-muted hover:border-emerald-300"}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              {draft.stickerSize === "custom" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Custom Width (mm)</Label>
                    <Input type="number" value={draft.customWidth} onChange={e => update("customWidth", Number(e.target.value))} min="20" max="100" />
                  </div>
                  <div>
                    <Label className="text-xs">Custom Height (mm)</Label>
                    <Input type="number" value={draft.customHeight} onChange={e => update("customHeight", Number(e.target.value))} min="15" max="80" />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Gap Between Labels (mm)</Label>
                  <Input type="number" step="0.5" value={draft.labelGap} onChange={e => update("labelGap", Number(e.target.value))} min="0" max="10" />
                </div>
                <div>
                  <Label className="text-xs">Margins (mm)</Label>
                  <Input type="number" step="0.5" value={draft.margin} onChange={e => update("margin", Number(e.target.value))} min="0" max="10" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SECTION 3: Printer */}
          <Card>
            <CardHeader><CardTitle className="text-base">3. Printer Settings</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs font-medium mb-2 block">Printer Type</Label>
                <div className="flex gap-2 flex-wrap">
                  {PRINTER_TYPES.map(p => (
                    <button key={p.key} onClick={() => update("printerType", p.key as any)}
                      className={`px-3 py-2 rounded-md text-xs font-medium border-2 ${draft.printerType === p.key ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-muted hover:border-emerald-300"}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Darkness: {draft.darkness}%</Label>
                  <input type="range" min="0" max="100" value={draft.darkness} onChange={e => update("darkness", Number(e.target.value))} className="w-full" />
                </div>
                <div>
                  <Label className="text-xs">Print Speed: {draft.printSpeed}%</Label>
                  <input type="range" min="0" max="100" value={draft.printSpeed} onChange={e => update("printSpeed", Number(e.target.value))} className="w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ToggleRow label="Auto Cut" checked={draft.autoCut} onChange={v => update("autoCut", v)} />
                <ToggleRow label="Feed After Print" checked={draft.feedAfterPrint} onChange={v => update("feedAfterPrint", v)} />
              </div>
            </CardContent>
          </Card>

          {/* SECTION 4: Sticker Design */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2">
              4. Sticker Design <span className="text-xs text-muted-foreground font-normal">(drag to reorder)</span>
            </CardTitle></CardHeader>
            <CardContent>
              <DragDropFieldList
                fields={draft.stickerFields}
                onChange={(fields) => update("stickerFields", fields)}
              />
            </CardContent>
          </Card>

          {/* SECTION 5: Text */}
          <Card>
            <CardHeader><CardTitle className="text-base">5. Text Settings</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Font Family</Label>
                  <select className="w-full rounded-md border px-3 py-2 text-sm" value={draft.fontFamily} onChange={e => update("fontFamily", e.target.value)}>
                    {FONT_FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Font Size (px)</Label>
                  <Input type="number" value={draft.fontSize} onChange={e => update("fontSize", Number(e.target.value))} min="5" max="20" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ToggleRow label="Bold Text" checked={draft.fontBold} onChange={v => update("fontBold", v)} />
                <div>
                  <Label className="text-xs">Alignment</Label>
                  <div className="flex gap-1">
                    {(["left", "center", "right"] as const).map(a => (
                      <button key={a} onClick={() => update("textAlign", a)}
                        className={`px-3 py-2 rounded-md text-xs font-medium border-2 flex-1 ${draft.textAlign === a ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-muted"}`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Line Spacing</Label>
                  <Input type="number" step="0.1" value={draft.lineSpacing} onChange={e => update("lineSpacing", Number(e.target.value))} min="0.8" max="2" />
                </div>
                <div>
                  <Label className="text-xs">Text Color</Label>
                  <input type="color" value={draft.textColor} onChange={e => update("textColor", e.target.value)} className="w-full h-10 rounded-md border" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SECTION 6: Barcode */}
          <Card>
            <CardHeader><CardTitle className="text-base">6. Barcode Settings</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Barcode Width (module px)</Label>
                  <Input type="number" value={draft.barcodeWidth} onChange={e => update("barcodeWidth", Number(e.target.value))} min="1" max="5" />
                </div>
                <div>
                  <Label className="text-xs">Barcode Height (px)</Label>
                  <Input type="number" value={draft.barcodeHeight} onChange={e => update("barcodeHeight", Number(e.target.value))} min="20" max="100" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Quiet Zone (mm)</Label>
                  <Input type="number" value={draft.quietZone} onChange={e => update("quietZone", Number(e.target.value))} min="0" max="20" />
                </div>
                <div>
                  <Label className="text-xs">Top Margin (mm)</Label>
                  <Input type="number" value={draft.barcodeTopMargin} onChange={e => update("barcodeTopMargin", Number(e.target.value))} min="0" max="10" />
                </div>
                <div>
                  <Label className="text-xs">Bottom Margin (mm)</Label>
                  <Input type="number" value={draft.barcodeBottomMargin} onChange={e => update("barcodeBottomMargin", Number(e.target.value))} min="0" max="10" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ToggleRow label="Center Barcode" checked={draft.centerBarcode} onChange={v => update("centerBarcode", v)} />
                <ToggleRow label="High Resolution SVG" checked={draft.highResSvg} onChange={v => update("highResSvg", v)} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Live Preview + Actions (1/3 width, sticky) */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="w-4 h-4" /> Live Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  Sticker: {widthMm} × {heightMm} mm • Scale: {Math.round(previewScale * 100)}%
                </div>
                <div className="flex justify-center bg-muted/30 p-4 rounded-lg min-h-[200px] items-center">
                  <div
                    style={{
                      transform: `scale(${previewScale})`,
                      transformOrigin: "top center",
                      width: `${widthMm}mm`,
                      height: `${heightMm}mm`,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: buildStickerHtml(previewProduct, draft),
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Preview Product Name</Label>
                  <Input value={previewProduct.productName} onChange={e => setPreviewProduct(p => ({ ...p, productName: e.target.value }))} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Preview Price</Label>
                  <Input type="number" value={previewProduct.salePrice} onChange={e => setPreviewProduct(p => ({ ...p, salePrice: Number(e.target.value) }))} className="h-8 text-xs" />
                </div>
              </CardContent>
            </Card>

            {/* Professional Features */}
            <Card>
              <CardHeader><CardTitle className="text-base">Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" onClick={handleTestPrint}>
                  <Printer className="w-4 h-4 mr-2" /> Test Print
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={handleCalibration}>
                  <Wrench className="w-4 h-4 mr-2" /> Print Calibration
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={handleExport}>
                  <FileDown className="w-4 h-4 mr-2" /> Backup Settings
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={handleImport}>
                  <Upload className="w-4 h-4 mr-2" /> Restore Settings
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle Row helper
// ─────────────────────────────────────────────────────────────────────────────
function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span className="text-xs">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drag & Drop Field List
// ─────────────────────────────────────────────────────────────────────────────
function DragDropFieldList({ fields, onChange }: { fields: string[]; onChange: (fields: string[]) => void }) {
  // All available fields, with the ones in `fields` marked as enabled
  const allFields = ALL_STICKER_FIELDS.map(f => ({
    ...f,
    enabled: fields.includes(f.key),
  }));

  // Sort so enabled fields appear first, in the order specified by `fields`
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
    // Only allow reordering enabled fields
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
    <div className="space-y-1">
      {sorted.map((f, idx) => (
        <div
          key={f.key}
          draggable={f.enabled}
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDragEnd={handleDragEnd}
          className={`flex items-center gap-2 rounded-md border px-3 py-2 transition-all ${
            f.enabled ? "bg-emerald-50 border-emerald-200 cursor-move" : "bg-muted/30 opacity-60"
          } ${dragIndex === idx ? "ring-2 ring-emerald-400" : ""}`}
        >
          {f.enabled && <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
          <Switch checked={f.enabled} onCheckedChange={(v) => toggle(f.key, v)} />
          <span className="text-sm flex-1">{f.label}</span>
          {f.enabled && <span className="text-xs text-muted-foreground">#{fields.indexOf(f.key) + 1}</span>}
        </div>
      ))}
      <p className="text-xs text-muted-foreground mt-2">
        Toggle fields on/off. Drag the grip icon to reorder enabled fields.
      </p>
    </div>
  );
}
