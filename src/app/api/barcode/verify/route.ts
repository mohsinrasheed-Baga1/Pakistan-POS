import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { verifyBarcodeFromPng, BarcodeFormat } from "@/lib/barcode-engine";

/**
 * POST /api/barcode/verify
 * Body: { pngBase64: string, expectedValue: string, format: BarcodeFormat }
 * Returns: { verified: boolean }
 *
 * Used by the client to verify a barcode before printing/saving.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { pngBase64, expectedValue, format } = body;

    if (!pngBase64 || !expectedValue || !format) {
      return NextResponse.json({ error: "pngBase64, expectedValue, and format are required" }, { status: 400 });
    }

    const validFormats: BarcodeFormat[] = ["CODE128", "EAN13", "UPC_A", "CODE39", "QR"];
    if (!validFormats.includes(format)) {
      return NextResponse.json({ error: "Invalid format" }, { status: 400 });
    }

    const verified = await verifyBarcodeFromPng(pngBase64, String(expectedValue), format as BarcodeFormat);
    return NextResponse.json({ verified });
  } catch (e: any) {
    console.error("[barcode/verify POST]", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
