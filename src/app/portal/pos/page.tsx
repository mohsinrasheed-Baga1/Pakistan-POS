"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, Loader2, Plus, Minus, Trash2, Search, Package } from "lucide-react";
import { PortalShell, useShopSupabase } from "@/components/portal/portal-shell";
import { toast } from "sonner";

export default function POSPage() {
  return (
    <PortalShell>
      <POSContent />
    </PortalShell>
  );
}

function POSContent() {
  const sb = useShopSupabase();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<{ product: any; qty: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!sb) return;
    (async () => {
      try {
        const { data } = await sb.from("products").select("*").eq("is_active", true).order("name").limit(200);
        setProducts(data || []);
      } catch (err) {
        console.error("Products load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [sb]);

  function addToCart(p: any) {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === p.id);
      if (existing) {
        return prev.map(i => i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { product: p, qty: 1 }];
    });
  }

  function updateQty(id: string, delta: number) {
    setCart(prev => prev.map(i => i.product.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
  }

  function removeFromCart(id: string) {
    setCart(prev => prev.filter(i => i.product.id !== id));
  }

  const total = cart.reduce((sum, i) => sum + (i.product.sale_price || 0) * i.qty, 0);

  async function handleCheckout() {
    if (!sb || cart.length === 0) return;
    setSubmitting(true);
    try {
      const invoiceNo = `WEB-${Date.now()}`;
      const { error: saleError } = await sb.from("sales_history").insert({
        invoice_no: invoiceNo,
        subtotal: total,
        total: total,
        paid_amount: total,
        change_amount: 0,
        balance_due: 0,
        payment_method: "CASH",
        sale_type: "RETAIL",
        items_count: cart.reduce((s, i) => s + i.qty, 0),
        sale_date: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      });
      if (saleError) throw saleError;

      for (const item of cart) {
        const newStock = Math.max(0, (item.product.stock || 0) - item.qty);
        await sb.from("products").update({ stock: newStock, updated_at: new Date().toISOString() }).eq("id", item.product.id);
      }

      toast.success(`Sale completed! Invoice: ${invoiceNo}`);
      setCart([]);
      const { data } = await sb.from("products").select("*").eq("is_active", true).order("name").limit(200);
      setProducts(data || []);
    } catch (err: any) {
      toast.error(err.message || "Sale failed");
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = products.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search)
  );

  if (loading) {
    return <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      <div className="flex-1 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Online POS</h1>
          <p className="text-sm text-muted-foreground">Make sales online</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." className="pl-9" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => addToCart(p)} className="flex flex-col items-center gap-1 p-3 rounded-lg border hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors text-center">
              <Package className="w-6 h-6 text-muted-foreground" />
              <span className="text-xs font-medium truncate w-full">{p.name}</span>
              <span className="text-sm font-bold text-emerald-700">Rs {p.sale_price}</span>
              <Badge variant="outline" className="text-[10px]">{p.stock || 0} left</Badge>
            </button>
          ))}
        </div>
      </div>
      <div className="w-full lg:w-80 space-y-3">
        <Card className="border-2 border-emerald-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" /> Cart ({cart.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[50vh] overflow-y-auto">
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">Cart is empty</p>
            ) : (
              cart.map((item) => (
                <div key={item.product.id} className="flex items-center gap-2 p-2 rounded border">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{item.product.name}</div>
                    <div className="text-xs text-muted-foreground">Rs {item.product.sale_price} × {item.qty}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQty(item.product.id, -1)}><Minus className="w-3 h-3" /></Button>
                    <span className="text-sm font-bold w-6 text-center">{item.qty}</span>
                    <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQty(item.product.id, 1)}><Plus className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-600" onClick={() => removeFromCart(item.product.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        {cart.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between text-lg font-bold">
                <span>Total:</span>
                <span className="text-emerald-700">Rs {total.toLocaleString()}</span>
              </div>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleCheckout} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
                Complete Sale
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
