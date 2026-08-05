"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  Warehouse,
  Package,
  ArrowRightLeft,
  ArrowDownToLine,
  Search,
  RefreshCw,
  Boxes,
  Store,
  TrendingUp,
  AlertTriangle,
  Barcode as BarcodeIcon,
  ShoppingCart,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatMoney, unitLabel } from "@/lib/pos-utils";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import type { Product } from "@/types";

type StoreProduct = Omit<Product, "category"> & {
  category?: { name: string } | null;
};

interface StoreTransaction {
  id: string;
  productId: string;
  product?: { name: string } | null;
  productName?: string;
  type: "INCOMING" | "TRANSFER" | "ADJUSTMENT";
  quantity: number;
  note: string | null;
  createdAt: string;
}

interface StoreResponse {
  products: StoreProduct[];
  transactions: StoreTransaction[];
}

interface SummaryCardProps {
  title: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  loading: boolean;
  accent?: "emerald" | "amber" | "slate" | "rose";
}

const SUMMARY_ACCENT: Record<
  NonNullable<SummaryCardProps["accent"]>,
  { wrap: string; iconBg: string; iconColor: string; value: string }
> = {
  emerald: {
    wrap: "border-emerald-200/60 dark:border-emerald-900/40",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
    iconColor: "text-emerald-700 dark:text-emerald-300",
    value: "text-emerald-700 dark:text-emerald-300",
  },
  amber: {
    wrap: "border-amber-200/60 dark:border-amber-900/40",
    iconBg: "bg-amber-100 dark:bg-amber-900/40",
    iconColor: "text-amber-700 dark:text-amber-300",
    value: "text-amber-700 dark:text-amber-300",
  },
  rose: {
    wrap: "border-rose-200/60 dark:border-rose-900/40",
    iconBg: "bg-rose-100 dark:bg-rose-900/40",
    iconColor: "text-rose-700 dark:text-rose-300",
    value: "text-rose-700 dark:text-rose-300",
  },
  slate: {
    wrap: "border-slate-200/60 dark:border-slate-800/60",
    iconBg: "bg-slate-100 dark:bg-slate-800/60",
    iconColor: "text-slate-700 dark:text-slate-300",
    value: "text-slate-800 dark:text-slate-100",
  },
};

