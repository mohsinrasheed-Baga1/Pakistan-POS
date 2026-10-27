import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { randomBytes } from "crypto";

function generateCardNumber(): string {
  // 12-digit numeric card number, prefix 9999 to distinguish from barcodes
  const rand = randomBytes(8).readBigUInt64BE().toString().slice(0, 8).padStart(8, "0");
  return `9999${rand}`;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";

  const cards = await db.customerCard.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { cardNumber: { contains: q } },
            { phone: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json({ cards });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager/Admin only" }, { status: 403 });
  }
  const body = await req.json();

  const name = (body.name || "").toString().trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // Generate a unique card number if not provided
  let cardNumber = (body.cardNumber || "").toString().trim();
  if (!cardNumber) {
    for (let i = 0; i < 10; i++) {
      const candidate = generateCardNumber();
      const exists = await db.customerCard.findUnique({
        where: { cardNumber: candidate },
        select: { id: true },
      });
      if (!exists) {
        cardNumber = candidate;
        break;
      }
    }
  } else {
    const exists = await db.customerCard.findUnique({
      where: { cardNumber },
      select: { id: true },
    });
    if (exists) {
      return NextResponse.json({ error: "Card number already exists" }, { status: 400 });
    }
  }
  if (!cardNumber) {
    return NextResponse.json({ error: "Failed to generate card number" }, { status: 500 });
  }

  // Generate customerId if not provided
  const customerId = body.customerId
    ? String(body.customerId).trim()
    : `CUST-${Date.now().toString().slice(-8)}`;

  const card = await db.customerCard.create({
    data: {
      cardNumber,
      customerId,
      name,
      phone: body.phone ? String(body.phone).trim() : null,
      address: body.address ? String(body.address).trim() : null,
      type: body.type === "WHOLESALE" ? "WHOLESALE" : body.type === "SHOP_KEEPER" ? "SHOP_KEEPER" : "REGULAR",
      balance: Number(body.balance) || 0,
      active: body.active !== false,
    },
  });

  // v2.10.118: NON-BLOCKING SYNC — return the card IMMEDIATELY so the
  // user doesn't have to wait 30 seconds for Supabase sync. Fire the
  // sync in the background. If it fails (no internet, etc.), that's OK —
  // the card is saved locally and will sync on next Google Drive backup.
  //   User: "جب کسٹمر کارڈ کے اندر جاتے ہیں تو وہ ڈائریکٹ سائنس ہوتا ہے
  //   پہلے پھر نیا کارڈ جنریٹ ہوتا ہے جب ہم انفارمیشن دیتے ہیں تو اگر
  //   انٹرنیٹ نہ ہو تو پھر کارڈ ہی نہیں بنتا یہ مسئلہ ہے اسے درست کرو"
  //   + "سائنس بیک اپ پہ ہوتا رہنا چاہیے تو جب انٹرنیٹ ہو تو ساتھ میں ہو
  //   جائے تو کوئی مسئلہ نہیں کا انٹرنیٹ نہ بھی ہو تو یہ نیو کارڈ بھی
  //   شاپ کارڈ بھی ہم بنا سکیں"
  // Fire sync in the background (no await, no block):
  Promise.resolve().then(async () => {
    try {
      const { syncCard } = await import("@/lib/supabase-sync");
      await syncCard({
        cardNumber,
        name,
        phone: body.phone ? String(body.phone).trim() : null,
        address: body.address ? String(body.address).trim() : null,
        type: body.type === "WHOLESALE" ? "WHOLESALE" : body.type === "SHOP_KEEPER" ? "SHOP_KEEPER" : "REGULAR",
        balance: Number(body.balance) || 0,
        active: body.active !== false,
      });
      console.log("[Cards POST bg-sync] ✓ Card synced to cloud:", cardNumber);
    } catch (e: any) {
      console.warn("[Cards POST bg-sync] Failed (non-fatal, local save OK):", e?.message || e);
    }
  }).catch(() => {});

  // Return immediately — no waiting for sync
  return NextResponse.json({ card, syncWarning: null, syncSuccess: false });
}
