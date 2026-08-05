"use client";

import * as React from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  CreditCard,
  Printer,
  RefreshCw,
  User,
  QrCode,
  History,
  Eye,
  Wallet,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  TrendingDown,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { formatMoney } from "@/lib/pos-utils";
import { BarcodeDisplay } from "@/components/barcode/barcode-display";
import { Receipt as ReceiptComponent } from "@/components/pos/receipt";
// @ts-ignore - qrcode has no bundled types in this project
import QRCode from "qrcode";
import type { CustomerCard, CardTransaction, TransactionType, Settings } from "@/types";

interface CardsViewProps {
  userRole: string;
}

const TRANSACTION_TYPES: { value: TransactionType; labelEn: string; labelUr: string }[] = [
  { value: "DEPOSIT", labelEn: "Deposit", labelUr: "جمع" },
  { value: "WITHDRAWAL", labelEn: "Withdrawal", labelUr: "نکلنے" },
  { value: "PURCHASE", labelEn: "Purchase", labelUr: "خریداری" },
  { value: "PAYMENT", labelEn: "Payment", labelUr: "ادائیگی" },
  { value: "CREDIT", labelEn: "Credit", labelUr: "ادھار" },
  { value: "DEBIT", labelEn: "Debit", labelUr: "خرچ" },
  { value: "ADJUSTMENT", labelEn: "Adjustment", labelUr: "ایڈجسٹمنٹ" },
  { value: "REFUND", labelEn: "Refund", labelUr: "واپسی" },
];

const emptyForm = {
  name: "",
  phone: "",
  address: "",
  type: "REGULAR" as "REGULAR" | "WHOLESALE" | "SHOP_KEEPER",
  cardNumber: "",
  active: true,
};

const emptyTxForm = {
  type: "DEPOSIT" as TransactionType,
  amount: "",
  description: "",
  operatorName: "",
};

