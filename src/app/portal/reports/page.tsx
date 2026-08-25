"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Calendar, DollarSign, ShoppingBag } from "lucide-react";
import { PortalShell, useShopSupabase } from "@/components/portal/portal-shell";

export default function ReportsPage() {
  return (
    <PortalShell>
      <ReportsContent />
    </PortalShell>
  );
}

function ReportsContent() {
  const sb = useShopSupabase();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      try {
        const now = new Date();
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
        const monthStart = new Date(now); monthStart.setDate(1);

        const [todayRes, weekRes, monthRes, allRes] = await Promise.all([
          sb.from("sales_history").select("total, items_count").gte("sale_date", todayStart.toISOString()),
          sb.from("sales_history").select("total, items_count").gte("sale_date", weekStart.toISOString()),
          sb.from("sales_history").select("total, items_count").gte("sale_date", monthStart.toISOString()),
          sb.from("sales_history").select("total, sale_date").order("sale_date", { ascending: false }).limit(1000),
        ]);

        const todayTotal = (todayRes.data || []).reduce((s: number, r: any) => s + (r.total || 0), 0);
        const weekTotal = (weekRes.data || []).reduce((s: number, r: any) => s + (r.total || 0), 0);
        const monthTotal = (monthRes.data || []).reduce((s: number, r: any) => s + (r.total || 0), 0);
        const allTotal = (allRes.data || []).reduce((s: number, r: any) => s + (r.total || 0), 0);

        // Group by date for last 7 days
        const last7Days: { date: string; total: number }[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(0, 0, 0, 0);
          const next = new Date(d); next.setDate(d.getDate() + 1);
          const daySales = (allRes.data || []).filter((r: any) => {
            const sd = new Date(r.sale_date);
            return sd >= d && sd < next;
          });
          last7Days.push({
            date: d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
            total: daySales.reduce((s: number, r: any) => s + (r.total || 0), 0),
          });
        }

        setData({
          today: { total: todayTotal, count: todayRes.data?.length || 0 },
          week: { total: weekTotal, count: weekRes.data?.length || 0 },
          month: { total: monthTotal, count: monthRes.data?.length || 0 },
          allTime: { total: allTotal, count: allRes.data?.length || 0 },
          last7Days,
        });
      } catch (err) {
        console.error("Reports error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [sb]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent><Skeleton className="h-8 w-24" /></CardContent></Card>)}
      </div>
    );
  }

  const cards = [
    { label: "Today", value: data?.today?.total || 0, count: data?.today?.count || 0, icon: Calendar, color: "text-emerald-600" },
    { label: "This Week", value: data?.week?.total || 0, count: data?.week?.count || 0, icon: TrendingUp, color: "text-blue-600" },
    { label: "This Month", value: data?.month?.total || 0, count: data?.month?.count || 0, icon: ShoppingBag, color: "text-amber-600" },
    { label: "All Time", value: data?.allTime?.total || 0, count: data?.allTime?.count || 0, icon: DollarSign, color: "text-purple-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground">Sales summary and trends</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs uppercase text-muted-foreground">{c.label}</CardTitle>
                  <Icon className={`w-4 h-4 ${c.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${c.color}`}>Rs {c.value.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">{c.count} sales</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last 7 Days Sales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between gap-2 h-40">
            {data?.last7Days?.map((day: any, i: number) => {
              const max = Math.max(...data.last7Days.map((d: any) => d.total), 1);
              const height = (day.total / max) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-xs font-bold text-emerald-700">{day.total > 0 ? `Rs ${day.total}` : ""}</div>
                  <div className="w-full bg-emerald-100 rounded-t" style={{ height: `${Math.max(height, 2)}%`, minHeight: "4px" }}>
                    <div className="w-full h-full bg-emerald-500 rounded-t" />
                  </div>
                  <div className="text-[10px] text-muted-foreground">{day.date}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
