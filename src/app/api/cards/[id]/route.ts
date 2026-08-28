import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const card = await db.customerCard.findUnique({
    where: { id },
    include: {
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ card });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "CASHIER") {
    return NextResponse.json({ error: "Manager/Admin only" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  const existing = await db.customerCard.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: any = {
    name: (body.name || "").toString().trim() || existing.name,
    phone: body.phone != null ? String(body.phone).trim() || null : existing.phone,
    address: body.address != null ? String(body.address).trim() || null : existing.address,
    type: body.type === "WHOLESALE" ? "WHOLESALE" : body.type === "SHOP_KEEPER" ? "SHOP_KEEPER" : "REGULAR",
    active: body.active !== false,
  };

  const card = await db.customerCard.update({ where: { id }, data });

  // v2.10.40: Sync updated card to Supabase (await — same as POST route)
  let syncWarning: string | null = null;
  try {
    const { syncCard } = await import("@/lib/supabase-sync");
    await syncCard({
      cardNumber: card.cardNumber,
      name: card.name,
      phone: card.phone || null,
      address: card.address || null,
      type: card.type,
      balance: card.balance,
      active: card.active,
    });
    console.log("[Cards PUT] Card synced to cloud:", card.cardNumber);
  } catch (e: any) {
    console.error("[Cards PUT] Sync failed (local save OK):", e?.message);
    syncWarning = "Card saved locally but cloud sync failed.";
  }

  return NextResponse.json({ card, syncWarning });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id } = await params;

  // Fetch the card BEFORE deleting (we need cardNumber for Supabase sync)
  const card = await db.customerCard.findUnique({ where: { id } }).catch(() => null);

  // Delete from local DB
  await db.customerCard.delete({ where: { id } }).catch(() => null);

  // v2.10.41: Also delete (or block) from Supabase
  // We don't actually DELETE the row in Supabase (to preserve history for
  // old sales that reference this card_number). Instead, we mark it
  // is_active=false so the customer card page shows "card inactive".
  if (card?.cardNumber) {
    try {
      const { getShopSupabaseAsync } = await import("@/lib/supabase-sync");
      const sb = await getShopSupabaseAsync();
      if (sb) {
        const { error } = await sb
          .from("customer_cards")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("card_number", card.cardNumber);
        if (error) {
          console.warn("[Cards DELETE] Supabase block failed:", error.message);
        } else {
          console.log("[Cards DELETE] Card blocked in Supabase:", card.cardNumber);
        }
      }
    } catch (e: any) {
      console.warn("[Cards DELETE] Sync error (non-fatal):", e?.message);
    }
  }

  return NextResponse.json({ ok: true });
}
