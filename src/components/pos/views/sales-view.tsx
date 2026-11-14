"use client";

import * as React from "react";
import {
  Receipt,
  Search,
  Eye,
  Calendar,
  TrendingUp,
  Wallet,
  RefreshCw,
  RotateCcw,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatMoney, aggressiveRadixCleanup } from "@/lib/pos-utils";
import { Receipt as ReceiptComponent } from "@/components/pos/receipt";
import { useCartStore, useAppStore } from "@/stores/use-pos-store";
import type { Sale } from "@/types";

export function SalesView() {
  const [sales, setSales] = React.useState<Sale[]>([]);
  const [settings, setSettings] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  // v2.10.133: Direct cart + view access for Edit Sale
  const cart = useCartStore();
  const { setView } = useAppStore();
  const [q, setQ] = React.useState("");
  const [todayOnly, setTodayOnly] = React.useState(true);
  // Custom date filter — allows selecting any specific date
  const [customDate, setCustomDate] = React.useState<string>("");
  const [selected, setSelected] = React.useState<Sale | null>(null);
  const [receiptOpen, setReceiptOpen] = React.useState(false);
  // v2.10.99: Flag to enable Edit button on receipt from Sales History
  const [canEdit, setCanEdit] = React.useState(false);
  const [returnTarget, setReturnTarget] = React.useState<Sale | null>(null);
  const [returnReason, setReturnReason] = React.useState("");
  const [returnSubmitting, setReturnSubmitting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (customDate) {
        params.set("date", customDate);
      } else if (todayOnly) {
        params.set("today", "true");
      }
      params.set("limit", "200");
      const res = await fetch(`/api/sales?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      let list: Sale[] = data.sales || [];
      if (q) {
        list = list.filter(
          (s) =>
            s.invoiceNo.toLowerCase().includes(q.toLowerCase()) ||
            s.customerName?.toLowerCase().includes(q.toLowerCase())
        );
      }
      setSales(list);
    } catch {
      toast.error("Failed to load sales");
    } finally {
      setLoading(false);
    }
  }, [todayOnly, customDate, q]);

  React.useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSettings(d.settings))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // v2.10.104: Debounced auto-search — when user types in search box,
  // results filter automatically after 200ms (no need to press Enter).
  // The `load` function already includes `q` as a dependency, but the
  // useCallback wraps it. This explicit debounce ensures smooth UX.
  React.useEffect(() => {
    const t = setTimeout(() => {
      load();
    }, 200);
    return () => clearTimeout(t);
  }, [q, load]);

  // v2.10.108: FIX — Returns were being counted as positive revenue.
  // The Sale fetch returns ALL sales including RETURNED ones, so summing
  // x.total over all of them adds RETURNED sales' totals (the user
  // complained that returns are "added not subtracted").
  // Fix: count COMPLETED sales POSITIVELY, RETURNED/PARTIAL_RETURN
  // NEGATIVELY. Net revenue = gross - returns.
  //
  // v2.10.109: CRITICAL FIX — User reported negative cash in hand &
  // weird profit numbers. v2.10.108's `totalRevenue = grossRevenue -
  // returnsTotal` was DOUBLE-COUNTING returns (grossRevenue already
  // excludes RETURNED sales because we filter to COMPLETED only).
  // Fix:
  //   - totalRevenue = grossRevenue (returns already excluded)
  //   - Keep returnsTotal as informational display only
  const completedSales = sales.filter(s => s.status === "COMPLETED");
  const returnedSales = sales.filter(s => s.status === "RETURNED" || s.status === "PARTIAL_RETURN");
  const grossRevenue = completedSales.reduce((s, x) => s + x.total, 0);
  const returnsTotal = returnedSales.reduce((s, x) => s + x.total, 0);
  const totalRevenue = grossRevenue; // v2.10.109: returns already excluded
  const totalItems = completedSales.reduce(
    (s, x) => s + x.items.reduce((c, i) => c + i.quantity, 0),
    0
  );
  const currency = settings?.currency || "Rs";

  function viewReceipt(sale: Sale) {
    setSelected(sale);
    setCanEdit(false);  // v2.10.99: Reset edit flag
    setReceiptOpen(true);
  }

  function openReturnDialog(sale: Sale) {
    setReturnTarget(sale);
    setReturnReason("");
  }

  function closeReturnDialog() {
    setReturnTarget(null);
    setReturnReason("");
  }

  async function handleConfirmReturn() {
    if (!returnTarget) return;
    setReturnSubmitting(true);
    try {
      const res = await fetch(`/api/sales/${returnTarget.id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: returnReason.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to return sale");
      }
      toast.success("Sale returned successfully");
      closeReturnDialog();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to return sale");
    } finally {
      setReturnSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="w-6 h-6 text-emerald-600" />
            Sales History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Record and details of all invoices
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="border-emerald-100">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Wallet className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Sales</div>
              <div className="text-lg font-bold text-emerald-700">
                {loading ? "..." : formatMoney(totalRevenue, currency)}
              </div>
              {/* v2.10.109: Show returns count as informational only
                  (returns are already excluded from totalRevenue because
                  we filter to status="COMPLETED" — this is just to inform
                  the user how many returns happened in this view) */}
              {!loading && returnsTotal > 0 && (
                <div className="text-[10px] text-rose-600 mt-0.5">
                  {returnedSales.length} return(s) — Rs {returnsTotal.toLocaleString()} (excluded)
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center">
              <Receipt className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Invoice Count</div>
              <div className="text-lg font-bold">
                {loading ? "..." : sales.length}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Items Sold</div>
              <div className="text-lg font-bold">
                {loading ? "..." : totalItems}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          {/* v2.10.104: Auto-search with debounce — typing invoice number
              immediately filters results without needing to press Enter.
              User: "جب بھی سچ کرں تو رسید نمبر پورا لکھتے ہی فورا رسید
              ہسٹری نکل انی چاہیے" (when searching, as soon as invoice number
              is typed, receipt history should appear immediately) */}
          <Input
            placeholder="Invoice number or customer name... (auto-search)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                load();
              }
            }}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1 items-center">
          <Button
            variant={todayOnly && !customDate ? "default" : "outline"}
            className={todayOnly && !customDate ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            onClick={() => { setTodayOnly(true); setCustomDate(""); }}
          >
            <Calendar className="w-4 h-4 mr-2" /> Today
          </Button>
          <Button
            variant={!todayOnly && !customDate ? "default" : "outline"}
            className={!todayOnly && !customDate ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            onClick={() => { setTodayOnly(false); setCustomDate(""); }}
          >
            All
          </Button>
          {/* Custom date picker — select any specific date */}
          <input
            type="date"
            value={customDate}
            onChange={(e) => { setCustomDate(e.target.value); setTodayOnly(false); }}
            className="h-9 rounded-md border px-2 text-sm"
            title="Select custom date"
          />
          {customDate && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCustomDate("")}
              title="Clear date filter"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sales.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
              No sales found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Cashier</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">
                        {s.invoiceNo}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(s.createdAt).toLocaleString("en-US", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell>{s.customerName || "Walk-in"}</TableCell>
                      <TableCell className="text-xs">{s.user?.name || "-"}</TableCell>
                      <TableCell className="text-right">
                        {s.items.length}
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-700">
                        {formatMoney(s.total, currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {s.paymentMethod === "CASH"
                            ? "Cash"
                            : s.paymentMethod === "CARD"
                            ? "Card"
                            : "Mobile"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {s.status === "RETURNED" ? (
                          <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
                            Returned
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                            Completed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => viewReceipt(s)}
                            aria-label="View receipt"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {/* v2.10.99: Edit button in Sales History — allows
                              editing any past bill. Clicks through to receipt
                              dialog where the Edit button can be used to load
                              items back into cart for editing. */}
                          {s.status === "COMPLETED" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              onClick={() => {
                                // Open receipt with Edit option enabled
                                viewReceipt(s);
                                // Set a flag so the receipt shows the Edit button
                                setCanEdit(true);
                              }}
                              aria-label="Edit sale"
                              title="Edit sale — edit bill"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {s.status === "COMPLETED" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              onClick={() => openReturnDialog(s)}
                              aria-label="Return sale"
                              title="Return / Refund"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
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

      {/* v2.10.99: Pass onEdit callback so the Edit button shows on the receipt.
          When clicked, it navigates to POS with the sale loaded in cart for editing. */}
      <ReceiptComponent
        sale={selected}
        settings={settings}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        onEdit={canEdit ? async (sale: any) => {
          // v2.10.133: CRITICAL FIX — was using broken localStorage +
          // CustomEvent approach that POS view NEVER listened to.
          // Now directly loads items into cart + navigates to POS,
          // same pattern as cards-view.tsx editSaleFromCard.
          if (!sale?.id) return;

          // Close receipt IMMEDIATELY
          setReceiptOpen(false);
          setSelected(null);
          setCanEdit(false);

          // v2.10.143: Use shared aggressiveRadixCleanup utility
          //   User: "اکثر اسی طرح سیم پرانا مسئلہ بھی شو کر دیتا ہے"
          aggressiveRadixCleanup();

          toast.info("Loading sale for editing...");

          try {
            // 1. Return the original sale
            const returnRes = await fetch(`/api/sales/${sale.id}/return`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason: "Editing sale — returned for re-checkout", itemIds: [] }),
            });
            if (!returnRes.ok) {
              const d = await returnRes.json();
              toast.error(d.error || "Failed to return sale");
              return;
            }

            // 2. Clear cart
            cart.clear();
            aggressiveRadixCleanup();

            // 3. Load items + navigate to POS
            const items = sale.items || [];
            // v2.10.135: Use setTimeout(300) instead of requestAnimationFrame
            //   to give Radix Dialog time to fully clean up its portals.
            //   requestAnimationFrame fires too fast — Radix hasn't finished
            //   removing its overlay from document.body yet.
            setTimeout(() => {
              const batchItems = items.map((it: any) => ({
                product: {
                  id: it.productId || it.id,
                  name: it.name || "Unknown",
                  barcode: it.barcode || "",
                  salePrice: it.price || 0,
                  costPrice: it.costPrice || 0,
                  stock: 9999,
                  unit: it.unit || "piece",
                  wholesalePrice: 0,
                  shopkeeperPrice: 0,
                  taxRate: 0,
                  active: true,
                  hasBarcode: !!it.barcode,
                  barcodeType: "CODE128",
                  minStock: 0,
                  categoryId: null,
                  vendorId: null,
                  storeStock: 0,
                  image: null,
                  expiryDate: null,
                  manufacturingDate: null,
                  packBarcode: null,
                  packQuantity: 0,
                  packPrice: 0,
                  productCode: null,
                  barcodeSvg: null,
                  barcodePng: null,
                  barcodeVerified: false,
                  stickerSize: "50x30",
                  packingDate: null,
                  inventorySource: "SHOP",
                  linkedStoreProductId: null,
                } as any,
                qty: it.quantity,
              }));
              try {
                cart.batchAddItems(batchItems);
              } catch (e) {
                console.warn("Failed to load items:", e);
              }
              if (sale.customerName && cart.setCustomerName) cart.setCustomerName(sale.customerName);
              if (sale.customerPhone && cart.setCustomerPhone) cart.setCustomerPhone(sale.customerPhone);
              // Navigate to POS
              setView("pos");

              // v2.10.143: Use shared aggressiveRadixCleanup utility after setView.
              //   This catches any Radix leftovers that appeared during the view
              //   transition. Also focus the search bar so user can immediately type.
              setTimeout(() => {
                aggressiveRadixCleanup();
                // Try to focus search bar in POS view
                const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
                if (searchInput) {
                  searchInput.disabled = false;
                  searchInput.readOnly = false;
                  searchInput.style.pointerEvents = "auto";
                  searchInput.focus();
                }
              }, 200);

              toast.success(`Loaded ${items.length} item(s) into cart for editing.`);
            }, 300);
          } catch (e: any) {
            toast.error("Failed to edit sale: " + (e?.message || "Unknown"));
          }
        } : undefined}
      />

      {/* Return / Refund confirmation */}
      <AlertDialog
        open={!!returnTarget}
        onOpenChange={(o) => {
          if (!o) closeReturnDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-600" />
              Return this sale?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Items will be restocked and the amount refunded. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {returnTarget && (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice</span>
                <span className="font-mono">{returnTarget.invoiceNo}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Refund amount</span>
                <span className="font-bold text-emerald-700">
                  {formatMoney(returnTarget.total, currency)}
                </span>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="return-reason">Reason (optional)</Label>
            <Input
              id="return-reason"
              placeholder="e.g. Customer changed mind, defective item..."
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              disabled={returnSubmitting}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={returnSubmitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmReturn();
              }}
              disabled={returnSubmitting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {returnSubmitting ? "Processing..." : "Confirm Return"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
