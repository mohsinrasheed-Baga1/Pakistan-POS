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
  // Filter mode: "all" | "lowStock" | "expiry"
  // When set to "lowStock", only products with stock <= minStock are shown.
  // When set to "expiry", only products with expiry within 30 days (or expired) are shown.
  const [filterMode, setFilterMode] = React.useState<"all" | "lowStock" | "expiry">("all");
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
    // Always open the wizard for editing — regardless of whether this is a
    // piece product or a box product. The wizard handles both cases:
    //   - If p.packBarcode is set → user opened the BOX product; the wizard
    //     loads both box and piece info.
    //   - If p.packBarcode is null → user opened the PIECE product; the
    //     wizard loads just piece info. If the piece has a linked box
    //     (some other product has packBarcode === p.barcode), the wizard
    //     will also load the box info so the user can edit both together.
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
          <Button
            variant={filterMode === "lowStock" ? "default" : "outline"}
            className={filterMode === "lowStock" ? "bg-amber-600 hover:bg-amber-700 text-white" : "border-amber-300 text-amber-700"}
            onClick={() => {
              if (filterMode === "lowStock") {
                setFilterMode("all");
              } else {
                setFilterMode("lowStock");
                setActiveCat("all");
                setQ("");
              }
            }}
          >
            <AlertTriangle className="w-4 h-4 mr-2" /> Low Stock
          </Button>
          <Button
            variant={filterMode === "expiry" ? "default" : "outline"}
            className={filterMode === "expiry" ? "bg-rose-600 hover:bg-rose-700 text-white" : "border-rose-300 text-rose-700"}
            onClick={() => {
              if (filterMode === "expiry") {
                setFilterMode("all");
              } else {
                setFilterMode("expiry");
                setActiveCat("all");
                setQ("");
              }
            }}
          >
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
          {(() => {
            // Apply client-side filtering based on filterMode
            const filteredProducts = products.filter((p) => {
              if (filterMode === "lowStock") {
                return p.stock <= (p.minStock || 0);
              }
              if (filterMode === "expiry") {
                if (!p.expiryDate) return false;
                const d = new Date(p.expiryDate);
                if (isNaN(d.getTime())) return false;
                const now = new Date();
                const diffMs = d.getTime() - now.getTime();
                const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                return days <= 30; // expired or expiring within 30 days
              }
              return true; // "all" — no filtering
            });

            if (loading) {
              return (
                <div className="p-8 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-12 rounded bg-muted animate-pulse" />
                  ))}
                </div>
              );
            }
            if (filteredProducts.length === 0) {
              return (
                <div className="py-12 text-center text-muted-foreground">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  {filterMode === "lowStock"
                    ? "No low-stock products found"
                    : filterMode === "expiry"
                    ? "No products expiring within 30 days"
                    : "No products found"}
                </div>
              );
            }
            return (
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
                    {filteredProducts.map((p) => (
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
            );
          })()}
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
                    height={60}
                    width={2}
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
    if (!product) return;
    const win = window.open("", "_blank", "width=600,height=600");
    if (!win) {
      toast.error("Pop-up blocked. Please allow pop-ups to print.");
      return;
    }

    // ─── PROFESSIONAL BARCODE STICKER PRINT (v3) ───────────────────────
    // FIX v3: Even smaller barcode to ensure NOTHING is cut off.
    // The EAN-13 barcode has 113 modules. At width=1.5, that's 170px natural
    // width. The 50mm sticker has ~47mm usable width = ~178px at 96dpi.
    // So width=1.5 fits naturally without any scaling needed.
    //
    // Key changes from v2:
    // - width=1.5 (was 2) — smaller natural SVG, fits without scaling
    // - height=40 (was 50) — shorter barcode
    // - fontSize=9 (was 11) — smaller text below bars
    // - margin=2 (was 4) — smaller quiet zone
    // - max-height: 14mm (was 17mm) — ensures barcode fits in 30mm sticker
    // - SVG width:auto instead of 100% — let it use natural size, centered

    const bcValue = product!.barcode;
    const bcName = (product!.name || "").replace(/'/g, "\\'");

    const stickers = Array.from({ length: count }, (_, i) => i).map(i => `
      <div class="sticker">
        <div class="shop-name">${(shopName || "My Shop").replace(/'/g, "\\'")}</div>
        <div class="barcode-wrap">
          <svg class="barcode-svg" id="svg${i}" xmlns="http://www.w3.org/2000/svg"></svg>
        </div>
        <div class="product-name">${bcName}</div>
      </div>`).join("");

    win.document.write(`
      <html dir="ltr"><head><title>Sticker ${bcName}</title>
      <style>
        @page { size: 50mm 30mm; margin: 0; }
        html, body {
          margin: 0; padding: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        * { box-sizing: border-box; }
        .sticker {
          width: 50mm;
          height: 30mm;
          padding: 1mm 2mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          font-family: Tahoma, Arial, sans-serif;
          color: #000;
          background: #fff;
          text-align: center;
          overflow: hidden;
          page-break-after: always;
          page-break-inside: avoid;
        }
        .sticker:last-child { page-break-after: auto; }
        .shop-name {
          font-size: 8px;
          font-weight: bold;
          line-height: 1;
          width: 100%;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #000;
        }
        .barcode-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        /* SVG uses natural size (auto), centered in container.
           max-width:100% ensures it never exceeds sticker width.
           This is safer than width:100% which could stretch the bars. */
        .barcode-wrap svg {
          display: block;
          max-width: 100%;
          max-height: 14mm;
          width: auto;
          height: auto;
        }
        .product-name {
          font-size: 7px;
          font-weight: bold;
          line-height: 1;
          width: 100%;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          color: #000;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .sticker { page-break-after: always; }
          .barcode-wrap svg { max-width: 100%; max-height: 14mm; }
        }
      </style></head>
      <body>
        ${stickers}
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
        <script>
          function renderBarcodes(format) {
            var svgs = document.querySelectorAll('.barcode-svg');
            svgs.forEach(function(svg) {
              try {
                JsBarcode(svg, '${bcValue}', {
                  format: format,
                  width: 1.5,
                  height: 40,
                  displayValue: true,
                  fontSize: 9,
                  font: 'monospace',
                  fontOptions: 'bold',
                  margin: 2,
                  marginTop: 0,
                  marginBottom: 0,
                  textMargin: 1,
                  background: '#ffffff',
                  lineColor: '#000000',
                });
              } catch (e) {
                console.error('barcode render error', e);
              }
            });
          }
          try {
            renderBarcodes('EAN13');
          } catch (e) {
            try { renderBarcodes('CODE128'); } catch (e2) { console.error('all barcode attempts failed', e2); }
          }
          window.onload = function () {
            setTimeout(function () {
              window.focus();
              window.print();
              setTimeout(function () { window.close(); }, 400);
            }, 700);
          };
        </script>
      </body></html>
    `);
    win.document.close();
    win.focus();
  }

  // Inline sticker style — 50mm × 35mm, content distributed with
  // space-between so there's no empty gap at the bottom.
  const stickerStyle: React.CSSProperties = {
    width: "50mm",
    height: "35mm",
    border: "1px dashed #d1d5db",
    padding: "2mm",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-evenly",
    color: "#000",
    background: "#fff",
    textAlign: "center",
    overflow: "hidden",
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Print Barcode Sticker</DialogTitle>
        </DialogHeader>
        {/* Scrollable sticker preview area — page itself never moves */}
        <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
          <div className="text-center text-xs text-muted-foreground">
            Sticker size: 50mm × 35mm. Shop name (top, with padding) — Barcode + digits (middle) —
            Product name (bottom, larger font).
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
                    fontSize: "9px",
                    fontWeight: "bold",
                    lineHeight: 1.1,
                    width: "100%",
                    padding: "0 1mm",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {shopName || "My Shop"}
                </div>
                {/* MIDDLE — barcode (EAN-13, natural size, scanner-safe) */}
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
                    format="EAN13"
                    height={60}
                    width={2}
                    displayValue={true}
                    fontSize={11}
                    margin={10}
                  />
                </div>
                {/* BOTTOM — product name */}
                <div
                  className="product-name"
                  style={{
                    fontSize: "9px",
                    fontWeight: "bold",
                    lineHeight: 1.1,
                    width: "100%",
                    padding: "0 1mm",
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as any,
                  }}
                >
                  {product.name}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Sticky footer — always visible regardless of sticker count */}
        <DialogFooter className="flex-shrink-0 border-t pt-3 mt-2 bg-background">
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
// Product Wizard — SINGLE FORM (no step picker)
// Layout: Product Name → Box Details → Piece Details (auto-calc)
// If box is filled → saves Box + linked Piece product
// If only piece → saves Piece product only
// Edit always opens this same form
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

  // Piece info
  const [pieceBarcode, setPieceBarcode] = React.useState("");
  const [pieceBarcodeAuto, setPieceBarcodeAuto] = React.useState(false);
  const [pieceCostPrice, setPieceCostPrice] = React.useState("");
  const [pieceSalePrice, setPieceSalePrice] = React.useState("");
  const [pieceWholesalePrice, setPieceWholesalePrice] = React.useState("");
  const [pieceShopkeeperPrice, setPieceShopkeeperPrice] = React.useState("");
  const [pieceStock, setPieceStock] = React.useState("");
  const [pieceMinStock, setPieceMinStock] = React.useState("");

  // Box info
  const [boxBarcode, setBoxBarcode] = React.useState("");
  const [boxBarcodeAuto, setBoxBarcodeAuto] = React.useState(false);
  const [piecesPerBox, setPiecesPerBox] = React.useState("");
  const [boxQty, setBoxQty] = React.useState("");
  const [boxCostPrice, setBoxCostPrice] = React.useState("");
  const [boxSalePrice, setBoxSalePrice] = React.useState("");
  const [boxWholesalePrice, setBoxWholesalePrice] = React.useState("");
  const [boxShopkeeperPrice, setBoxShopkeeperPrice] = React.useState("");

  // ─── AUTO-CALCULATION ──────────────────────────────────────────────────
  // Per-piece price = box price ÷ piecesPerBox
  //   Example: box cost = Rs 50, 6 pieces per box → Rs 50 ÷ 6 = Rs 8.33/piece
  // Total pieces (for stock) = piecesPerBox × boxQty
  //   Example: 6 pcs/box × 10 boxes = 60 pieces total
  const piecesPerBoxNum = Number(piecesPerBox) || 0;
  const boxQtyNum = Number(boxQty) || 0;
  const totalPieces = piecesPerBoxNum * boxQtyNum;
  const autoPieceCost = piecesPerBoxNum > 0 ? (Number(boxCostPrice) || 0) / piecesPerBoxNum : 0;
  const autoPieceSale = piecesPerBoxNum > 0 ? (Number(boxSalePrice) || 0) / piecesPerBoxNum : 0;
  const autoPieceWholesale = piecesPerBoxNum > 0 ? (Number(boxWholesalePrice) || 0) / piecesPerBoxNum : 0;
  const autoPieceShopkeeper = piecesPerBoxNum > 0 ? (Number(boxShopkeeperPrice) || 0) / piecesPerBoxNum : 0;

  // "hasBox" = user filled in box details (pieces per box > 0)
  const hasBox = piecesPerBoxNum > 0 && (boxBarcode.trim() !== "" || boxBarcodeAuto);

  // Generate an EAN-13 barcode when the user toggles "auto" on.
  // EAN-13 requires exactly 13 digits: 12 data digits + 1 checksum digit.
  // Prefix "200" (3 digits) for pieces, "210" (3 digits) for boxes.
  // 3 prefix + 9 random = 12 digits, then + 1 checksum = 13 digits total.
  function genBarcode(prefix: string): string {
    let base = prefix;  // "200" or "210" = 3 digits
    for (let i = 0; i < 9; i++) {
      base += Math.floor(Math.random() * 10).toString();
    }
    // base now has exactly 12 digits. Compute EAN-13 checksum (13th digit).
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const d = parseInt(base[i], 10);
      sum += i % 2 === 0 ? d : d * 3;
    }
    const check = (10 - (sum % 10)) % 10;
    return base + check.toString(); // 13 digits, EAN-13 compatible
  }

  function reset() {
    setName(""); setCategoryId("");
    setImage(null); setExpiryDate(""); setManufacturingDate("");
    setPieceBarcode(""); setPieceBarcodeAuto(false);
    setPieceCostPrice(""); setPieceSalePrice(""); setPieceWholesalePrice(""); setPieceShopkeeperPrice("");
    setPieceStock(""); setPieceMinStock("");
    setBoxBarcode(""); setBoxBarcodeAuto(false);
    setPiecesPerBox(""); setBoxQty("");
    setBoxCostPrice(""); setBoxSalePrice(""); setBoxWholesalePrice(""); setBoxShopkeeperPrice("");
    setEditId(null);
    // Reset user-edited flags so auto-calc works again on next open
    userEdited.current = { cost: false, sale: false, ws: false, sk: false };
  }

  React.useEffect(() => {
    if (!open) { const t = setTimeout(reset, 200); return () => clearTimeout(t); }
    if (open && editProduct) {
      setEditId(editProduct.id);
      setName(editProduct.name);
      setCategoryId(editProduct.categoryId || "");
      setImage(editProduct.image || null);
      setExpiryDate(editProduct.expiryDate ? new Date(editProduct.expiryDate).toISOString().slice(0, 10) : "");
      setManufacturingDate(editProduct.manufacturingDate ? new Date(editProduct.manufacturingDate).toISOString().slice(0, 10) : "");

      if (editProduct.packBarcode) {
        // ─── User opened a BOX product ─────────────────────────────────────
        // Load box info from editProduct, and piece info from the linked
        // piece product (found by barcode === packBarcode).
        setBoxBarcode(editProduct.barcode);
        setBoxCostPrice(editProduct.costPrice.toString());
        setBoxSalePrice(editProduct.salePrice.toString());
        setBoxWholesalePrice((editProduct.wholesalePrice || 0).toString());
        setBoxShopkeeperPrice((editProduct.shopkeeperPrice || 0).toString());
        setPiecesPerBox((editProduct.packQuantity || 0).toString());
        setBoxQty(editProduct.stock > 0 ? editProduct.stock.toString() : "");

        fetch(`/api/products?barcode=${encodeURIComponent(editProduct.packBarcode)}`, { cache: "no-store" })
          .then(r => r.json())
          .then(d => {
            const p = d.products?.[0];
            if (p) {
              setPieceBarcode(p.barcode);
              setPieceCostPrice(p.costPrice?.toString() || "");
              setPieceSalePrice(p.salePrice?.toString() || "");
              setPieceWholesalePrice((p.wholesalePrice || 0).toString());
              setPieceShopkeeperPrice((p.shopkeeperPrice || 0).toString());
              setPieceStock(p.stock?.toString() || "");
              setPieceMinStock(p.minStock?.toString() || "");
            } else {
              setPieceBarcode(editProduct.packBarcode || "");
            }
          })
          .catch(() => setPieceBarcode(editProduct.packBarcode || ""));
      } else {
        // ─── User opened a PIECE product ───────────────────────────────────
        // Load piece info, and check if there's a linked box.
        setPieceBarcode(editProduct.barcode);
        setPieceCostPrice(editProduct.costPrice.toString());
        setPieceSalePrice(editProduct.salePrice.toString());
        setPieceWholesalePrice((editProduct.wholesalePrice || 0).toString());
        setPieceShopkeeperPrice((editProduct.shopkeeperPrice || 0).toString());
        setPieceStock(editProduct.stock.toString());
        setPieceMinStock(editProduct.minStock.toString());

        fetch("/api/products", { cache: "no-store" })
          .then(r => r.json())
          .then(d => {
            const box = (d.products || []).find((p: any) => p.packBarcode === editProduct.barcode);
            if (box) {
              setBoxBarcode(box.barcode);
              setBoxCostPrice(box.costPrice?.toString() || "");
              setBoxSalePrice(box.salePrice?.toString() || "");
              setBoxWholesalePrice((box.wholesalePrice || 0).toString());
              setBoxShopkeeperPrice((box.shopkeeperPrice || 0).toString());
              setPiecesPerBox((box.packQuantity || 0).toString());
              setBoxQty(box.stock > 0 ? box.stock.toString() : "");
            }
          })
          .catch(() => {});
      }
    }
  }, [open, editProduct]);

  // Auto-fill piece prices from box prices.
  //
  // We track whether the user has MANUALLY edited each piece price field.
  // If they haven't, we always update from auto-calc. If they have, we
  // leave their value alone. This is more reliable than comparing rounded
  // string values to unrounded numbers (which was the old buggy approach
  // that caused auto-calc to stop updating when piecesPerBox changed).
  const userEdited = React.useRef({ cost: false, sale: false, ws: false, sk: false });

  // Reset userEdited flags when the wizard opens fresh (not editing)
  React.useEffect(() => {
    if (open && !editProduct) {
      userEdited.current = { cost: false, sale: false, ws: false, sk: false };
    }
  }, [open, editProduct]);

  React.useEffect(() => {
    if (piecesPerBoxNum > 0 && hasBox) {
      // Only auto-fill if the user hasn't manually edited this field
      if (!userEdited.current.cost) {
        setPieceCostPrice(autoPieceCost ? autoPieceCost.toFixed(2) : "");
      }
      if (!userEdited.current.sale) {
        setPieceSalePrice(autoPieceSale ? autoPieceSale.toFixed(2) : "");
      }
      if (!userEdited.current.ws) {
        setPieceWholesalePrice(autoPieceWholesale ? autoPieceWholesale.toFixed(2) : "");
      }
      if (!userEdited.current.sk) {
        setPieceShopkeeperPrice(autoPieceShopkeeper ? autoPieceShopkeeper.toFixed(2) : "");
      }
    }
  }, [boxSalePrice, boxCostPrice, boxWholesalePrice, boxShopkeeperPrice, piecesPerBoxNum, hasBox, autoPieceCost, autoPieceSale, autoPieceWholesale, autoPieceShopkeeper]);

  async function saveProducts() {
    setSaving(true);
    try {
      // Resolve auto-generated barcodes
      const finalPieceBarcode = pieceBarcode.trim() || (pieceBarcodeAuto ? genBarcode("200") : "");
      const finalBoxBarcode = boxBarcode.trim() || (boxBarcodeAuto ? genBarcode("210") : "");

      if (!finalPieceBarcode) {
        toast.error("Piece barcode is required (or enable auto-generate)");
        setSaving(false); return;
      }
      if (!name.trim()) {
        toast.error("Product name is required");
        setSaving(false); return;
      }

      // Determine if this is a box product (pieces per box > 0 AND box barcode provided)
      const isBox = hasBox && (finalBoxBarcode !== "");

      // ─── Build PIECE product body ──────────────────────────────────────────
      // If box: piece stock = totalPieces (boxQty × piecesPerBox)
      //         piece prices = auto-calculated (or user override)
      // If piece only: piece stock = user-entered pieceStock
      //                piece prices = user-entered
      const pieceStockValue = isBox ? totalPieces : (Number(pieceStock) || 0);
      const pieceBody = {
        name, barcode: finalPieceBarcode, categoryId: categoryId || null,
        costPrice: isBox ? (Number(pieceCostPrice) || autoPieceCost) : Number(pieceCostPrice) || 0,
        salePrice: isBox ? (Number(pieceSalePrice) || autoPieceSale) : Number(pieceSalePrice) || 0,
        wholesalePrice: isBox ? (Number(pieceWholesalePrice) || autoPieceWholesale) : Number(pieceWholesalePrice) || 0,
        shopkeeperPrice: isBox ? (Number(pieceShopkeeperPrice) || autoPieceShopkeeper) : Number(pieceShopkeeperPrice) || 0,
        unit: "piece", stock: pieceStockValue,
        minStock: Number(pieceMinStock) || 0,
        expiryDate: expiryDate || null,
        manufacturingDate: manufacturingDate || null,
        hasBarcode: true, active: true, image,
      };

      // ─── Build BOX product body (only if box) ──────────────────────────────
      const boxBody = isBox ? {
        name: `${name} (Box)`, barcode: finalBoxBarcode, categoryId: categoryId || null,
        costPrice: Number(boxCostPrice) || 0, salePrice: Number(boxSalePrice) || 0,
        wholesalePrice: Number(boxWholesalePrice) || 0, shopkeeperPrice: Number(boxShopkeeperPrice) || 0,
        unit: "piece", stock: Number(boxQty) || 0,
        minStock: Number(pieceMinStock) || 0,
        expiryDate: expiryDate || null, manufacturingDate: manufacturingDate || null,
        hasBarcode: true, active: true, image,
        packBarcode: finalPieceBarcode, packQuantity: Number(piecesPerBox) || 0, packPrice: Number(boxSalePrice) || 0,
      } : null;

      if (editId && editProduct) {
        // ─── EDIT MODE ─────────────────────────────────────────────────────
        if (editProduct.packBarcode) {
          // User opened BOX product (editId = box product id)
          // 1. Find & update linked piece product
          const lookupRes = await fetch(`/api/products?barcode=${encodeURIComponent(editProduct.packBarcode)}`, { cache: "no-store" });
          const lookupData = await lookupRes.json();
          const pieceProd = lookupData.products?.[0];
          if (pieceProd) {
            const pieceRes = await fetch(`/api/products/${pieceProd.id}`, {
              method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pieceBody),
            });
            if (!pieceRes.ok) {
              const d = await pieceRes.json();
              toast.error(d.error || "Failed to update piece");
              setSaving(false); return;
            }
          } else {
            await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pieceBody) });
          }
          // 2. Update box product (editId)
          if (boxBody) {
            const boxRes = await fetch(`/api/products/${editId}`, {
              method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(boxBody),
            });
            if (!boxRes.ok) {
              const d = await boxRes.json();
              toast.warning(`Piece updated, Box: ${d.error}`);
            } else {
              toast.success(`${name} updated! Box + Piece saved.`);
            }
          } else {
            toast.success(`${name} updated!`);
          }
        } else {
          // User opened PIECE product (editId = piece product id)
          // 1. Update piece (editId)
          const pieceRes = await fetch(`/api/products/${editId}`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pieceBody),
          });
          if (!pieceRes.ok) {
            const d = await pieceRes.json();
            toast.error(d.error || "Failed");
            setSaving(false); return;
          }
          // 2. If box info filled, find & update linked box (or create new)
          if (boxBody) {
            const allProdsRes = await fetch("/api/products", { cache: "no-store" });
            const allData = await allProdsRes.json();
            const boxProd = (allData.products || []).find((p: any) => p.packBarcode === editProduct.barcode);
            if (boxProd) {
              const boxRes = await fetch(`/api/products/${boxProd.id}`, {
                method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(boxBody),
              });
              if (!boxRes.ok) { const d = await boxRes.json(); toast.warning(`Piece updated, Box: ${d.error}`); }
              else { toast.success(`${name} updated! Box + Piece saved.`); }
            } else {
              const newBoxRes = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(boxBody) });
              if (newBoxRes.ok) toast.success(`${name} updated! New box created.`);
              else toast.success(`${name} piece updated (box creation failed).`);
            }
          } else {
            toast.success(`${name} updated!`);
          }
        }
      } else {
        // ─── CREATE MODE ───────────────────────────────────────────────────
        // 1. Create piece product
        const pieceRes = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pieceBody) });
        if (!pieceRes.ok) {
          const d = await pieceRes.json();
          toast.error(d.error || "Failed");
          setSaving(false); return;
        }
        // 2. If box, create box product
        if (boxBody) {
          const boxRes = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(boxBody) });
          if (!boxRes.ok) { const d = await boxRes.json(); toast.warning(`Piece saved! Box: ${d.error}`); }
          else toast.success(`${name} added! Box + Piece saved.`);
        } else {
          toast.success(`${name} added!`);
        }
      }
      onDone();
      onOpenChange(false);
    } catch { toast.error("Network error"); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{editId ? "Edit Product" : "Add Product"}</DialogTitle>
        </DialogHeader>

        {/* SINGLE FORM — all sections visible together */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">

          {/* ─── 1. Product Name ─── */}
          <div className="space-y-2">
            <Label>Product Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lemon Biscuit, Sugar" autoFocus />
          </div>

          {/* ─── 2. Category ─── */}
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

          {/* ─── 3. Box Details (optional — leave empty if not sold by box) ─── */}
          <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-600" />
              <Label className="font-bold text-amber-800">Box Details</Label>
              <span className="text-xs text-muted-foreground ml-auto">— leave empty if not sold by box</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Pieces per Box</Label>
                <Input type="number" value={piecesPerBox} onChange={(e) => setPiecesPerBox(e.target.value)} placeholder="e.g. 6" className="text-left" />
              </div>
              <div className="space-y-2">
                <Label>Number of Boxes</Label>
                <Input type="number" value={boxQty} onChange={(e) => setBoxQty(e.target.value)} placeholder="e.g. 10" className="text-left" />
              </div>
            </div>

            {/* Box Barcode with Auto toggle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Box Barcode</Label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input type="checkbox" checked={boxBarcodeAuto} onChange={(e) => { setBoxBarcodeAuto(e.target.checked); if (e.target.checked) setBoxBarcode(""); }} className="rounded" />
                  <span className="text-amber-700">Auto-generate (EAN-13)</span>
                </label>
              </div>
              <Input
                value={boxBarcodeAuto ? (boxBarcode || "(will auto-generate)") : boxBarcode}
                onChange={(e) => setBoxBarcode(e.target.value)}
                placeholder={boxBarcodeAuto ? "Auto-generated on save" : "Scan box barcode"}
                data-barcode-input="true"
                className="text-left"
                disabled={boxBarcodeAuto}
                readOnly={boxBarcodeAuto}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Box Cost Price</Label>
                <Input type="number" value={boxCostPrice} onChange={(e) => setBoxCostPrice(e.target.value)} placeholder="0" className="text-left" />
              </div>
              <div className="space-y-2">
                <Label>Box Sale Price (Regular)</Label>
                <Input type="number" value={boxSalePrice} onChange={(e) => setBoxSalePrice(e.target.value)} placeholder="0" className="text-left" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2"><Label>Box Wholesale</Label><Input type="number" value={boxWholesalePrice} onChange={(e) => setBoxWholesalePrice(e.target.value)} placeholder="0" className="text-left" /></div>
              <div className="space-y-2"><Label>Box Shopkeeper</Label><Input type="number" value={boxShopkeeperPrice} onChange={(e) => setBoxShopkeeperPrice(e.target.value)} placeholder="0" className="text-left" /></div>
            </div>

            {/* Total pieces summary */}
            {totalPieces > 0 && (
              <div className="rounded bg-amber-200 p-2 text-center text-base font-bold text-amber-900">
                Total: {boxQty || 0} boxes × {piecesPerBox || 0} pcs = <span className="text-lg">{totalPieces}</span> pieces
              </div>
            )}
          </div>

          {/* ─── 4. Piece Barcode ─── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Piece Barcode *</Label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={pieceBarcodeAuto} onChange={(e) => { setPieceBarcodeAuto(e.target.checked); if (e.target.checked) setPieceBarcode(""); }} className="rounded" />
                <span className="text-emerald-700">Auto-generate (EAN-13)</span>
              </label>
            </div>
            <Input
              value={pieceBarcodeAuto ? (pieceBarcode || "(will auto-generate)") : pieceBarcode}
              onChange={(e) => setPieceBarcode(e.target.value)}
              placeholder={pieceBarcodeAuto ? "Auto-generated on save" : "Scan or type piece barcode"}
              data-barcode-input="true"
              className="text-left"
              disabled={pieceBarcodeAuto}
              readOnly={pieceBarcodeAuto}
            />
          </div>

          {/* ─── 5. Piece Details (auto-calculated from box if box is filled) ─── */}
          <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-600" />
              <Label className="font-bold text-emerald-800">Piece Details</Label>
              {hasBox && (
                <span className="text-xs text-emerald-700 ml-auto">auto-calculated from box</span>
              )}
            </div>

            {/* Show calculation formula when box is filled */}
            {hasBox && piecesPerBoxNum > 0 && (
              <div className="rounded bg-emerald-100 border border-emerald-300 p-2 text-xs text-emerald-800 space-y-0.5">
                {Number(boxCostPrice) > 0 && (
                  <div>Cost: Rs {boxCostPrice} ÷ {piecesPerBox} pcs = <strong>Rs {autoPieceCost.toFixed(2)}/piece</strong></div>
                )}
                {Number(boxSalePrice) > 0 && (
                  <div>Sale: Rs {boxSalePrice} ÷ {piecesPerBox} pcs = <strong>Rs {autoPieceSale.toFixed(2)}/piece</strong></div>
                )}
                {Number(boxWholesalePrice) > 0 && (
                  <div>Wholesale: Rs {boxWholesalePrice} ÷ {piecesPerBox} pcs = <strong>Rs {autoPieceWholesale.toFixed(2)}/piece</strong></div>
                )}
                {Number(boxShopkeeperPrice) > 0 && (
                  <div>Shopkeeper: Rs {boxShopkeeperPrice} ÷ {piecesPerBox} pcs = <strong>Rs {autoPieceShopkeeper.toFixed(2)}/piece</strong></div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Cost Price / Piece</Label>
                <Input type="number" value={pieceCostPrice} onChange={(e) => { userEdited.current.cost = true; setPieceCostPrice(e.target.value); }} placeholder="0" className="text-left bg-emerald-100/70 font-medium" />
              </div>
              <div className="space-y-2">
                <Label>Sale Price (Regular) / Piece *</Label>
                <Input type="number" value={pieceSalePrice} onChange={(e) => { userEdited.current.sale = true; setPieceSalePrice(e.target.value); }} placeholder="0" className="text-left bg-emerald-100/70 font-medium" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Wholesale Price / Piece</Label>
                <Input type="number" value={pieceWholesalePrice} onChange={(e) => { userEdited.current.ws = true; setPieceWholesalePrice(e.target.value); }} placeholder="0" className="text-left bg-emerald-100/70 font-medium" />
              </div>
              <div className="space-y-2">
                <Label>Shopkeeper Price / Piece</Label>
                <Input type="number" value={pieceShopkeeperPrice} onChange={(e) => { userEdited.current.sk = true; setPieceShopkeeperPrice(e.target.value); }} placeholder="0" className="text-left bg-emerald-100/70 font-medium" />
              </div>
            </div>

            {/* Total Stock (auto from boxes, or manual) + Low Stock Alert */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Total Stock (pieces)</Label>
                <Input
                  type="number"
                  value={totalPieces > 0 ? totalPieces.toString() : pieceStock}
                  onChange={(e) => setPieceStock(e.target.value)}
                  placeholder="0"
                  className="text-left bg-muted"
                  readOnly={totalPieces > 0}
                />
                {totalPieces > 0 && <div className="text-[10px] text-amber-700">Auto from boxes</div>}
              </div>
              <div className="space-y-2">
                <Label>Low Stock Alert</Label>
                <Input type="number" value={pieceMinStock} onChange={(e) => setPieceMinStock(e.target.value)} placeholder="0" className="text-left" />
              </div>
            </div>
          </div>

          {/* ─── 6. Dates ─── */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2"><Label>Manufacturing Date</Label><Input type="date" value={manufacturingDate} onChange={(e) => setManufacturingDate(e.target.value)} className="text-left" /></div>
            <div className="space-y-2"><Label>Expiry Date</Label><Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="text-left" /></div>
          </div>

          {/* ─── 7. Image ─── */}
          <ImageUpload value={image} onChange={setImage} label="Product Image" />
        </div>

        {/* Sticky footer */}
        <div className="flex gap-2 flex-shrink-0 border-t pt-3 mt-2 bg-background">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            disabled={saving || (!pieceBarcode.trim() && !pieceBarcodeAuto) || !name.trim()}
            onClick={saveProducts}
          >
            {saving ? "Saving..." : editId ? "Update" : "Add Product"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
