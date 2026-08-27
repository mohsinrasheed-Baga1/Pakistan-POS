import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { generateBarcode, BarcodeFormat } from "@/lib/barcode-engine";

/**
 * POST /api/barcode/generate
 * Body: {
 *   format: "CODE128" | "EAN13" | "UPC_A" | "CODE39" | "QR",
 *   value: string,
 *   scale?: number,      // default 2
 *   height?: number,     // mm, default 10
 *   includeText?: boolean, // default true
 *   verify?: boolean,    // default true
 * }
 * Returns: { success, value, format, svg, pngBase64, verified, widthMm, heightMm }
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { format, value, scale, height, includeText, verify } = body;

    if (!format || !value) {
      return NextResponse.json({ error: "format and value are required" }, { status: 400 });
    }

    const validFormats: BarcodeFormat[] = ["CODE128", "EAN13", "UPC_A", "CODE39", "QR"];
    if (!validFormats.includes(format)) {
      return NextResponse.json({ error: `Invalid format. Must be one of: ${validFormats.join(", ")}` }, { status: 400 });
    }

    const result = await generateBarcode({
      format: format as BarcodeFormat,
      value: String(value),
      scale,
      height,
      includeText,
      verify: verify !== false,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to generate barcode" }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[barcode/generate POST]", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
