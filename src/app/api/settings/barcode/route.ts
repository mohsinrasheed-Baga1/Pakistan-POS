import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

const DEFAULT_STICKER_FIELDS = [
  "storeName",
  "productName",
  "productCode",
  "barcode",
  "barcodeNumber",
  "sellingPrice",
  "expiryDate",
];

const DEFAULTS = {
  id: "default",
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
  stickerFields: JSON.stringify(DEFAULT_STICKER_FIELDS),
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
  posScanBehavior: "ASK_QUANTITY",
};

// GET /api/settings/barcode
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let settings = await db.barcodeSettings.findUnique({ where: { id: "default" } });
    if (!settings) {
      // Create with defaults
      settings = await db.barcodeSettings.create({ data: DEFAULTS });
    }
    // Parse stickerFields JSON
    let fields: string[] = DEFAULT_STICKER_FIELDS;
    try {
      const parsed = JSON.parse(settings.stickerFields);
      if (Array.isArray(parsed) && parsed.length > 0) fields = parsed;
    } catch {}
    return NextResponse.json({ settings: { ...settings, stickerFieldsArray: fields } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT /api/settings/barcode
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") return NextResponse.json({ error: "Manager only" }, { status: 403 });

  try {
    const body = await req.json();
    const fields: string[] = Array.isArray(body.stickerFields) ? body.stickerFields : DEFAULT_STICKER_FIELDS;

    const data: any = {
      defaultBarcodeType: body.defaultBarcodeType || "CODE128",
      autoGenerate: body.autoGenerate !== false,
      autoVerify: body.autoVerify !== false,
      autoRegenerate: body.autoRegenerate !== false,
      humanReadable: body.humanReadable !== false,
      saveBarcodeImage: body.saveBarcodeImage !== false,
      saveBarcodeSvg: body.saveBarcodeSvg !== false,
      stickerSize: body.stickerSize || "50x30",
      customWidth: Number(body.customWidth) || 50,
      customHeight: Number(body.customHeight) || 30,
      labelGap: Number(body.labelGap) || 2,
      margin: Number(body.margin) || 1.5,
      printerType: body.printerType || "thermal203",
      darkness: Number(body.darkness) || 50,
      printSpeed: Number(body.printSpeed) || 50,
      autoCut: body.autoCut === true,
      feedAfterPrint: body.feedAfterPrint !== false,
      stickerFields: JSON.stringify(fields),
      fontFamily: body.fontFamily || "Tahoma",
      fontSize: Number(body.fontSize) || 8,
      fontBold: body.fontBold !== false,
      textAlign: body.textAlign || "center",
      lineSpacing: Number(body.lineSpacing) || 1.1,
      textColor: body.textColor || "#000000",
      barcodeWidth: Number(body.barcodeWidth) || 2,
      barcodeHeight: Number(body.barcodeHeight) || 40,
      quietZone: Number(body.quietZone) || 4,
      barcodeTopMargin: Number(body.barcodeTopMargin) || 0,
      barcodeBottomMargin: Number(body.barcodeBottomMargin) || 0,
      centerBarcode: body.centerBarcode !== false,
      highResSvg: body.highResSvg !== false,
      posScanBehavior: body.posScanBehavior === "DIRECT_ADD" ? "DIRECT_ADD" : "ASK_QUANTITY",
    };

    const settings = await db.barcodeSettings.upsert({
      where: { id: "default" },
      create: { ...DEFAULTS, ...data },
      update: data,
    });

    return NextResponse.json({ settings: { ...settings, stickerFieldsArray: fields } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/settings/barcode — reset to defaults
export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") return NextResponse.json({ error: "Manager only" }, { status: 403 });

  try {
    await db.barcodeSettings.deleteMany({ where: { id: "default" } });
    const settings = await db.barcodeSettings.create({ data: DEFAULTS });
    return NextResponse.json({ settings: { ...settings, stickerFieldsArray: DEFAULT_STICKER_FIELDS } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export { DEFAULTS, DEFAULT_STICKER_FIELDS };
