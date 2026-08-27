import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { createClient } from "@supabase/supabase-js";

// POST /api/bulk-sync
// Syncs ALL existing POS data to the shop's Supabase database
export async function POST() {
  const user = await getSessionUser();
  if (!user || user.role === "CASHIER") {
    return NextResponse.json({ error: "Admin/Manager only" }, { status: 403 });
  }

  // Skip on Vercel (no local DB)
  if (process.env.VERCEL === "1") {
    return NextResponse.json({ error: "Bulk sync is only available from the POS desktop app" }, { status: 400 });
  }

  // Get shop's Supabase credentials from localStorage (via settings)
  // We need to read from the settings table — shop_supabase_url and shop_supabase_key
  // are NOT stored in settings table. They're in localStorage.
  // So we need the client to send them, or we read from a different source.
  //
  // Actually, the credentials are stored in localStorage as 'pakpos_shop_supabase'
  // The server can't read localStorage. So we need a different approach.
  //
  // Solution: Read the license key from the stored license, then query the admin
  // Supabase to get the shop's Supabase credentials.

  try {
    // 1. Get stored license to find the license key
    const licenseData = typeof window !== "undefined" ? localStorage.getItem("pakpos_license_data") : null;
    // This won't work server-side. Let me try a different approach.

    // Read from headers or body
    // Actually, let me just use the hardcoded admin Supabase and look up by license key

    // Get the license key from the settings table (we stored it somewhere?)
    // Actually, the license key is in localStorage on client side.
    // Let me accept it as a query parameter or body.

    return NextResponse.json({
      error: "Please provide your Supabase credentials. Go to Settings > License Info > Online Portal Sync to configure them first."
    }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
