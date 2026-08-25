"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Receipt } from "lucide-react";
import { PortalShell, useShopSupabase } from "@/components/portal/portal-shell";

export default function SalesPage() {
  return (
    <PortalShell>
      <SalesContent />
    </PortalShell>
  );
}

function SalesContent() {
  const sb = useShopSupabase();
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!sb) return;
    (async () => {
      try {
        const { data } = await sb.from("sales_history").select("*").order("sale_date", { ascending: false }).limit(200);
        setSales(data || []);
      } catch (err) {
        console.error("Sales load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [sb]);

  const filtered = sales.filter(s =>
    !search || s.invoice_no?.toLowerCase().includes(search.toLowerCase()) || s.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = filtered.reduce((sum, s) => sum + (s.total || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Sales History</h1>
        <p className="text-sm text-muted-foreground">{filtered.length} sales · Total: Rs {totalRevenue.toLocaleString()}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by invoice or customer..." className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No sales found.</p>
          ) : (
            <div className="divide-y">
              {filtered.map((s) => (
                <div key={s.id} className="flex justify-between items-center p-3 hover:bg-muted/50">
                  <div>
                    <div className="font-mono text-sm">{s.invoice_no}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(s.sale_date).toLocaleString()} · {s.customer_name || "Walk-in"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{s.payment_method}</Badge>
                    <Badge variant="outline">{s.items_count || 0} items</Badge>
                    {(s.balance_due || 0) > 0 && <Badge variant="destructive">Due: Rs {s.balance_due}</Badge>}
                    <span className="font-bold text-emerald-700">Rs {s.total?.toLocaleString()}</span>
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
