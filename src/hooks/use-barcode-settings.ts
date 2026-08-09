"use client";

import * as React from "react";
import { BarcodeSettings, DEFAULT_BARCODE_SETTINGS } from "@/lib/barcode-settings";

/**
 * useBarcodeSettings — loads barcode settings from /api/settings/barcode
 * Falls back to defaults if API fails.
 * Used by the StickerPrinter component to apply saved settings.
 */
export function useBarcodeSettings() {
  const [settings, setSettings] = React.useState<BarcodeSettings>(DEFAULT_BARCODE_SETTINGS);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/settings/barcode", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          const s = data.settings;
          setSettings({
            ...DEFAULT_BARCODE_SETTINGS,
            defaultBarcodeType: s.defaultBarcodeType || "CODE128",
            autoGenerate: s.autoGenerate !== false,
            autoVerify: s.autoVerify !== false,
            autoRegenerate: s.autoRegenerate !== false,
            humanReadable: s.humanReadable !== false,
            saveBarcodeImage: s.saveBarcodeImage !== false,
            saveBarcodeSvg: s.saveBarcodeSvg !== false,
            stickerSize: s.stickerSize || "50x30",
            customWidth: s.customWidth || 50,
            customHeight: s.customHeight || 30,
            labelGap: s.labelGap || 2,
            margin: s.margin || 1.5,
            printerType: s.printerType || "thermal203",
            darkness: s.darkness || 50,
            printSpeed: s.printSpeed || 50,
            autoCut: s.autoCut === true,
            feedAfterPrint: s.feedAfterPrint !== false,
            stickerFields: Array.isArray(s.stickerFieldsArray) ? s.stickerFieldsArray : DEFAULT_BARCODE_SETTINGS.stickerFields,
            fontFamily: s.fontFamily || "Tahoma",
            fontSize: s.fontSize || 8,
            fontBold: s.fontBold !== false,
            textAlign: s.textAlign || "center",
            lineSpacing: s.lineSpacing || 1.1,
            textColor: s.textColor || "#000000",
            barcodeWidth: s.barcodeWidth || 2,
            barcodeHeight: s.barcodeHeight || 40,
            quietZone: s.quietZone || 4,
            barcodeTopMargin: s.barcodeTopMargin || 0,
            barcodeBottomMargin: s.barcodeBottomMargin || 0,
            centerBarcode: s.centerBarcode !== false,
            highResSvg: s.highResSvg !== false,
            posScanBehavior: s.posScanBehavior === "DIRECT_ADD" ? "DIRECT_ADD" : "ASK_QUANTITY",
          });
        }
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return { settings, loading, reload: load, setSettings };
}