export function CardsView({ userRole }: CardsViewProps) {
  const canManage = userRole !== "CASHIER";
  const [cards, setCards] = React.useState<CustomerCard[]>([]);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<any>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [printCard, setPrintCard] = React.useState<CustomerCard | null>(null);
  const [detailCard, setDetailCard] = React.useState<CustomerCard | null>(null);
  const [detailTransactions, setDetailTransactions] = React.useState<CardTransaction[]>([]);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailCardSales, setDetailCardSales] = React.useState<any[]>([]);
  const [receiptSale, setReceiptSale] = React.useState<any | null>(null);
  const [txDialogOpen, setTxDialogOpen] = React.useState(false);
  const [txForm, setTxForm] = React.useState(emptyTxForm);
  const [txSaving, setTxSaving] = React.useState(false);

  const loadCards = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const res = await fetch(`/api/cards?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setCards(data.cards || []);
    } catch {
      toast.error("Failed to load cards");
    } finally {
      setLoading(false);
    }
  }, [q]);

  React.useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSettings(d.settings))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    const t = setTimeout(loadCards, 200);
    return () => clearTimeout(t);
  }, [loadCards]);

  function openAdd() {
    setForm(emptyForm);
    setEditId(null);
    setDialogOpen(true);
  }

  function openEdit(c: CustomerCard) {
    setForm({
      name: c.name,
      phone: c.phone || "",
      address: c.address || "",
      type: c.type,
      cardNumber: c.cardNumber,
      active: c.active,
    });
    setEditId(c.id);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Cardholder name is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        type: form.type,
        cardNumber: editId ? form.cardNumber : "", // never overwrite on edit; server keeps existing
        active: form.active,
        ...(editId ? {} : { customerId: `CUST-${Date.now().toString().slice(-8)}` }),
      };
      const url = editId ? `/api/cards/${editId}` : "/api/cards";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save");
        setSaving(false);
        return;
      }
      toast.success(editId ? "Card updated" : "Card created");
      setDialogOpen(false);
      loadCards();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/cards/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Failed to delete");
        return;
      }
      toast.success("Card deleted");
      setDeleteId(null);
      loadCards();
    } catch {
      toast.error("Network error");
    }
  }

  async function openDetail(c: CustomerCard) {
    setDetailCard(c);
    setDetailTransactions([]);
    setDetailLoading(true);
    try {
      // Fetch card details (includes transactions)
      const res = await fetch(`/api/cards/${c.id}`, { cache: "no-store" });
      const data = await res.json();
      setDetailCard(data.card);
      setDetailTransactions(data.card.transactions || []);

      // Also fetch sales linked to this card (purchase history)
      try {
        const salesRes = await fetch(`/api/sales?limit=50`, { cache: "no-store" });
        if (salesRes.ok) {
          const salesData = await salesRes.json();
          const cardSales = (salesData.sales || []).filter((s: any) => s.cardId === c.id);
          setDetailCardSales(cardSales);
        }
      } catch {}
    } catch {
      toast.error("Failed to load card details");
    } finally {
      setDetailLoading(false);
    }
  }

  function openTxDialog(type?: TransactionType) {
    setTxForm({ ...emptyTxForm, type: type || emptyTxForm.type });
    setTxDialogOpen(true);
  }

  // View a sale's receipt — fetches full sale details (with items) then opens receipt dialog
  async function viewSaleReceipt(saleId: string) {
    try {
      const res = await fetch(`/api/sales/${saleId}`, { cache: "no-store" });
      if (!res.ok) { toast.error("Receipt not found"); return; }
      const data = await res.json();
      setReceiptSale(data.sale || data);
    } catch { toast.error("Failed to load receipt"); }
  }

  async function handleTxSave() {
    if (!detailCard) return;
    const amt = parseFloat(txForm.amount);
    if (!amt || amt <= 0) {
      toast.error("Valid amount is required");
      return;
    }
    setTxSaving(true);
    try {
      const res = await fetch(`/api/cards/${detailCard.id}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: txForm.type,
          amount: amt,
          description: txForm.description.trim(),
          operatorName: txForm.operatorName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Transaction failed");
        setTxSaving(false);
        return;
      }
      toast.success("Transaction recorded");
      setTxDialogOpen(false);
      // Refresh detail + list
      openDetail({ ...detailCard, balance: (detailCard.balance || 0) + amt } as CustomerCard);
      loadCards();
    } catch {
      toast.error("Network error");
    } finally {
      setTxSaving(false);
    }
  }

  const currency = settings?.currency || "Rs";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-emerald-600" />
            Shop Cards
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Issue and print customer loyalty/wholesale cards
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadCards}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          {canManage && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={openAdd}
            >
              <Plus className="w-4 h-4 mr-2" /> New Card
            </Button>
          )}
        </div>
      </div>

      {/* ─── SUMMARY CARDS — financial overview of all customers ─── */}
      {(() => {
        // Calculate totals across all cards
        // balance > 0 = advance (customer paid in advance, we owe them)
        // balance < 0 = due (customer owes us)
        // balance = 0 = settled
        let totalAdvance = 0;  // money we owe to customers (sum of positive balances)
        let totalDue = 0;      // money customers owe us (sum of |negative balances|)
        let advanceCount = 0;
        let dueCount = 0;
        for (const c of cards) {
          const bal = c.balance || 0;
          if (bal > 0) {
            totalAdvance += bal;
            advanceCount++;
          } else if (bal < 0) {
            totalDue += Math.abs(bal);
            dueCount++;
          }
        }
        const netBalance = totalAdvance - totalDue; // positive = we owe more, negative = we're owed more

        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Total Advance — money we owe to customers */}
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-emerald-700">
                      Advance (We Owe)
                    </p>
                    <p className="mt-1 text-2xl font-bold text-emerald-700">
                      Rs {totalAdvance.toLocaleString("en-PK")}
                    </p>
                    <p className="text-xs text-emerald-600 mt-1">
                      {advanceCount} customer{advanceCount !== 1 ? "s" : ""} with advance
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Due — money customers owe us */}
            <Card className="border-rose-200 bg-rose-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-rose-700">
                      Due (Owed to Us)
                    </p>
                    <p className="mt-1 text-2xl font-bold text-rose-700">
                      Rs {totalDue.toLocaleString("en-PK")}
                    </p>
                    <p className="text-xs text-rose-600 mt-1">
                      {dueCount} customer{dueCount !== 1 ? "s" : ""} with due balance
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100">
                    <TrendingDown className="h-5 w-5 text-rose-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Net Balance — overall position */}
            <Card className={netBalance >= 0 ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50"}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Net Position
                    </p>
                    <p className={`mt-1 text-2xl font-bold ${netBalance >= 0 ? "text-blue-700" : "text-amber-700"}`}>
                      {netBalance >= 0 ? "−" : "+"}Rs {Math.abs(netBalance).toLocaleString("en-PK")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {netBalance >= 0
                        ? "We owe more than we're owed"
                        : "We're owed more than we owe"}
                    </p>
                  </div>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${netBalance >= 0 ? "bg-blue-100" : "bg-amber-100"}`}>
                    <Wallet className={`h-5 w-5 ${netBalance >= 0 ? "text-blue-600" : "text-amber-600"}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, card number, or phone..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-50" />
              No cards found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Card Number</TableHead>
                    <TableHead>Customer ID</TableHead>
                    <TableHead>Cardholder</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cards.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">
                        {c.cardNumber}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {c.customerId || "-"}
                      </TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.phone || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            c.type === "WHOLESALE" || c.type === "SHOP_KEEPER"
                              ? "border-amber-300 text-amber-700 bg-amber-50"
                              : "border-emerald-300 text-emerald-700 bg-emerald-50"
                          }
                        >
                          {c.type === "WHOLESALE" ? "Wholesale" : c.type === "SHOP_KEEPER" ? "Shop Keeper" : "Regular"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(c.balance, currency)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            c.active
                              ? "border-emerald-300 text-emerald-700"
                              : "border-red-300 text-red-700"
                          }
                        >
                          {c.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openDetail(c)}
                            title="View Details"
                          >
                            <Eye className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setPrintCard(c)}
                            title="Print Card"
                          >
                            <Printer className="w-4 h-4 text-emerald-600" />
                          </Button>
                          {canManage && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => openEdit(c)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteId(c.id)}
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editId ? "Edit Card" : "Issue New Card"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cardholder Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Customer name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="0300-1234567"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm({ ...form, type: v as "REGULAR" | "WHOLESALE" | "SHOP_KEEPER" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REGULAR">Regular</SelectItem>
                    <SelectItem value="WHOLESALE">Wholesale</SelectItem>
                    <SelectItem value="SHOP_KEEPER">Shop Keeper</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea
                value={form.address}
                onChange={(e) =>
                  setForm({ ...form, address: e.target.value })
                }
                placeholder="Customer address (optional)"
                rows={2}
                className="resize-none"
              />
            </div>
            {!editId && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700">
                A unique card number will be auto-generated when the card is
                saved.
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Card is active</Label>
              <Switch
                checked={form.active}
                onCheckedChange={(c) => setForm({ ...form, active: c })}
              />
            </div>
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
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete card?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The card and its transaction history
              will be removed.
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

      {/* print dialog */}
      <CardPrintDialog
        card={printCard}
        settings={settings}
        onClose={() => setPrintCard(null)}
      />

      {/* Receipt Dialog — shows full sale receipt when clicked from purchase history */}
      {receiptSale && (
        <ReceiptComponent
          sale={receiptSale}
          settings={settings}
          open={!!receiptSale}
          onOpenChange={(o) => !o && setReceiptSale(null)}
        />
      )}

      {/* Card Detail — FULL SCREEN modal (like a separate page) */}
      <Dialog open={!!detailCard} onOpenChange={(o) => !o && setDetailCard(null)}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] overflow-y-auto p-6">
          <DialogHeader className="flex-shrink-0 sticky top-0 bg-background z-10 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Wallet className="w-5 h-5 text-emerald-600" />
              Card Details — تفصیلات
              {detailCard && (
                <span className="text-sm text-muted-foreground ml-2">
                  {detailCard.name} • {detailCard.cardNumber}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailCard && (
            <div className="space-y-4">
              {/* Summary Panel */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Customer Name / نام</div>
                  <div className="font-bold">{detailCard.name}</div>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Customer ID</div>
                  <div className="font-mono font-bold text-emerald-700">{detailCard.customerId || "-"}</div>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Phone / فون</div>
                  <div className="font-medium">{detailCard.phone || "-"}</div>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Card Number</div>
                  <div className="font-mono font-medium">{detailCard.cardNumber}</div>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Account Status / حیثیت</div>
                  <div>
                    {detailCard.active ? (
                      <Badge className="border-emerald-300 text-emerald-700 bg-emerald-50">
                        <CheckCircle className="w-3 h-3 mr-1" /> Active — فعال
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">
                        <XCircle className="w-3 h-3 mr-1" /> Inactive — غیر فعال
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Card Type</div>
                  <div className="font-medium">
                    {detailCard.type === "WHOLESALE" ? "Wholesale / ہول سیل" : detailCard.type === "SHOP_KEEPER" ? "Shop Keeper / دکاندار" : "Regular / عام"}
                  </div>
                </div>
              </div>

              {/* Balance - Big and Prominent */}
              <div className="rounded-xl bg-emerald-600 text-white p-5 text-center">
                <div className="text-sm opacity-80">Current Balance — موجودہ بیلنس</div>
                <div className="text-3xl font-bold mt-1">{formatMoney(detailCard.balance, currency)}</div>
                <div className="flex justify-center gap-4 mt-3 text-xs opacity-80">
                  <span>Total Purchases: {formatMoney(detailCard.totalPurchases, currency)}</span>
                  <span>Total Paid: {formatMoney(detailCard.totalPaid, currency)}</span>
                  <span>Remaining: {formatMoney(detailCard.totalPurchases - detailCard.totalPaid, currency)}</span>
                </div>
              </div>

              {/* Last Transaction */}
              {detailTransactions.length > 0 && (
                <div className="rounded-lg border p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">Last Transaction — آخری لین دین</div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {TRANSACTION_TYPES.find(t => t.value === detailTransactions[0].type)?.labelEn || detailTransactions[0].type}
                      {" "}({TRANSACTION_TYPES.find(t => t.value === detailTransactions[0].type)?.labelUr})
                    </span>
                    <span className="font-bold">{formatMoney(detailTransactions[0].amount, currency)}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(detailTransactions[0].createdAt).toLocaleString("en-PK")}
                    </span>
                  </div>
                </div>
              )}

              {/* Actions — Quick Cash In / Cash Out buttons */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => openTxDialog("DEPOSIT")}
                >
                  <ArrowDownLeft className="w-4 h-4 mr-2" /> Cash In — جمع
                </Button>
                <Button
                  className="bg-rose-600 hover:bg-rose-700"
                  onClick={() => openTxDialog("WITHDRAWAL")}
                >
                  <ArrowUpRight className="w-4 h-4 mr-2" /> Cash Out — نکل
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => openTxDialog()}
                >
                  <Plus className="w-4 h-4 mr-2" /> Other Tx — دیگر
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setPrintCard(detailCard);
                    setDetailCard(null);
                  }}
                >
                  <Printer className="w-4 h-4 mr-2" /> Print Card
                </Button>
              </div>

              {/* Transactions Button → Ledger */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setDetailCard(null);
                  // The transactions are already displayed below
                }}
              >
                <History className="w-4 h-4 mr-2" /> Transaction History — تاریخِ لین دین ({detailTransactions.length} transactions)
              </Button>

              {/* Transaction History Table */}
              {detailLoading ? (
                <div className="p-4 text-center text-muted-foreground">Loading transactions...</div>
              ) : detailTransactions.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Operator</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailTransactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-xs">
                            {new Date(tx.createdAt).toLocaleString("en-PK")}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {TRANSACTION_TYPES.find(t => t.value === tx.type)?.labelEn || tx.type}
                              {" "}{TRANSACTION_TYPES.find(t => t.value === tx.type)?.labelUr || ""}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatMoney(tx.amount, currency)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                            {tx.description || tx.note || "-"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {tx.operatorName || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center text-sm text-muted-foreground py-4">
                  No transactions yet — ابھی تک کوئی لین دین نہیں
                </div>
              )}

              {/* ─── Purchase History (Sales linked to this card) ─── */}
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-bold text-blue-700">
                    Purchase History — خریداری کی تاریخ ({detailCardSales.length} sales)
                  </span>
                </div>
                {detailCardSales.length > 0 ? (
                  <div className="rounded-lg border overflow-hidden max-h-[200px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Invoice</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Items</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailCardSales.map((sale: any) => (
                          <TableRow
                            key={sale.id}
                            className="cursor-pointer hover:bg-emerald-50"
                            onClick={() => viewSaleReceipt(sale.id)}
                            title="Click to view receipt"
                          >
                            <TableCell className="text-xs">
                              {new Date(sale.createdAt).toLocaleDateString("en-PK")}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-blue-600 underline">{sale.invoiceNo}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatMoney(sale.total, currency)}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {sale.items?.length || 0} items
                            </TableCell>
                            <TableCell className="text-xs">
                              <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center text-sm text-muted-foreground py-2">
                    No purchases yet — ابھی تک کوئی خریداری نہیں
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Transaction Dialog */}
      <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
              New Transaction — نیا لین دین
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Transaction Type / قسم</Label>
              <Select
                value={txForm.type}
                onValueChange={(v) => setTxForm({ ...txForm, type: v as TransactionType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.labelEn} ({t.labelUr})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount / رقم *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={txForm.amount}
                onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>Description / تفصیل</Label>
              <Textarea
                value={txForm.description}
                onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
                placeholder="Transaction note (optional)"
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>Operator Name / آپریٹر</Label>
              <Input
                value={txForm.operatorName}
                onChange={(e) => setTxForm({ ...txForm, operatorName: e.target.value })}
                placeholder="Your name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxDialogOpen(false)} disabled={txSaving}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleTxSave}
              disabled={txSaving}
            >
              {txSaving ? "Saving..." : "Save Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CardVisual — ID-card-sized (CR80: 85.6mm × 54mm) preview
// B&W-safe layout. Renders to a ref so the printCard function can read it.
// ─────────────────────────────────────────────────────────────────────────────

export function CardVisual({
  card,
  settings,
  qrDataUrl,
  innerRef,
}: {
  card: CustomerCard;
  settings: Settings | null;
  qrDataUrl?: string;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  const subName = settings?.subName?.trim() || settings?.shopName || "My Shop";
  const shopName = settings?.shopName || "My Shop";
  const shopAddress = settings?.shopAddress || "";
  const shopPhone = settings?.shopPhone || "";

  return (
    <div
      ref={innerRef}
      className="card-visual bg-white text-black"
      style={{
        width: "85.6mm",
        height: "54mm",
        border: "1px solid #000",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Tahoma, Arial, sans-serif",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Header — shopName (BIG, top) */}
      <div
        style={{
          borderBottom: "1px solid #000",
          padding: "1.5mm 2mm 0.5mm",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontWeight: "bold",
            fontSize: "14px",
            lineHeight: 1.15,
            color: "#000",
            letterSpacing: "0.3px",
          }}
        >
          {shopName}
        </div>
        <div style={{ fontWeight: 700, fontSize: "9px", lineHeight: 1.15, color: "#333" }}>
          {subName !== shopName ? subName : ""}
          {shopAddress ? ` • ${shopAddress}` : ""}
          {shopPhone ? ` • ${shopPhone}` : ""}
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          padding: "1mm 2mm",
          display: "flex",
          flexDirection: "column",
          gap: "0.6mm",
        }}
      >
        {/* Card holder name + type */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1mm",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5mm",
            }}
          >
            <User
              style={{ width: "8px", height: "8px", color: "#000" }}
            />
            <span
              style={{
                fontSize: "8px",
                fontWeight: "bold",
                color: "#000",
                textTransform: "uppercase",
              }}
            >
              {card.name}
            </span>
          </div>
          <span
            style={{
              border: "1px solid #000",
              padding: "0.3mm 1.5mm",
              fontSize: "7px",
              fontWeight: "bold",
              color: "#000",
              background: "#fff",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {card.type === "WHOLESALE" ? "Wholesale" : card.type === "SHOP_KEEPER" ? "Shop Keeper" : "Regular"}
          </span>
        </div>

        {/* BIG Barcode + number below */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            overflow: "hidden",
            marginTop: "0.5mm",
          }}
        >
          <BarcodeDisplay
            value={card.cardNumber}
            format="CODE128"
            height={38}
            width={1.2}
            displayValue={true}
            fontSize={10}
            margin={1}
          />
        </div>

        {/* QR code small */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            marginTop: "0.5mm",
          }}
        >
          <div style={{ width: "10mm", height: "10mm" }}>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR"
                style={{ width: "100%", height: "100%" }}
              />
            ) : null}
          </div>
          {card.customerId && (
            <div
              style={{
                marginLeft: "1mm",
                fontSize: "6px",
                fontFamily: "monospace",
                color: "#555",
                lineHeight: 1.2,
              }}
            >
              <div style={{ fontWeight: "bold", color: "#333", fontSize: "6.5px" }}>
                {card.customerId}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CardPrintDialog — preview + print the CardVisual at CR80 size
// ─────────────────────────────────────────────────────────────────────────────

function CardPrintDialog({
  card,
  settings,
  onClose,
}: {
  card: CustomerCard | null;
  settings: Settings | null;
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = React.useState<string>("");

  React.useEffect(() => {
    if (!card) {
      setQrDataUrl("");
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(card.cardNumber, {
      width: 120,
      margin: 0,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((url: string) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [card]);

  if (!card) return null;

  const subName = settings?.subName?.trim() || settings?.shopName || "My Shop";
  const shopName = settings?.shopName || "My Shop";
  const shopAddress = settings?.shopAddress || "";
  const shopPhone = settings?.shopPhone || "";

  function handlePrint() {
    if (!card) return;
    const win = window.open("", "_blank", "width=600,height=850");
    if (!win) {
      toast.error("Pop-up blocked. Please allow pop-ups to print.");
      return;
    }
    const cardTypeLabel = card.type === "WHOLESALE" ? "Wholesale" : card.type === "SHOP_KEEPER" ? "Shop Keeper" : "Regular";
    const qrImg = qrDataUrl
      ? `<img src="${qrDataUrl}" style="width:12mm;height:12mm;" alt="QR" />`
      : "";

    // Build a single card HTML — this will be rendered TWICE on an A4
    // portrait page: one at the top corner, one at the bottom corner.
    // Both copies are identical so the shopkeeper can give one to the
    // customer and keep one for records.
    const cardHtml = `
      <div class="card">
        <div class="header">
          <div class="shop-name">${escapeHtml(shopName)}</div>
          <div class="shop-meta">
            ${subName !== shopName ? escapeHtml(subName) : ""}${
              shopAddress ? ` &bull; ${escapeHtml(shopAddress)}` : ""
            }${shopPhone ? ` &bull; ${escapeHtml(shopPhone)}` : ""}
          </div>
        </div>
        <div class="body">
          <div class="holder-row">
            <div style="display:flex;align-items:center;gap:0.5mm;">
              <span style="font-size:10px;">&#9635;</span>
              <span class="holder-name">${escapeHtml(card.name)}</span>
            </div>
            <span class="type-badge">${escapeHtml(cardTypeLabel)}</span>
          </div>
          ${card.phone ? `<div class="phone-row">Ph: ${escapeHtml(card.phone)}</div>` : ""}
          <div class="barcode">
            <svg class="barcode-svg"></svg>
          </div>
          <div class="qr">
            <div style="display:flex;justify-content:center;align-items:flex-end;margin-top:0.5mm;">
              <div style="width:10mm;height:10mm;">${qrImg}</div>
              ${card.customerId ? `<div style="margin-left:1mm;font-size:6px;font-family:monospace;color:#555;line-height:1.2;"><span style="font-weight:bold;color:#333;font-size:6.5px;">${escapeHtml(card.customerId)}</span></div>` : ""}
            </div>
          </div>
        </div>
      </div>`;

    // A4 portrait = 210mm × 297mm
    // Card = 85.6mm × 54mm
    // Two cards stacked vertically with a cut line between them
    win.document.write(`
      <html dir="ltr"><head><title>Shop Card ${card.cardNumber}</title>
      <style>
        @page { size: A4 portrait; margin: 5mm; }
        html, body { margin: 0; padding: 0; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body {
          width: 200mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          gap: 5mm;
          padding-top: 5mm;
          font-family: Tahoma, Arial, sans-serif;
        }
        .card {
          width: 85.6mm;
          height: 54mm;
          border: 1px solid #000;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          color: #000;
          background: #fff;
          page-break-inside: avoid;
        }
        .header {
          border-bottom: 1px solid #000;
          padding: 1.5mm 2mm 0.5mm;
          text-align: center;
        }
        .shop-name { font-weight: bold; font-size: 14px; line-height: 1.15; color: #000; letter-spacing: 0.3px; }
        .shop-meta { font-weight: 700; font-size: 9px; line-height: 1.15; color: #333; }
        .body { flex: 1; padding: 1mm 2mm; display: flex; flex-direction: column; gap: 0.5mm; }
        .holder-row { display: flex; align-items: center; justify-content: space-between; gap: 1mm; }
        .holder-name { font-size: 11px; font-weight: bold; color: #000; text-transform: uppercase; }
        .phone-row { font-size: 9px; font-weight: bold; color: #333; margin-top: 0.5mm; }
        .type-badge { border: 1px solid #000; padding: 0.3mm 1.5mm; font-size: 7px; font-weight: bold; color: #000; background: #fff; text-transform: uppercase; letter-spacing: 0.5px; }
        .barcode { display: flex; justify-content: center; overflow: hidden; margin-top: 0.5mm; }
        .qr { display: flex; justify-content: center; margin-top: 0.5mm; }
        .cut-line {
          width: 200mm;
          border-top: 1px dashed #999;
          margin: 2mm 0;
          position: relative;
        }
        .cut-line::after {
          content: "✂ ---";
          position: absolute;
          left: 50%;
          top: -8px;
          transform: translateX(-50%);
          background: #fff;
          padding: 0 5px;
          font-size: 10px;
          color: #999;
        }
      </style></head>
      <body>
        <!-- Copy 1 — top corner -->
        ${cardHtml}
        <div class="cut-line"></div>
        <!-- Copy 2 — bottom corner (identical) -->
        ${cardHtml}
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
        <script>
          try {
            var svgs = document.querySelectorAll('.barcode-svg');
            svgs.forEach(function(svg) {
              JsBarcode(svg, '${escapeHtml(card.cardNumber)}', {
                format: 'CODE128',
                width: 1.2,
                height: 38,
                displayValue: true,
                fontSize: 10,
                textMargin: 1,
              });
            });
          } catch (e) {
            console.error('barcode error', e);
          }
          window.onload = function () {
            setTimeout(function () {
              window.print();
              setTimeout(function () { window.close(); }, 250);
            }, 400);
          };
        </script>
      </body></html>
    `);
    win.document.close();
    win.focus();
  }

  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Print Shop Card</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-center text-sm text-muted-foreground">
            Card will be printed at standard ID-card size (CR80: 85.6mm × 54mm)
          </div>
          <div className="flex justify-center bg-muted/40 p-4 rounded-lg overflow-x-auto">
            <CardVisual
              card={card}
              settings={settings}
              qrDataUrl={qrDataUrl}
            />
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

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