function SummaryCard({
  title,
  value,
  hint,
  icon,
  loading,
  accent = "emerald",
}: SummaryCardProps) {
  const a = SUMMARY_ACCENT[accent];
  return (
    <Card className={a.wrap}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-28" />
            ) : (
              <p className={`mt-2 text-2xl font-bold ${a.value}`}>{value}</p>
            )}
            {hint && (
              <p className="mt-1 text-xs text-muted-foreground truncate">
                {hint}
              </p>
            )}
          </div>
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${a.iconBg} ${a.iconColor}`}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type DialogMode =
  | { kind: "receive"; product: StoreProduct }
  | { kind: "transfer"; product: StoreProduct }
  | null;

const TYPE_BADGE: Record<
  StoreTransaction["type"],
  { label: string; className: string }
> = {
  INCOMING: {
    label: "Incoming",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300",
  },
  TRANSFER: {
    label: "Transfer",
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300",
  },
  ADJUSTMENT: {
    label: "Adjustment",
    className:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300",
  },
};

export function StoreView() {
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [storeProducts, setStoreProducts] = React.useState<StoreProduct[]>([]);
  const [transactions, setTransactions] = React.useState<StoreTransaction[]>(
    []
  );
  const [settings, setSettings] = React.useState<{
    currency: string;
    shopName: string;
  } | null>(null);
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState<"inventory" | "history">("inventory");
  const [dialog, setDialog] = React.useState<DialogMode>(null);
  const [quantity, setQuantity] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Box Purchase dialog state
  const [boxPurchaseOpen, setBoxPurchaseOpen] = React.useState(false);
  const [boxPurchaseBarcode, setBoxPurchaseBarcode] = React.useState("");
  const [boxPurchaseCount, setBoxPurchaseCount] = React.useState("");
  const [boxPurchasePrice, setBoxPurchasePrice] = React.useState("");
  const [boxPurchaseExpiry, setBoxPurchaseExpiry] = React.useState("");
  const [boxPurchaseNote, setBoxPurchaseNote] = React.useState("");
  const [boxPurchaseLookup, setBoxPurchaseLookup] = React.useState<any>(null);
  const [boxPurchaseLooking, setBoxPurchaseLooking] = React.useState(false);
  const [boxPurchaseSaving, setBoxPurchaseSaving] = React.useState(false);

  // ─── GLOBAL BARCODE SCANNER ─────────────────────────────────────────────
  // When ANY barcode is scanned on the Main Store page (regardless of focus),
  // open the Box Purchase dialog, fill the barcode, and auto-lookup the product.
  // This shows the product's previous cost price + expiry date so the user
  // can quickly confirm or change them before recording the purchase.
  const handleStoreScan = React.useCallback((code: string) => {
    // Open the purchase dialog if not already open
    if (!boxPurchaseOpen) {
      setBoxPurchaseOpen(true);
    }
    // Set the barcode and trigger lookup
    setBoxPurchaseBarcode(code);
    // Defer lookup so state updates first
    setTimeout(() => {
      lookupBoxBarcodeWithCode(code);
    }, 100);
  }, [boxPurchaseOpen]);

  useBarcodeScanner(handleStoreScan);

  // Lookup variant that accepts a code directly (for scanner)
  async function lookupBoxBarcodeWithCode(code: string) {
    if (!code) return;
    setBoxPurchaseLooking(true);
    setBoxPurchaseLookup(null);
    try {
      const res = await fetch(`/api/products?barcode=${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = await res.json();
      const p = data.products?.[0];
      if (!p) {
        toast.error("No product found with this barcode — add it first in Products");
        setBoxPurchaseLooking(false);
        return;
      }
      setBoxPurchaseLookup(p);
      // Pre-fill previous purchase price + expiry date
      if (p.costPrice > 0) setBoxPurchasePrice(p.costPrice.toString());
      if (p.expiryDate) {
        setBoxPurchaseExpiry(new Date(p.expiryDate).toISOString().slice(0, 10));
      }
      setBoxPurchaseCount("");
      setBoxPurchaseNote("");

      const isBox = !!p.packBarcode && p.packQuantity > 0;
      if (isBox) {
        toast.success(`Found: ${p.name} (Box — ${p.packQuantity} pcs per box)`);
      } else {
        toast.success(`Found: ${p.name} (Piece product)`);
      }
    } catch {
      toast.error("Failed to look up barcode");
    } finally {
      setBoxPurchaseLooking(false);
    }
  }

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    if (silent) setRefreshing(true);
    try {
      const [storeRes, settingsRes] = await Promise.all([
        fetch("/api/store", { cache: "no-store" }),
        fetch("/api/settings", { cache: "no-store" }),
      ]);
      const storeData = (await storeRes.json()) as StoreResponse;
      const settingsData = await settingsRes.json();
      setStoreProducts(storeData.products || []);
      setTransactions(storeData.transactions || []);
      setSettings(settingsData.settings || null);
    } catch {
      toast.error("Failed to load store data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const currency = settings?.currency || "Rs";

  const filteredProducts = React.useMemo(() => {
    if (!q.trim()) return storeProducts;
    const term = q.toLowerCase();
    return storeProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.barcode?.toLowerCase().includes(term)
    );
  }, [storeProducts, q]);

  const totalStoreItems = storeProducts.reduce(
    (s, p) => s + (p.storeStock || 0),
    0
  );
  const totalShopItems = storeProducts.reduce((s, p) => s + (p.stock || 0), 0);
  const lowStoreStock = storeProducts.filter(
    (p) => (p.storeStock || 0) <= (p.minStock || 0)
  ).length;
  const totalStoreValue = storeProducts.reduce(
    (s, p) => s + (p.storeStock || 0) * (p.costPrice || 0),
    0
  );

  function openReceive(product: StoreProduct) {
    setDialog({ kind: "receive", product });
    setQuantity("");
    setNote("");
  }

  function openTransfer(product: StoreProduct) {
    if ((product.storeStock || 0) <= 0) {
      toast.error("No stock in store to transfer");
      return;
    }
    setDialog({ kind: "transfer", product });
    setQuantity("");
    setNote("");
  }

  async function handleSubmit() {
    if (!dialog) return;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    if (dialog.kind === "transfer" && qty > (dialog.product.storeStock || 0)) {
      toast.error(
        `Only ${dialog.product.storeStock} available in store stock`
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: dialog.product.id,
          quantity: qty,
          type: dialog.kind === "receive" ? "INCOMING" : "TRANSFER",
          note: note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save transaction");
        setSaving(false);
        return;
      }
      toast.success(
        dialog.kind === "receive"
          ? `Received ${qty} ${unitLabel(dialog.product.unit)} of ${dialog.product.name}`
          : `Transferred ${qty} ${unitLabel(dialog.product.unit)} to shop`
      );
      setDialog(null);
      await load(true);
    } catch {
      toast.error("Failed to save transaction");
    } finally {
      setSaving(false);
    }
  }

  // ─── Box/Piece Purchase handlers ────────────────────────────────────────
  // When the user scans a barcode in Main Store, we look up the product.
  // If it's a BOX product (has packBarcode), we ask for box count.
  // If it's a PIECE product (no packBarcode), we ask for piece count.
  // In both cases, we pre-fill the previous purchase price + expiry date
  // so the user can quickly confirm or change them.
  async function lookupBoxBarcode() {
    const code = boxPurchaseBarcode.trim();
    if (!code) return;
    setBoxPurchaseLooking(true);
    setBoxPurchaseLookup(null);
    try {
      const res = await fetch(`/api/products?barcode=${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = await res.json();
      const p = data.products?.[0];
      if (!p) {
        toast.error("No product found with this barcode");
        setBoxPurchaseLooking(false);
        return;
      }
      // Accept BOTH box products and piece products
      // A box product has packBarcode set (links to piece product)
      // A piece product has no packBarcode (standalone)
      setBoxPurchaseLookup(p);
      // Pre-fill previous purchase price + expiry date
      if (p.costPrice > 0) setBoxPurchasePrice(p.costPrice.toString());
      if (p.expiryDate) {
        setBoxPurchaseExpiry(new Date(p.expiryDate).toISOString().slice(0, 10));
      }
      setBoxPurchaseCount("");
      setBoxPurchaseNote("");

      // Show appropriate message based on product type
      const isBox = !!p.packBarcode && p.packQuantity > 0;
      if (isBox) {
        toast.success(`Found: ${p.name} (Box — ${p.packQuantity} pcs per box)`);
      } else {
        toast.success(`Found: ${p.name} (Piece product)`);
      }
    } catch {
      toast.error("Failed to look up barcode");
    } finally {
      setBoxPurchaseLooking(false);
    }
  }

  async function handleBoxPurchaseSave() {
    if (!boxPurchaseLookup) {
      toast.error("Look up a barcode first");
      return;
    }
    const count = Number(boxPurchaseCount);
    if (!count || count <= 0) {
      toast.error("Enter a valid count");
      return;
    }

    const isBox = !!boxPurchaseLookup.packBarcode && boxPurchaseLookup.packQuantity > 0;

    setBoxPurchaseSaving(true);
    try {
      if (isBox) {
        // ─── BOX PURCHASE ─────────────────────────────────────────────────
        // Use the box-purchase API which handles both box + piece stock
        const res = await fetch("/api/stock/box-purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            barcode: boxPurchaseBarcode.trim(),
            boxCount: count,
            purchasePrice: boxPurchasePrice || undefined,
            expiryDate: boxPurchaseExpiry || undefined,
            note: boxPurchaseNote.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Failed to record purchase");
          setBoxPurchaseSaving(false);
          return;
        }
        const totalPieces = count * (boxPurchaseLookup.packQuantity || 0);
        // Show whether prices were auto-recalculated
        if (data.pricesRecalculated) {
          toast.success(
            `Purchase recorded: ${count} boxes × ${boxPurchaseLookup.packQuantity} pcs = ${totalPieces} pieces\n` +
            `Prices auto-adjusted: Sale Rs ${data.newBoxSalePrice} | Wholesale Rs ${data.newBoxWholesalePrice} | Shopkeeper Rs ${data.newBoxShopkeeperPrice}`
          );
        } else {
          toast.success(
            `Purchase recorded: ${count} boxes × ${boxPurchaseLookup.packQuantity} pcs = ${totalPieces} pieces added`
          );
        }
      } else {
        // ─── PIECE PURCHASE ───────────────────────────────────────────────
        // Use the regular stock API to add pieces directly
        const res = await fetch("/api/stock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: boxPurchaseLookup.id,
            quantity: count,
            type: "PURCHASE",
            note: boxPurchaseNote.trim() || `Purchase: ${count} pieces`,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Failed to record purchase");
          setBoxPurchaseSaving(false);
          return;
        }

        // Also update cost price + expiry if changed
        if (boxPurchasePrice && Number(boxPurchasePrice) !== boxPurchaseLookup.costPrice) {
          await fetch(`/api/products/${boxPurchaseLookup.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: boxPurchaseLookup.name,
              barcode: boxPurchaseLookup.barcode,
              costPrice: Number(boxPurchasePrice),
              expiryDate: boxPurchaseExpiry || null,
              categoryId: boxPurchaseLookup.categoryId || null,
              unit: boxPurchaseLookup.unit || "piece",
              stock: boxPurchaseLookup.stock + count,
              minStock: boxPurchaseLookup.minStock || 0,
              taxRate: boxPurchaseLookup.taxRate || 0,
              hasBarcode: true,
              active: true,
            }),
          });
        }

        toast.success(`Purchase recorded: ${count} pieces added`);
      }

      // Reset & close
      setBoxPurchaseOpen(false);
      setBoxPurchaseBarcode("");
      setBoxPurchaseCount("");
      setBoxPurchasePrice("");
      setBoxPurchaseExpiry("");
      setBoxPurchaseNote("");
      setBoxPurchaseLookup(null);
      await load(true);
    } catch {
      toast.error("Network error");
    } finally {
      setBoxPurchaseSaving(false);
    }
  }

  function openBoxPurchase() {
    setBoxPurchaseBarcode("");
    setBoxPurchaseCount("");
    setBoxPurchasePrice("");
    setBoxPurchaseExpiry("");
    setBoxPurchaseNote("");
    setBoxPurchaseLookup(null);
    setBoxPurchaseOpen(true);
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <Warehouse className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">Main Store</h1>
            <p className="text-sm text-muted-foreground">
              Two-warehouse inventory: store (back) & shop (front) — receive
              goods and transfer stock between them.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            size="sm"
            onClick={openBoxPurchase}
          >
            <BarcodeIcon className="h-4 w-4 mr-1.5" />
            Receive Stock
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing}
            className="self-start sm:self-auto"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total Store Items"
          value={totalStoreItems.toLocaleString("en-PK")}
          hint="Back warehouse stock"
          icon={<Boxes className="h-5 w-5" />}
          loading={loading}
          accent="emerald"
        />
        <SummaryCard
          title="Total Shop Items"
          value={totalShopItems.toLocaleString("en-PK")}
          hint="Front shop stock"
          icon={<Store className="h-5 w-5" />}
          loading={loading}
          accent="slate"
        />
        <SummaryCard
          title="Low Store Stock"
          value={lowStoreStock.toLocaleString("en-PK")}
          hint={
            lowStoreStock === 0
              ? "All stocked"
              : "Items at or below minimum"
          }
          icon={<AlertTriangle className="h-5 w-5" />}
          loading={loading}
          accent={lowStoreStock === 0 ? "emerald" : "amber"}
        />
        <SummaryCard
          title="Total Store Value"
          value={formatMoney(totalStoreValue, currency)}
          hint="At cost price"
          icon={<TrendingUp className="h-5 w-5" />}
          loading={loading}
          accent="emerald"
        />
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "inventory" | "history")}
      >
        <TabsList>
          <TabsTrigger value="inventory">
            <Package className="h-4 w-4" />
            Store Inventory
          </TabsTrigger>
          <TabsTrigger value="history">
            <ArrowRightLeft className="h-4 w-4" />
            Transaction History
          </TabsTrigger>
        </TabsList>

        {/* Inventory tab */}
        <TabsContent value="inventory" className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or barcode..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-16">Unit</TableHead>
                      <TableHead className="text-right">Store Stock</TableHead>
                      <TableHead className="text-right">Shop Stock</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Store Value</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 8 }).map((__, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-5 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : filteredProducts.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="h-32 text-center text-muted-foreground"
                        >
                          No products found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProducts.map((p) => {
                        const total = (p.storeStock || 0) + (p.stock || 0);
                        const storeValue =
                          (p.storeStock || 0) * (p.costPrice || 0);
                        const lowStore =
                          (p.storeStock || 0) <= (p.minStock || 0) &&
                          (p.minStock || 0) > 0;
                        return (
                          <TableRow key={p.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                  <Package className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">
                                    {p.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {p.barcode || "—"}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {unitLabel(p.unit)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <span
                                className={
                                  lowStore
                                    ? "font-semibold text-amber-700 dark:text-amber-400"
                                    : "font-medium"
                                }
                              >
                                {p.storeStock ?? 0}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="font-medium">
                                {p.stock ?? 0}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {total}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {formatMoney(p.costPrice || 0, currency)}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-400">
                              {formatMoney(storeValue, currency)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => openReceive(p)}
                                >
                                  <ArrowDownToLine className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">
                                    Receive
                                  </span>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900/50 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                                  onClick={() => openTransfer(p)}
                                  disabled={(p.storeStock || 0) <= 0}
                                >
                                  <ArrowRightLeft className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">
                                    Transfer
                                  </span>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Store Transactions</CardTitle>
              <CardDescription>
                Receive and transfer history — most recent first
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[32rem] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 5 }).map((__, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-5 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : transactions.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="h-32 text-center text-muted-foreground"
                        >
                          No transactions yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.map((t) => {
                        const badge = TYPE_BADGE[t.type] || TYPE_BADGE.ADJUSTMENT;
                        const name =
                          t.product?.name ||
                          t.productName ||
                          "Unknown product";
                        return (
                          <TableRow key={t.id}>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {format(new Date(t.createdAt), "MMM d, yyyy")}
                              <span className="ml-1 text-xs">
                                {format(new Date(t.createdAt), "h:mm a")}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">
                              {name}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-xs ${badge.className}`}
                              >
                                {badge.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="font-semibold">
                                {t.type === "INCOMING" ? "+" : ""}
                                {t.quantity}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                              {t.note || "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Receive / Transfer dialog */}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === "receive"
                ? "Receive Goods"
                : "Transfer to Shop"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.product && (
                <>
                  Product:{" "}
                  <span className="font-medium text-foreground">
                    {dialog.product.name}
                  </span>{" "}
                  ({unitLabel(dialog.product.unit)})
                  {dialog.kind === "transfer" && (
                    <>
                      {" "}
                      • Available in store:{" "}
                      <span className="font-medium text-foreground">
                        {dialog.product.storeStock}
                      </span>
                    </>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="qty">
                Quantity{" "}
                <span className="text-muted-foreground">
                  ({dialog?.product && unitLabel(dialog.product.unit)})
                </span>
              </Label>
              <Input
                id="qty"
                type="number"
                min="1"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                autoFocus
              />
              {dialog?.kind === "transfer" && (
                <p className="text-xs text-muted-foreground">
                  Max transferable:{" "}
                  <span className="font-medium">
                    {dialog.product.storeStock}{" "}
                    {unitLabel(dialog.product.unit)}
                  </span>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note">Note (optional)</Label>
              <Input
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  dialog?.kind === "receive"
                    ? "e.g. PO #1234, Supplier invoice"
                    : "e.g. Shelf restock"
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialog(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving || !quantity}
              className={
                dialog?.kind === "receive"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-amber-600 text-white hover:bg-amber-700"
              }
            >
              {saving ? "Saving..." : dialog?.kind === "receive" ? "Receive" : "Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Box Purchase Dialog ───────────────────────────────────────────────
          Scan a box barcode → look up the box product → pre-fill previous
          purchase price + expiry date → enter box count → auto-divide into
          pieces. Both the box product and the linked piece product get
          their stock incremented. */}
      <Dialog open={boxPurchaseOpen} onOpenChange={setBoxPurchaseOpen}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <BarcodeIcon className="h-5 w-5 text-emerald-600" />
              Receive Stock — اسٹاک وصول
            </DialogTitle>
            <DialogDescription>
              Scan a product barcode to record a new purchase. The system
              automatically detects if it's a box or piece product and asks
              for the appropriate count. Previous cost price and expiry date
              are pre-filled for quick confirmation.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
            {/* Step 1: Scan box barcode */}
            <div className="space-y-2">
              <Label>Box Barcode *</Label>
              <div className="flex gap-2">
                <Input
                  value={boxPurchaseBarcode}
                  onChange={(e) => setBoxPurchaseBarcode(e.target.value)}
                  placeholder="Scan or type box barcode"
                  data-barcode-input="true"
                  className="flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      lookupBoxBarcode();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={lookupBoxBarcode}
                  disabled={boxPurchaseLooking || !boxPurchaseBarcode.trim()}
                >
                  {boxPurchaseLooking ? "..." : "Look up"}
                </Button>
              </div>
            </div>

            {/* Step 2: After lookup — show product info + ask for details */}
            {boxPurchaseLookup && (
              <div className="space-y-3 border-t pt-3">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-1">
                  <div className="font-bold text-emerald-900">{boxPurchaseLookup.name}</div>
                  <div className="text-xs text-emerald-700">
                    {boxPurchaseLookup.packBarcode && boxPurchaseLookup.packQuantity > 0 ? (
                      <>Box product — <strong>{boxPurchaseLookup.packQuantity}</strong> pcs per box • Current box stock: <strong>{boxPurchaseLookup.stock}</strong></>
                    ) : (
                      <>Piece product • Current stock: <strong>{boxPurchaseLookup.stock}</strong> pcs</>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>
                      {boxPurchaseLookup.packBarcode && boxPurchaseLookup.packQuantity > 0
                        ? "Number of Boxes *"
                        : "Number of Pieces *"}
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={boxPurchaseCount}
                      onChange={(e) => setBoxPurchaseCount(e.target.value)}
                      placeholder={boxPurchaseLookup.packBarcode && boxPurchaseLookup.packQuantity > 0 ? "e.g. 10" : "e.g. 50"}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {boxPurchaseLookup.packBarcode && boxPurchaseLookup.packQuantity > 0
                        ? "Purchase Price / Box"
                        : "Purchase Price / Piece"}
                    </Label>
                    <Input
                      type="number"
                      value={boxPurchasePrice}
                      onChange={(e) => setBoxPurchasePrice(e.target.value)}
                      placeholder="0 (previous price shown)"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Previous: Rs {boxPurchaseLookup.costPrice || 0}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Expiry Date</Label>
                  <Input
                    type="date"
                    value={boxPurchaseExpiry}
                    onChange={(e) => setBoxPurchaseExpiry(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {boxPurchaseLookup.expiryDate
                      ? `Previous: ${new Date(boxPurchaseLookup.expiryDate).toISOString().slice(0, 10)}`
                      : "No previous expiry date"}
                  </p>
                </div>

                {boxPurchaseCount && Number(boxPurchaseCount) > 0 && (
                  <div className="rounded bg-amber-100 border border-amber-300 p-2 text-center text-sm font-bold text-amber-900">
                    {boxPurchaseLookup.packBarcode && boxPurchaseLookup.packQuantity > 0 ? (
                      <>{boxPurchaseCount} boxes × {boxPurchaseLookup.packQuantity} pcs = {" "}
                      <span className="text-base">
                        {Number(boxPurchaseCount) * boxPurchaseLookup.packQuantity}
                      </span>{" "}
                      pieces total</>
                    ) : (
                      <>{boxPurchaseCount} pieces total</>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Note (optional)</Label>
                  <Input
                    value={boxPurchaseNote}
                    onChange={(e) => setBoxPurchaseNote(e.target.value)}
                    placeholder="e.g. Supplier invoice #, batch number"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-shrink-0 border-t pt-3 mt-2 bg-background">
            <Button
              variant="outline"
              onClick={() => setBoxPurchaseOpen(false)}
              disabled={boxPurchaseSaving}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={handleBoxPurchaseSave}
              disabled={boxPurchaseSaving || !boxPurchaseLookup || !boxPurchaseCount}
            >
              {boxPurchaseSaving ? "Saving..." : "Record Purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
