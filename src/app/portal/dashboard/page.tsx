"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Package, CreditCard, Receipt, ShieldCheck } from "lucide-react";
import { PortalShell, useShopSupabase } from "@/components/portal/portal-shell";

type ShopData = {
  licenseKey: string;
  shopName: string;
  customerName: string;
  supabaseUrl: string;
  supabaseKey: string;
};

export default function DashboardPage() {
  return (
    <PortalShell>
      <DashboardContent />
    </PortalShell>
  );
}

function DashboardContent() {
  const sb = useShopSupabase();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sb) return;
    loadData(sb);
  }, [sb]);

  async function loadData(client: any) {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [todaySalesRes, productCountRes, cardCountRes, recentSalesRes] = await Promise.all([
        client.from("sales_history").select("total, items_count").gte("sale_date", todayStart.toISOString()),
        client.from("products").select("*", { count: "exact", head: true }),
        client.from("customer_cards").select("*", { count: "exact", head: true }),
        client.from("sales_history").select("invoice_no, total, sale_date, payment_method").order("sale_date", { ascending: false }).limit(10),
      ]);

      const todayTotal = (todaySalesRes.data || []).reduce((sum: number, s: any) => sum + (s.total || 0), 0);
      const todayCount = (todaySalesRes.data || []).length;
      const todayItems = (todaySalesRes.data || []).reduce((sum: number, s: any) => sum + (s.items_count || 0), 0);

      setStats({
        todayTotal,
        todayCount,
        todayItems,
        productCount: productCountRes.count || 0,
        cardCount: cardCountRes.count || 0,
        recentSales: recentSalesRes.data || [],
      });
    } catch (err) {
      console.error("Dashboard error:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent><Skeleton className="h-8 w-24" /></CardContent></Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your online dashboard overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs uppercase text-muted-foreground">Today&apos;s Sales</CardTitle>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">Rs {stats?.todayTotal?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats?.todayCount || 0} sales · {stats?.todayItems || 0} items</p>
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
            <div className="text-2xl font-bold">{stats?.productCount || 0}</div>
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
            <div className="text-2xl font-bold">{stats?.cardCount || 0}</div>
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
            <Badge className="bg-emerald-600">Active</Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="w-4 h-4" /> Recent Sales
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!stats?.recentSales?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">No sales yet.</p>
          ) : (
            <div className="space-y-1">
              {stats.recentSales.map((sale: any, i: number) => (
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
    </div>
  );
}
