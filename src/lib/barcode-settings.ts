/**
 * Shared Barcode Settings types + defaults
 * Used by both the Settings page and the Sticker Printer
 */

export interface BarcodeSettings {
  // Section 1: General
  defaultBarcodeType: "CODE128" | "QR" | "EAN13";
  autoGenerate: boolean;
  autoVerify: boolean;
  autoRegenerate: boolean;
  humanReadable: boolean;
  saveBarcodeImage: boolean;
  saveBarcodeSvg: boolean;

  // Section 2: Sticker
  stickerSize: "40x30" | "50x25" | "50x30" | "60x40" | "custom";
  customWidth: number;
  customHeight: number;
  labelGap: number;
  margin: number;

  // Section 3: Printer
  printerType: "thermal203" | "thermal300" | "a4";
  darkness: number;
  printSpeed: number;
  autoCut: boolean;
  feedAfterPrint: boolean;

  // Section 4: Sticker Design — which fields to show + order
  stickerFields: string[]; // e.g. ["storeName", "barcode", "sellingPrice"]

  // Section 5: Text Settings
  fontFamily: string;
  fontSize: number;
  fontBold: boolean;
  textAlign: "left" | "center" | "right";
  lineSpacing: number;
  textColor: string;

  // Section 6: Barcode Settings
  barcodeWidth: number;
  barcodeHeight: number;
  quietZone: number;
  barcodeTopMargin: number;
  barcodeBottomMargin: number;
  centerBarcode: boolean;
  highResSvg: boolean;
}

export const ALL_STICKER_FIELDS = [
  { key: "storeLogo", label: "Store Logo", defaultOn: false },
  { key: "storeName", label: "Store Name", defaultOn: true },
  { key: "productName", label: "Product Name", defaultOn: true },
  { key: "productCode", label: "Product Code", defaultOn: true },
  { key: "barcode", label: "Barcode", defaultOn: true },
  { key: "barcodeNumber", label: "Barcode Number", defaultOn: true },
  { key: "sellingPrice", label: "Selling Price", defaultOn: true },
  { key: "purchasePrice", label: "Purchase Price", defaultOn: false },
  { key: "weight", label: "Weight", defaultOn: false },
  { key: "unit", label: "Unit", defaultOn: false },
  { key: "packingDate", label: "Packing Date", defaultOn: false },
  { key: "expiryDate", label: "Expiry Date", defaultOn: true },
  { key: "batchNumber", label: "Batch Number", defaultOn: false },
  { key: "manufacturingDate", label: "Manufacturing Date", defaultOn: false },
] as const;

export const DEFAULT_BARCODE_SETTINGS: BarcodeSettings = {
  defaultBarcodeType: "CODE128",
  autoGenerate: true,
  autoVerify: true,
  autoRegenerate: true,
  humanReadable: true,
  saveBarcodeImage: true,
  saveBarcodeSvg: true,
  stickerSize: "50x30",
  customWidth: 50,
  customHeight: 30,
  labelGap: 2,
  margin: 1.5,
  printerType: "thermal203",
  darkness: 50,
  printSpeed: 50,
  autoCut: false,
  feedAfterPrint: true,
  stickerFields: ALL_STICKER_FIELDS.filter(f => f.defaultOn).map(f => f.key),
  fontFamily: "Tahoma",
  fontSize: 8,
  fontBold: true,
  textAlign: "center",
  lineSpacing: 1.1,
  textColor: "#000000",
  barcodeWidth: 2,
  barcodeHeight: 40,
  quietZone: 4,
  barcodeTopMargin: 0,
  barcodeBottomMargin: 0,
  centerBarcode: true,
  highResSvg: true,
};

export const STICKER_SIZES = [
  { key: "40x30", label: "40 × 30 mm", widthMm: 40, heightMm: 30 },
  { key: "50x25", label: "50 × 25 mm", widthMm: 50, heightMm: 25 },
  { key: "50x30", label: "50 × 30 mm", widthMm: 50, heightMm: 30 },
  { key: "60x40", label: "60 × 40 mm", widthMm: 60, heightMm: 40 },
  { key: "custom", label: "Custom", widthMm: 50, heightMm: 30 },
] as const;

export const PRINTER_TYPES = [
  { key: "thermal203", label: "Thermal 203 DPI", dpi: 203 },
  { key: "thermal300", label: "Thermal 300 DPI", dpi: 300 },
  { key: "a4", label: "A4 Label Sheet", dpi: 300 },
] as const;

export const FONT_FAMILIES = [
  "Tahoma",
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Georgia",
  "Calibri",
  "Inter",
  "Noto Sans",
];

export function getStickerDimensions(settings: BarcodeSettings): { widthMm: number; heightMm: number } {
  if (settings.stickerSize === "custom") {
    return { widthMm: settings.customWidth, heightMm: settings.customHeight };
  }
  const found = STICKER_SIZES.find(s => s.key === settings.stickerSize);
  return { widthMm: found?.widthMm ?? 50, heightMm: found?.heightMm ?? 30 };
}
