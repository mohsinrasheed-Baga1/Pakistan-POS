"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Store, LogOut, Package, Receipt, TrendingUp, CreditCard, Settings, MessageCircle } from "lucide-react";
import { LICENSE_CONFIG } from "@/lib/license/config";

type ShopData = {
  licenseKey: string;
  shopName: string;
  shopAddress: string;
  customerName: string;
  supabaseUrl: string;
  supabaseKey: string;
};

export default function ShopkeeperDashboard() {
  const router = useRouter();
  const [shop, setShop] = useState<ShopData | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = sessionStorage.getItem("pakpos_shop");
    if (!stored) {
      router.push("/portal/login");
      return;
    }
    const shopData = JSON.parse(stored) as ShopData;
    setShop(shopData);
    loadData(shopData);
  }, [router]);

  async function loadData(shopData: ShopData) {
    try {
      const sb = createClient(shopData.supabaseUrl, shopData.supabaseKey, {
        auth: { persistSession: false },
      });

      // Get shop info
      const { data: shopInfo } = await sb
        .from("shop_info")
        .select("*")
        .eq("id", "shop")
        .single();

      // Get product count
      const { count: productCount } = await sb
        .from("products")
        .select("*", { count: "exact", head: true });

      // Get today's sales
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: todaySales } = await sb
        .from("sales_history")
        .select("total, items_count")
        .gte("sale_date", todayStart.toISOString());

      const todayTotal = (todaySales || []).reduce((sum: number, s: any) => sum + (s.total || 0), 0);
      const todayCount = (todaySales || []).length;
      const todayItems = (todaySales || []).reduce((sum: number, s: any) => sum + (s.items_count || 0), 0);

      // Get card count
      const { count: cardCount } = await sb
        .from("customer_cards")
        .select("*", { count: "exact", head: true });

      // Get recent sales (last 5)
      const { data: recentSales } = await sb
        .from("sales_history")
        .select("invoice_no, total, sale_date, payment_method")
        .order("sale_date", { ascending: false })
        .limit(5);

      setStats({
        shopInfo,
        productCount: productCount || 0,
        cardCount: cardCount || 0,
        todayTotal,
        todayCount,
        todayItems,
        recentSales: recentSales || [],
      });
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem("pakpos_shop");
    router.push("/portal/login");
  }

  if (!shop) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    );
  }

  const waLink = `https://wa.me/${LICENSE_CONFIG.developer.whatsappNumber}?text=${encodeURIComponent("Assalam o Alaikum, mujhe Pakistan POS portal ke baray mein maloomat chahiye.")}`;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-background border-b sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-emerald-600 flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm">{shop.shopName}</div>
              <div className="text-xs text-muted-foreground">Pakistan POS Dashboard</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {shop.customerName}</h1>
          <p className="text-sm text-muted-foreground">Your online dashboard overview</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs uppercase text-muted-foreground">Today's Sales</CardTitle>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-24" /> : (
                <>
                  <div className="text-2xl font-bold text-emerald-700">Rs {stats?.todayTotal?.toLocaleString() || 0}</div>
                  <p className="text-xs text-muted-foreground mt-1">{stats?.todayCount || 0} sales · {stats?.todayItems || 0} items</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs uppercase text-muted-foreground">Products</CardTitle>
                <Package className="w-4 h-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold">{stats?.productCount || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs uppercase text-muted-foreground">Shop Cards</CardTitle>
                <CreditCard className="w-4 h-4 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-8 w-16" /> : (
                <div className="text-2xl font-bold">{stats?.cardCount || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs uppercase text-muted-foreground">License</CardTitle>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-mono">{shop.licenseKey}</div>
              <Badge className="mt-1 bg-emerald-600">Active</Badge>
            </CardContent>
          </Card>
        </div>

        {/* Recent Sales */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="w-4 h-4" /> Recent Sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : stats?.recentSales?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No sales yet. Sales will appear here when synced from your POS.</p>
            ) : (
              <div className="space-y-1">
                {stats?.recentSales?.map((sale: any, i: number) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b text-sm">
                    <div>
                      <span className="font-mono">{sale.invoice_no}</span>
                      <span className="ml-2 text-muted-foreground">{new Date(sale.sale_date).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{sale.payment_method}</Badge>
                      <span className="font-bold text-emerald-700">Rs {sale.total?.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardContent className="py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Need help? Contact support:</p>
              <p className="text-xs text-muted-foreground">Mohsin Rasheed Baga · +923000088482</p>
            </div>
            <a href={waLink} target="_blank" rel="noopener noreferrer">
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
              </Button>
            </a>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

import { ShieldCheck } from "lucide-react";
