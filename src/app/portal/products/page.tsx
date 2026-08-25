"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Package, Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { PortalShell, useShopSupabase } from "@/components/portal/portal-shell";
import { toast } from "sonner";

export default function ProductsPage() {
  return (
    <PortalShell>
      <ProductsContent />
    </PortalShell>
  );
}

function ProductsContent() {
  const sb = useShopSupabase();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", barcode: "", sale_price: 0, unit: "piece", stock: 0 });

  useEffect(() => {
    if (!sb) return;
    loadProducts(sb);
  }, [sb]);

  async function loadProducts(client: any) {
    setLoading(true);
    try {
      const { data } = await client.from("products").select("*").order("name").limit(500);
      setProducts(data || []);
    } catch (err) {
      console.error("Products load error:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(p: any) {
    setEditing(p);
    setForm({ name: p.name || "", barcode: p.barcode || "", sale_price: p.sale_price || 0, unit: p.unit || "piece", stock: p.stock || 0 });
    setShowForm(true);
  }

  function handleAdd() {
    setEditing(null);
    setForm({ name: "", barcode: "", sale_price: 0, unit: "piece", stock: 0 });
    setShowForm(true);
  }

  async function handleSave() {
    if (!sb || !form.name.trim()) { toast.error("Product name is required"); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await sb.from("products").update({
          name: form.name.trim(),
          barcode: form.barcode.trim() || null,
          sale_price: Number(form.sale_price) || 0,
          unit: form.unit,
          stock: Number(form.stock) || 0,
          updated_at: new Date().toISOString(),
        }).eq("id", editing.id);
        if (error) throw error;
        toast.success("Product updated");
      } else {
        const productId = `prod-${Date.now()}`;
        const { error } = await sb.from("products").insert({
          product_id: productId,
          name: form.name.trim(),
          barcode: form.barcode.trim() || null,
          sale_price: Number(form.sale_price) || 0,
          unit: form.unit,
          stock: Number(form.stock) || 0,
          is_active: true,
        });
        if (error) throw error;
        toast.success("Product added");
      }
      setShowForm(false);
      loadProducts(sb);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: any) {
    if (!sb) return;
    if (!confirm(`Delete "${p.name}"?`)) return;
    try {
      await sb.from("products").delete().eq("id", p.id);
      toast.success("Product deleted");
      loadProducts(sb);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const filtered = products.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground">Manage your product catalog</p>
        </div>
        <Button onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-2" /> Add Product
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No products found.</p>
          ) : (
            <div className="divide-y">
              {filtered.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 hover:bg-muted/50">
                  <div className="flex items-center gap-3 min-w-0">
                    <Package className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.barcode || "No barcode"} · {p.unit || "piece"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-bold text-emerald-700">Rs {(p.sale_price || 0).toLocaleString()}</div>
                      <Badge variant={p.stock > 0 ? "default" : "secondary"} className="text-[10px]">
                        Stock: {p.stock || 0}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDelete(p)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Product Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Basmati Rice 1kg" />
            </div>
            <div className="space-y-1.5">
              <Label>Barcode</Label>
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="1234567890" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sale Price (Rs)</Label>
                <Input type="number" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Stock</Label>
                <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="piece / kg / liter" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editing ? "Update" : "Add"} Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
