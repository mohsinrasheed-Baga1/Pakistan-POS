"use client";

import * as React from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Package,
  Printer,
  Barcode as BarcodeIcon,
  AlertTriangle,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatMoney, unitLabel } from "@/lib/pos-utils";
import { BarcodeDisplay } from "@/components/barcode/barcode-display";
import { ImageUpload } from "@/components/pos/image-upload";
import type { Product, Category, Vendor } from "@/types";

interface ProductsViewProps {
  userRole: string;
}

const UNITS = [
  { v: "piece", l: "Piece" },
  { v: "kg", l: "Kg" },
  { v: "gram", l: "Gram" },
  { v: "litre", l: "Litre" },
  { v: "ml", l: "Millilitre" },
  { v: "dozen", l: "Dozen" },
  { v: "metre", l: "Metre" },
  { v: "feet", l: "Feet" },
];

const emptyForm = {
  name: "",
  barcode: "",
  categoryId: "",
  vendorId: "",
  costPrice: "",
  salePrice: "",
  wholesalePrice: "",
  shopkeeperPrice: "",
  unit: "piece",
  stock: "",
  minStock: "",
  taxRate: "",
  manufacturingDate: "",
  expiryDate: "",
  hasBarcode: true,
  active: true,
  image: null as string | null,
};

function formatExpiryBadge(expiry: string | null) {
  if (!expiry) return null;
  const d = new Date(expiry);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const label = d.toISOString().slice(0, 10);
  if (days < 0) {
    return { label, tone: "red" as const, days };
  }
  if (days <= 30) {
    return { label, tone: "amber" as const, days };
  }
  return { label, tone: "default" as const, days };
}

export function ProductsView({ userRole }: ProductsViewProps) {
  const canManage = userRole !== "CASHIER";
  const [products, setProducts] = React.useState<Product[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [vendors, setVendors] = React.useState<Vendor[]>([]);
  const [q, setQ] = React.useState("");
  const [activeCat, setActiveCat] = React.useState("all");
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<any>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [printProduct, setPrintProduct] = React.useState<Product | null>(null);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [editProduct, setEditProduct] = React.useState<Product | null>(null);

  const loadProducts = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (activeCat !== "all") params.set("categoryId", activeCat);
      const res = await fetch(`/api/products?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [q, activeCat]);

  const loadCategories = React.useCallback(async () => {
    try {
      const res = await fetch("/api/categories", { cache: "no-store" });
      const data = await res.json();
      setCategories(data.categories || []);
    } catch {}
  }, []);

  const loadVendors = React.useCallback(async () => {
    try {
      const res = await fetch("/api/vendors", { cache: "no-store" });
      const data = await res.json();
      setVendors(data.vendors || []);
    } catch {}
  }, []);

  React.useEffect(() => {
    loadCategories();
    loadVendors();
  }, [loadCategories, loadVendors]);

  React.useEffect(() => {
    const t = setTimeout(loadProducts, 200);
    return () => clearTimeout(t);
  }, [loadProducts]);

  function openAdd() {
    setForm(emptyForm);
    setEditId(null);
    setDialogOpen(true);
  }

  function openEdit(p: Product) {
    // All products (box or simple piece) are edited through the unified wizard.
    setEditProduct(p);
    setWizardOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (Number(form.salePrice) <= 0) {
      toast.error("Sale price is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        barcode: form.barcode.trim(),
        categoryId: form.categoryId || null,
        vendorId: form.vendorId || null,
        costPrice: Number(form.costPrice) || 0,
        salePrice: Number(form.salePrice) || 0,
        wholesalePrice: Number(form.wholesalePrice) || 0,
        shopkeeperPrice: Number(form.shopkeeperPrice) || 0,
        unit: form.unit,
        stock: Number(form.stock) || 0,
        minStock: Number(form.minStock) || 0,
        taxRate: Number(form.taxRate) || 0,
        manufacturingDate: form.manufacturingDate || null,
        expiryDate: form.expiryDate || null,
        hasBarcode: form.hasBarcode,
        active: form.active,
        image: form.image || null,
      };
      const url = editId
        ? `/api/products/${editId}`
        : "/api/products";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || "Failed to save";
        if (msg.includes("barcode") || msg.includes("already")) {
          toast.error("This barcode already exists! Use a different barcode or edit the existing product.");
        } else {
          toast.error(msg);
        }
        setSaving(false);
        return;
      }
      toast.success(editId ? "Product updated" : "Product added");
      setDialogOpen(false);
      loadProducts();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/products/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Failed to delete");
        return;
      }
      toast.success("Product deleted");
      setDeleteId(null);
      loadProducts();
    } catch {
      toast.error("Network error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-600" />
            Products
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage all items in your shop
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadProducts}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button variant="outline" className="border-amber-300 text-amber-700" onClick={() => { setActiveCat("all"); setQ(""); }}>
            <AlertTriangle className="w-4 h-4 mr-2" /> Low Stock
          </Button>
          <Button variant="outline" className="border-rose-300 text-rose-700" onClick={() => { setActiveCat("all"); setQ(""); }}>
            <Calendar className="w-4 h-4 mr-2" /> Expiry
          </Button>
          {canManage && (
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setWizardOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Product
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or barcode..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={activeCat} onValueChange={setActiveCat}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
              No products found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Sale</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                            <Package className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div>
                            <div>{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {unitLabel(p.unit)}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {p.barcode}
                        {p.barcodeType !== "COMPANY" && (
                          <Badge variant="outline" className="ml-1 text-[10px]">
                            Auto
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{p.category?.name || "-"}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatMoney(p.costPrice)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-700">
                        {formatMoney(p.salePrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-medium ${
                            p.stock <= 0
                              ? "text-red-600"
                              : p.stock <= p.minStock
                              ? "text-amber-600"
                              : ""
                          }`}
                        >
                          {p.stock}
                        </span>
                        {p.stock <= p.minStock && (
                          <AlertTriangle className="w-3 h-3 inline mr-1 text-amber-500" />
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const exp = formatExpiryBadge(p.expiryDate);
                          if (!exp) {
                            return (
                              <span className="text-muted-foreground text-xs">
                                -
                              </span>
                            );
                          }
                          if (exp.tone === "red") {
                            return (
                              <Badge
                                variant="outline"
                                className="text-red-700 border-red-300 bg-red-50"
                              >
                                {exp.label} · Expired
                              </Badge>
                            );
                          }
                          if (exp.tone === "amber") {
                            return (
                              <Badge
                                variant="outline"
                                className="text-amber-700 border-amber-300 bg-amber-50"
                              >
                                {exp.label} · {exp.days}d
                              </Badge>
                            );
                          }
                          return (
                            <Badge variant="outline" className="font-mono">
                              {exp.label}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setPrintProduct(p)}
                            title="Print Barcode"
                          >
                            <BarcodeIcon className="w-4 h-4 text-emerald-600" />
                          </Button>
                          {canManage && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => openEdit(p)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteId(p.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editId ? "Edit Product" : "Add New Product"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Sugar, Ghee, Rice"
              />
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <BarcodeIcon className="w-4 h-4 text-emerald-600" />
                  Has company barcode?
                </Label>
                <Switch
                  checked={form.hasBarcode}
                  onCheckedChange={(c) => setForm({ ...form, hasBarcode: c })}
                />
              </div>
              {form.hasBarcode ? (
                <Input
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder="Scan or type the barcode..."
                  className="text-left"
                />
              ) : (
                <p className="text-xs text-emerald-700">
                  ✓ A barcode will be auto-generated for this product (best for
                  loose items like sugar, ghee, etc.)
                </p>
              )}
              {form.barcode && (
                <div className="bg-white rounded p-2 flex justify-center">
                  <BarcodeDisplay
                    value={form.barcode}
                    format="EAN13"
                    height={50}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.categoryId || "none"}
                  onValueChange={(v) =>
                    setForm({ ...form, categoryId: v === "none" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select
                  value={form.unit}
                  onValueChange={(v) => setForm({ ...form, unit: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u.v} value={u.v}>
                        {u.l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Cost Price</Label>
                <Input
                  type="number"
                  value={form.costPrice}
                  onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                  className="text-left"
                />
              </div>
              <div className="space-y-2">
                <Label>Sale Price *</Label>
                <Input
                  type="number"
                  value={form.salePrice}
                  onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                  className="text-left"
                />
              </div>
              <div className="space-y-2">
                <Label>Wholesale Price</Label>
                <Input
                  type="number"
                  value={form.wholesalePrice}
                  onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })}
                  className="text-left"
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Shopkeeper Price</Label>
                <Input
                  type="number"
                  value={form.shopkeeperPrice}
                  onChange={(e) => setForm({ ...form, shopkeeperPrice: e.target.value })}
                  className="text-left"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Stock</Label>
                <Input
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className="text-left"
                />
              </div>
              <div className="space-y-2">
                <Label>Low Stock Alert</Label>
                <Input
                  type="number"
                  value={form.minStock}
                  onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                  className="text-left"
                />
              </div>
              <div className="space-y-2">
                <Label>Tax %</Label>
                <Input
                  type="number"
                  value={form.taxRate}
                  onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                  className="text-left"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Manufacturing Date</Label>
                <Input
                  type="date"
                  value={form.manufacturingDate}
                  onChange={(e) =>
                    setForm({ ...form, manufacturingDate: e.target.value })
                  }
                  className="text-left"
                />
              </div>
              <div className="space-y-2">
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) =>
                    setForm({ ...form, expiryDate: e.target.value })
                  }
                  className="text-left"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Vendor</Label>
              <Select
                value={form.vendorId || "none"}
                onValueChange={(v) =>
                  setForm({ ...form, vendorId: v === "none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No vendor</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                      {v.companyName ? ` — ${v.companyName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Product is active</Label>
              <Switch
                checked={form.active}
                onCheckedChange={(c) => setForm({ ...form, active: c })}
              />
            </div>

            {/* Product Image */}
            <ImageUpload
              value={form.image}
              onChange={(img) => setForm({ ...form, image: img })}
              label="Product Image"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* print barcode dialog */}
      <BarcodePrintDialog
        product={printProduct}
        onClose={() => setPrintProduct(null)}
      />

      {/* Quick Add Wizard */}
      <ProductWizard
        open={wizardOpen}
        onOpenChange={(o) => { setWizardOpen(o); if (!o) setEditProduct(null); }}
        categories={categories}
        onDone={loadProducts}
        editProduct={editProduct}
      />
    </div>
  );
}

function BarcodePrintDialog({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const [count, setCount] = React.useState(1);
  const [shopName, setShopName] = React.useState<string>("");
  const labelRef = React.useRef<HTMLDivElement>(null);

  // Fetch shop name from settings (used at the top of the sticker)
  React.useEffect(() => {
    if (!product) return;
    let active = true;
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        const s = d?.settings;
        setShopName(s?.shopName?.trim() || "My Shop");
      })
      .catch(() => {
        if (active) setShopName("My Shop");
      });
    return () => {
      active = false;
    };
  }, [product]);

  if (!product) return null;

  function handlePrint() {
    const content = labelRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=400,height=400");
    if (!win) {
      toast.error("Pop-up blocked. Please allow pop-ups to print.");
      return;
    }
    win.document.write(`
      <html dir="ltr"><head><title>Sticker ${product!.name}</title>
      <style>
        @page { size: 50mm 25mm; margin: 0; }
        html, body { margin: 0; padding: 0; }
        body { width: 50mm; }
        * { box-sizing: border-box; }
        .sticker {
          width: 50mm;
          height: 25mm;
          border: 1px dashed #999;
          padding: 1mm 1.5mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          font-family: Tahoma, Arial, sans-serif;
          color: #000;
          background: #fff;
          text-align: center;
          overflow: hidden;
          page-break-inside: avoid;
        }
        .shop-name {
          font-size: 8px;
          font-weight: bold;
          line-height: 1;
          width: 100%;
          margin-bottom: 1px;
        }
        .barcode {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          overflow: hidden;
          margin: 1px 0;
        }
        .product-name {
          font-size: 9px;
          font-weight: bold;
          line-height: 1;
          width: 100%;
          margin-top: 1px;
        }
      </style></head><body>${content.innerHTML}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      setTimeout(() => win.close(), 250);
    }, 350);
  }

  // Inline sticker style — matches the printed layout exactly (50mm × 25mm).
  const stickerStyle: React.CSSProperties = {
    width: "50mm",
    height: "25mm",
    border: "1px dashed #d1d5db",
    padding: "1mm 1.5mm",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    color: "#000",
    background: "#fff",
    textAlign: "center",
    overflow: "hidden",
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Print Barcode Sticker</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-center text-xs text-muted-foreground">
            Sticker size: 50mm × 25mm. Shop name (top) — Barcode (middle) —
            Product name (bottom).
          </div>
          <div className="flex items-center gap-2">
            <Label className="whitespace-nowrap">Quantity</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) =>
                setCount(
                  Math.min(100, Math.max(1, Number(e.target.value) || 1))
                )
              }
              className="text-left w-24"
            />
          </div>
          <div
            ref={labelRef}
            className="bg-white border rounded p-2 flex flex-wrap gap-1 justify-center"
          >
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="sticker" style={stickerStyle}>
                {/* TOP — shop name */}
                <div
                  className="shop-name"
                  style={{
                    fontSize: "7px",
                    fontWeight: "bold",
                    lineHeight: 1.05,
                    width: "100%",
                  }}
                >
                  {shopName || "My Shop"}
                </div>
                {/* MIDDLE — barcode */}
                <div
                  className="barcode"
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    overflow: "hidden",
                  }}
                >
                  <BarcodeDisplay
                    value={product.barcode}
                    format={product.barcodeType === "EAN13" ? "EAN13" : "CODE128"}
                    height={40}
                    width={2}
                    displayValue={true}
                  />
                </div>
                {/* BOTTOM — product name */}
                <div
                  className="product-name"
                  style={{
                    fontSize: "7px",
                    fontWeight: 600,
                    lineHeight: 1.05,
                    width: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {product.name}
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={handlePrint}
          >
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Product Wizard — Single page (name + barcode + box + piece)
// One unified form. Box section is optional (only used if box
// barcode is filled). Piece section is always shown below the box
// section. Piece prices auto-calculate from box ÷ pieces per box.
// ============================================================
interface ProductWizardProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: Category[];
  onDone: () => void;
  editProduct?: Product | null;
}

function ProductWizard({ open, onOpenChange, categories, onDone, editProduct }: ProductWizardProps) {
  const [saving, setSaving] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);

  // Shared
  const [name, setName] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [image, setImage] = React.useState<string | null>(null);
  const [expiryDate, setExpiryDate] = React.useState("");
  const [manufacturingDate, setManufacturingDate] = React.useState("");

  // Piece-level (always present)
  const [pieceBarcode, setPieceBarcode] = React.useState("");
  const [pieceCostPrice, setPieceCostPrice] = React.useState("");
  const [pieceSalePrice, setPieceSalePrice] = React.useState("");
  const [pieceWholesalePrice, setPieceWholesalePrice] = React.useState("");
  const [pieceShopkeeperPrice, setPieceShopkeeperPrice] = React.useState("");
  const [pieceMinStock, setPieceMinStock] = React.useState("");
  const [pieceStock, setPieceStock] = React.useState("");

  // Box-level (optional — only used if boxBarcode is filled)
  const [boxBarcode, setBoxBarcode] = React.useState("");
  const [piecesPerBox, setPiecesPerBox] = React.useState("");
  const [boxQty, setBoxQty] = React.useState("");
  const [boxCostPrice, setBoxCostPrice] = React.useState("");
  const [boxSalePrice, setBoxSalePrice] = React.useState("");
  const [boxWholesalePrice, setBoxWholesalePrice] = React.useState("");
  const [boxShopkeeperPrice, setBoxShopkeeperPrice] = React.useState("");

  // Derived values.
  // CRITICAL: cost/piece = boxCost / piecesPerBox (NOT divided by totalPieces).
  const hasBox = boxBarcode.trim().length > 0;
  const totalPieces = (Number(piecesPerBox) || 0) * (Number(boxQty) || 0);
  const autoPieceCost = (Number(piecesPerBox) || 0) > 0 ? (Number(boxCostPrice) || 0) / (Number(piecesPerBox) || 0) : 0;
  const autoPieceSale = (Number(piecesPerBox) || 0) > 0 ? (Number(boxSalePrice) || 0) / (Number(piecesPerBox) || 0) : 0;
  const autoPieceWholesale = (Number(piecesPerBox) || 0) > 0 ? (Number(boxWholesalePrice) || 0) / (Number(piecesPerBox) || 0) : 0;
  const autoPieceShopkeeper = (Number(piecesPerBox) || 0) > 0 ? (Number(boxShopkeeperPrice) || 0) / (Number(piecesPerBox) || 0) : 0;

  function reset() {
    setName(""); setCategoryId("");
    setImage(null); setExpiryDate(""); setManufacturingDate("");
    setPieceBarcode(""); setPieceCostPrice(""); setPieceSalePrice("");
    setPieceWholesalePrice(""); setPieceShopkeeperPrice(""); setPieceMinStock(""); setPieceStock("");
    setBoxBarcode(""); setPiecesPerBox(""); setBoxQty("");
    setBoxCostPrice(""); setBoxSalePrice(""); setBoxWholesalePrice(""); setBoxShopkeeperPrice("");
    setEditId(null);
  }

  // Pre-fill for edit mode
  React.useEffect(() => {
    if (!open) { const t = setTimeout(reset, 200); return () => clearTimeout(t); }
    if (open && editProduct) {
      setEditId(editProduct.id);
      setName(editProduct.name);
      setCategoryId(editProduct.categoryId || "");
      setImage(editProduct.image || null);
      setExpiryDate(editProduct.expiryDate ? new Date(editProduct.expiryDate).toISOString().slice(0, 10) : "");
      setManufacturingDate(editProduct.manufacturingDate ? new Date(editProduct.manufacturingDate).toISOString().slice(0, 10) : "");

      // Piece-level fields (always present)
      setPieceBarcode(editProduct.barcode || "");
      setPieceCostPrice(editProduct.costPrice ? editProduct.costPrice.toString() : "");
      setPieceSalePrice(editProduct.salePrice ? editProduct.salePrice.toString() : "");
      setPieceWholesalePrice((editProduct.wholesalePrice || 0).toString());
      setPieceShopkeeperPrice((editProduct.shopkeeperPrice || 0).toString());
      setPieceMinStock((editProduct.minStock || 0).toString());
      setPieceStock(editProduct.stock ? editProduct.stock.toString() : "");

      // Box-level fields (only if the product was saved with a packBarcode)
      if (editProduct.packBarcode) {
        setBoxBarcode(editProduct.packBarcode);
        setPiecesPerBox((editProduct.packQuantity || 0).toString());
        setBoxQty(
          editProduct.stock > 0 && editProduct.packQuantity > 0
            ? Math.floor(editProduct.stock / editProduct.packQuantity).toString()
            : ""
        );
        // Reconstruct box prices from per-piece prices × piecesPerBox
        const ppq = editProduct.packQuantity || 1;
        setBoxCostPrice((editProduct.costPrice * ppq).toFixed(2));
        setBoxSalePrice((editProduct.packPrice || editProduct.salePrice * ppq).toFixed(2));
        setBoxWholesalePrice((editProduct.packWholesalePrice || editProduct.wholesalePrice * ppq).toFixed(2));
        setBoxShopkeeperPrice((editProduct.packShopkeeperPrice || editProduct.shopkeeperPrice * ppq).toFixed(2));
      } else {
        setBoxBarcode("");
        setPiecesPerBox("");
        setBoxQty("");
        setBoxCostPrice("");
        setBoxSalePrice("");
        setBoxWholesalePrice("");
        setBoxShopkeeperPrice("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editProduct]);

  // Auto-fill piece prices from box prices when box fields change.
  // Only fires while box fields are being edited (hasBox = true).
  const lastBoxSig = React.useRef("");
  React.useEffect(() => {
    if (!hasBox) return;
    const sig = `${boxCostPrice}|${boxSalePrice}|${boxWholesalePrice}|${boxShopkeeperPrice}|${piecesPerBox}|${boxQty}`;
    if (sig === lastBoxSig.current) return;
    lastBoxSig.current = sig;
    if (autoPieceCost > 0) setPieceCostPrice(autoPieceCost.toFixed(2));
    if (autoPieceSale > 0) setPieceSalePrice(autoPieceSale.toFixed(2));
    if (autoPieceWholesale > 0) setPieceWholesalePrice(autoPieceWholesale.toFixed(2));
    if (autoPieceShopkeeper > 0) setPieceShopkeeperPrice(autoPieceShopkeeper.toFixed(2));
    // Auto-fill piece stock from boxes × pieces per box
    if (totalPieces > 0) setPieceStock(totalPieces.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxCostPrice, boxSalePrice, boxWholesalePrice, boxShopkeeperPrice, piecesPerBox, boxQty, hasBox, totalPieces]);

  async function saveProducts() {
    if (!name.trim()) {
      toast.error("Product name is required");
      return;
    }
    if (!pieceBarcode.trim()) {
      toast.error("Piece barcode is required");
      return;
    }
    if (Number(pieceSalePrice) <= 0 && !(hasBox && Number(boxSalePrice) > 0)) {
      toast.error("Sale price is required");
      return;
    }
    setSaving(true);
    try {
      // Determine effective per-piece prices.
      const effPieceCost = Number(pieceCostPrice) || autoPieceCost || 0;
      const effPieceSale = Number(pieceSalePrice) || autoPieceSale || 0;
      const effPieceWholesale = Number(pieceWholesalePrice) || autoPieceWholesale || 0;
      const effPieceShopkeeper = Number(pieceShopkeeperPrice) || autoPieceShopkeeper || 0;
      // Stock is always in pieces. If box details are filled, use totalPieces
      // (boxes × pieces per box). Otherwise use the manually entered piece stock.
      const stockPieces = totalPieces > 0 ? totalPieces : (Number(pieceStock) || 0);

      const body = {
        name: name.trim(),
        barcode: pieceBarcode.trim(),
        categoryId: categoryId || null,
        costPrice: effPieceCost,
        salePrice: effPieceSale,
        wholesalePrice: effPieceWholesale,
        shopkeeperPrice: effPieceShopkeeper,
        unit: "piece",
        stock: stockPieces,
        minStock: Number(pieceMinStock) || 0,
        expiryDate: expiryDate || null,
        manufacturingDate: manufacturingDate || null,
        hasBarcode: true,
        active: true,
        image,
        // Box fields — only meaningful when boxBarcode is provided.
        packBarcode: boxBarcode.trim() || null,
        packQuantity: Number(piecesPerBox) || 0,
        packPrice: Number(boxSalePrice) || 0,
        packWholesalePrice: Number(boxWholesalePrice) || 0,
        packShopkeeperPrice: Number(boxShopkeeperPrice) || 0,
      };
      const url = editId ? `/api/products/${editId}` : "/api/products";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || "Failed to save";
        if (msg.toLowerCase().includes("box barcode")) {
          toast.error("This box barcode already exists! Use a different barcode.");
        } else if (msg.toLowerCase().includes("barcode")) {
          toast.error("This barcode already exists! Use a different barcode.");
        } else {
          toast.error(msg);
        }
        setSaving(false); return;
      }
      toast.success(editId ? "Product updated!" : `${name} added!`);
      onDone();
      onOpenChange(false);
    } catch { toast.error("Network error"); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editId ? "Edit Product" : "Add Product"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Section 1: Name + Category */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Product Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Biscuit, Sugar, Oil" autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Section 2: Box Details (optional) */}
          <div className="rounded-lg border-2 border-amber-200 bg-amber-50/40 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-600" />
              <Label className="font-bold text-amber-800">Box Details (optional)</Label>
            </div>
            <div className="text-xs text-amber-700">Fill this only if the product comes in a box/bag. Leave empty for simple piece products.</div>
            <div className="space-y-2">
              <Label>Box Barcode</Label>
              <Input value={boxBarcode} onChange={(e) => setBoxBarcode(e.target.value)} placeholder="Scan box barcode (leave empty if no box)" data-barcode-input="true" className="text-left" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2"><Label>Pieces per Box</Label><Input type="number" value={piecesPerBox} onChange={(e) => setPiecesPerBox(e.target.value)} placeholder="e.g. 12" className="text-left" /></div>
              <div className="space-y-2"><Label>Number of Boxes</Label><Input type="number" value={boxQty} onChange={(e) => setBoxQty(e.target.value)} placeholder="e.g. 10" className="text-left" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2"><Label>Box Cost Price</Label><Input type="number" value={boxCostPrice} onChange={(e) => setBoxCostPrice(e.target.value)} placeholder="0" className="text-left" /></div>
              <div className="space-y-2"><Label>Box Sale Price</Label><Input type="number" value={boxSalePrice} onChange={(e) => setBoxSalePrice(e.target.value)} placeholder="0" className="text-left" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2"><Label>Box Wholesale Price</Label><Input type="number" value={boxWholesalePrice} onChange={(e) => setBoxWholesalePrice(e.target.value)} placeholder="0" className="text-left" /></div>
              <div className="space-y-2"><Label>Box Shopkeeper Price</Label><Input type="number" value={boxShopkeeperPrice} onChange={(e) => setBoxShopkeeperPrice(e.target.value)} placeholder="0" className="text-left" /></div>
            </div>
            {totalPieces > 0 && (
              <div className="rounded bg-amber-100 p-2 text-center text-sm font-bold text-amber-900">
                Total Stock: {boxQty || 0} boxes × {piecesPerBox || 0} pcs = {totalPieces} pieces
              </div>
            )}
          </div>

          {/* Section 3: Piece Details (always required) */}
          <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-600" />
              <Label className="font-bold text-emerald-800">Piece Details {hasBox ? "(auto-calculated)" : ""}</Label>
            </div>
            <div className="space-y-2">
              <Label>Piece Barcode *</Label>
              <Input value={pieceBarcode} onChange={(e) => setPieceBarcode(e.target.value)} placeholder="Scan or type piece barcode" data-barcode-input="true" className="text-left" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2"><Label>Cost / Piece</Label><Input type="number" value={pieceCostPrice} onChange={(e) => setPieceCostPrice(e.target.value)} placeholder={autoPieceCost ? autoPieceCost.toFixed(2) : "0"} className="text-left" /></div>
              <div className="space-y-2"><Label>Sale Price / Piece *</Label><Input type="number" value={pieceSalePrice} onChange={(e) => setPieceSalePrice(e.target.value)} placeholder={autoPieceSale ? autoPieceSale.toFixed(2) : "0"} className="text-left" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2"><Label>Wholesale / Piece</Label><Input type="number" value={pieceWholesalePrice} onChange={(e) => setPieceWholesalePrice(e.target.value)} placeholder={autoPieceWholesale ? autoPieceWholesale.toFixed(2) : "0"} className="text-left" /></div>
              <div className="space-y-2"><Label>Shopkeeper / Piece</Label><Input type="number" value={pieceShopkeeperPrice} onChange={(e) => setPieceShopkeeperPrice(e.target.value)} placeholder={autoPieceShopkeeper ? autoPieceShopkeeper.toFixed(2) : "0"} className="text-left" /></div>
            </div>
            {hasBox && <div className="text-xs text-emerald-700">Piece prices auto-calculated from box ÷ pieces. You can override by typing your own value.</div>}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Stock (pieces)</Label>
                <Input
                  type="number"
                  value={hasBox ? (totalPieces > 0 ? totalPieces.toString() : "") : pieceStock}
                  onChange={(e) => { if (!hasBox) setPieceStock(e.target.value); }}
                  placeholder={hasBox ? "Auto: boxes × pieces" : "0"}
                  readOnly={hasBox}
                  className={`text-left ${hasBox ? "bg-muted cursor-not-allowed" : ""}`}
                />
                {hasBox && totalPieces > 0 && (
                  <div className="text-xs text-emerald-600">Auto: {boxQty || 0} boxes × {piecesPerBox || 0} = {totalPieces} pcs</div>
                )}
              </div>
              <div className="space-y-2"><Label>Low Stock Alert</Label><Input type="number" value={pieceMinStock} onChange={(e) => setPieceMinStock(e.target.value)} placeholder="0" className="text-left" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2"><Label>Manufacturing Date</Label><Input type="date" value={manufacturingDate} onChange={(e) => setManufacturingDate(e.target.value)} className="text-left" /></div>
              <div className="space-y-2"><Label>Expiry Date</Label><Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="text-left" /></div>
            </div>
          </div>

          {/* Section 4: Image (optional) */}
          <ImageUpload value={image} onChange={setImage} label="Product Image (optional)" />

          <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={saving || !name.trim() || !pieceBarcode.trim()} onClick={saveProducts}>
            {saving ? "Saving..." : editId ? "Update Product" : "Save Product"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
