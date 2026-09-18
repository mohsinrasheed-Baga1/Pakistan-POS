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
  Banknote,
  ShieldCheck,
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
  // v2.10.78: Cash Type — distinguish "Cash" (regular cash deposit)
  // from "Legitimate Cash" (جائز کیش — formal record with wallet link)
  // When type=DEPOSIT, the user must choose a cashType.
  // - "CASH": regular cash deposit to customer card (logged in reports
  //   under "Cash Deposits", NOT under Sales)
  // - "LEGITIMATE_CASH": formal cash record (future: links to wallet
  //   account from Bill & Load → Wallet section)
  cashType: "CASH" as "CASH" | "LEGITIMATE_CASH",
  // v2.10.78: Optional wallet account ID for LEGITIMATE_CASH
  // (links this deposit to a wallet account in LoadBill → Wallet)
  walletAccountId: "" as string,
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

      // v2.10.44: Show detailed sync diagnostic report
      if (data.syncReport) {
        const report = data.syncReport;
        if (report.success) {
          // Success — find any failed steps (non-fatal)
          const failedSteps = report.steps?.filter((s: any) => !s.ok) || [];
          if (failedSteps.length === 0) {
            toast.success(`✓ Card created · Synced to cloud (card: ${data.card.cardNumber})`);
          } else {
            toast.success(`Card created · Synced to cloud with ${failedSteps.length} warning(s)`);
          }
        } else {
          // Sync failed — show detailed error
          const failedStep = report.steps?.find((s: any) => !s.ok);
          const errMsg = failedStep?.message || data.syncWarning || "Unknown sync error";
          toast.error(`Card saved locally. CLOUD SYNC FAILED: ${errMsg}`, { duration: 8000 });
          // Show a second toast with full diagnostic after a delay
          setTimeout(() => {
            toast.error(`Diagnostic: Step "${failedStep?.step || "unknown"}" failed — see console (F12) for full report`, { duration: 10000 });
          }, 500);
          console.error("[Card Save] Sync diagnostic report:", report);
        }
      } else {
        // No report (old server) — fall back to simple toast
        toast.success(editId ? "Card updated" : "Card created");
      }
      setDialogOpen(false);
      loadCards();
      // v2.10.39: Verify sync happened by checking the cloud after 1.5s
      // v2.10.42: Use /api/license/key as fallback if localStorage is missing
      setTimeout(async () => {
        try {
          // Get license key — try localStorage first, then server-side fallback
          let verifyLicenseKey = "LICENSE";
          if (typeof window !== "undefined") {
            const sources = ["pakpos_license_data", "pakpos_license", "license_key"];
            for (const key of sources) {
              const raw = localStorage.getItem(key);
              if (!raw) continue;
              try {
                const parsed = JSON.parse(raw);
                if (parsed?.licenseKey && typeof parsed.licenseKey === "string" && parsed.licenseKey.startsWith("PAKPOS-")) {
                  verifyLicenseKey = parsed.licenseKey;
                  break;
                }
              } catch {
                if (typeof raw === "string" && raw.startsWith("PAKPOS-")) {
                  verifyLicenseKey = raw;
                  break;
                }
              }
            }
          }
          if (verifyLicenseKey === "LICENSE") {
            // Fallback to server-side endpoint
            try {
              const lkRes = await fetch("/api/license/key", { cache: "no-store" });
              if (lkRes.ok) {
                const lkData = await lkRes.json();
                if (lkData.licenseKey) verifyLicenseKey = lkData.licenseKey;
              }
            } catch {}
          }

          const verifyRes = await fetch(
            `https://pakistanpos.vercel.app/api/portal/card?licenseKey=${encodeURIComponent(verifyLicenseKey)}&cardNumber=${encodeURIComponent(data.card.cardNumber)}`
          );
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            if (verifyData.ok) {
              toast.success("✓ Verified online — QR scan will work");
            } else {
              toast.warning(`Sync check: ${verifyData.error || 'Card not synced'}. Try Bulk Sync in Settings.`);
            }
          }
        } catch {
          // Silent — verification is best-effort
        }
      }, 1500);
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
    setDetailCardSales([]);
    setDetailLoading(true);
    try {
      // Fetch card details (includes transactions)
      const res = await fetch(`/api/cards/${c.id}`, { cache: "no-store" });
      const data = await res.json();
      setDetailCard(data.card);
      setDetailTransactions(data.card.transactions || []);

      // v2.10.79: Fetch recent sales and filter to this card
      // (Existing API doesn't support filtering by cardId directly,
      //  so we fetch the last 100 sales and filter client-side.)
      // We fetch MORE now (limit=100) to cover more historical sales.
      try {
        const salesRes = await fetch(`/api/sales?limit=100`, { cache: "no-store" });
        if (salesRes.ok) {
          const salesData = await salesRes.json();
          const cardSales = (salesData.sales || []).filter((s: any) => s.cardId === c.id);
          // Sort newest first
          cardSales.sort((a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
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
      // v2.10.78: For DEPOSIT transactions, prefix the description with
      // the cash type so reports can distinguish "Cash" from "Legitimate Cash".
      // - "CASH" → description prefix "[CASH]"
      // - "LEGITIMATE_CASH" → description prefix "[جائز کیش]"
      // The transaction type is still "DEPOSIT" (no schema change needed).
      let finalDescription = txForm.description.trim();
      if (txForm.type === "DEPOSIT") {
        const cashTypePrefix = txForm.cashType === "LEGITIMATE_CASH"
          ? "[جائز کیش] "
          : "[CASH] ";
        finalDescription = cashTypePrefix + finalDescription;
      }
      const res = await fetch(`/api/cards/${detailCard.id}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: txForm.type,
          amount: amt,
          description: finalDescription,
          operatorName: txForm.operatorName.trim(),
          // v2.10.78: Pass cashType + walletAccountId as metadata
          // (the API can use these for reports categorization and
          // future wallet account linking)
          cashType: txForm.cashType,
          walletAccountId: txForm.walletAccountId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Transaction failed");
        setTxSaving(false);
        return;
      }
      toast.success(
        txForm.cashType === "LEGITIMATE_CASH"
          ? "Legitimate cash (جائز کیش) deposit recorded"
          : "Cash deposit recorded"
      );
      setTxDialogOpen(false);
      // Reset cashType to default for next time
      setTxForm({ ...emptyTxForm, type: txForm.type });
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
        {/* v2.10.81: REVERTED v2.10.80's full-screen attempt (it broke the
            dialog — left column came up blank). Going back to v2.10.79's
            working layout but slightly larger (max-w-[99vw] h-[96vh])
            so the user doesn't have to manually maximize as much.
            The v2.10.79 layout was working perfectly per user feedback:
            "بہت زیادہ ائی ہے" (much better). */}
        <DialogContent className="max-w-[99vw] w-full h-[96vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* v2.10.79: REDESIGNED Shop Card Details dialog
              ─────────────────────────────────────────────────────────────
              Two-column layout (responsive: stacks on small screens):
              - LEFT (1/3 width): Customer info + Balance + Actions (sticky)
              - RIGHT (2/3 width): Transaction history + Purchase history (scroll)
              This prevents the "UI breaks when many entries" issue.
              Also: each purchase history row now shows full details
              (invoice no, items purchased, "View Receipt" button per sale). */}
          <DialogHeader className="flex-shrink-0 bg-emerald-700 text-white p-3 border-b-2 border-emerald-800">
            <DialogTitle className="flex items-center gap-2 text-lg flex-wrap">
              <Wallet className="w-5 h-5" />
              Card Details — تفصیلات
              {detailCard && (
                <span className="text-sm opacity-90 ml-2 font-normal">
                  {detailCard.name} • {detailCard.cardNumber}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailCard && (
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-0 overflow-hidden">
              {/* ─── LEFT COLUMN: Customer info + Balance + Actions ─── */}
              <div className="lg:col-span-1 lg:overflow-y-auto p-4 space-y-3 border-r bg-emerald-50/30">
                {/* Balance - Big and Prominent */}
                <div className={`rounded-xl p-4 text-center text-white shadow-md ${
                  (detailCard.balance || 0) >= 0
                    ? "bg-emerald-600"
                    : "bg-rose-600"
                }`}>
                  <div className="text-xs opacity-80">Current Balance — موجودہ بیلنس</div>
                  <div className="text-3xl font-bold mt-1">{formatMoney(detailCard.balance, currency)}</div>
                  <div className="text-[10px] opacity-75 mt-1">
                    {(detailCard.balance || 0) > 0
                      ? "(Advance — customer paid extra)"
                      : (detailCard.balance || 0) < 0
                      ? "(Due — customer owes money)"
                      : "(Settled)"}
                  </div>
                </div>

                {/* Summary breakdown */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border bg-white p-2">
                    <div className="text-muted-foreground">Total Purchases</div>
                    <div className="font-bold text-rose-700">{formatMoney(detailCard.totalPurchases, currency)}</div>
                  </div>
                  <div className="rounded border bg-white p-2">
                    <div className="text-muted-foreground">Total Paid</div>
                    <div className="font-bold text-emerald-700">{formatMoney(detailCard.totalPaid, currency)}</div>
                  </div>
                </div>

                {/* Customer info compact card */}
                <div className="rounded-lg border bg-white p-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <User className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold">{detailCard.name}</span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Card Number:</span>
                      <span className="font-mono font-medium">{detailCard.cardNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Customer ID:</span>
                      <span className="font-mono text-emerald-700">{detailCard.customerId || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phone:</span>
                      <span className="font-medium">{detailCard.phone || "-"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Type:</span>
                      <span className="font-medium">
                        {detailCard.type === "WHOLESALE" ? "Wholesale" : detailCard.type === "SHOP_KEEPER" ? "Shop Keeper" : "Regular"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Status:</span>
                      {detailCard.active ? (
                        <Badge className="border-emerald-300 text-emerald-700 bg-emerald-50 text-[10px] py-0 h-5">
                          <CheckCircle className="w-3 h-3 mr-1" /> Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 text-[10px] py-0 h-5">
                          <XCircle className="w-3 h-3 mr-1" /> Inactive
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Last Transaction summary */}
                {detailTransactions.length > 0 && (
                  <div className="rounded-lg border bg-white p-2 text-xs space-y-1">
                    <div className="text-muted-foreground font-medium">Last Transaction — آخری لین دین</div>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] py-0 h-5">
                        {TRANSACTION_TYPES.find(t => t.value === detailTransactions[0].type)?.labelEn || detailTransactions[0].type}
                      </Badge>
                      <span className="font-bold">{formatMoney(detailTransactions[0].amount, currency)}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(detailTransactions[0].createdAt).toLocaleString("en-PK")}
                    </div>
                  </div>
                )}

                {/* Actions — sticky at the bottom of left column on large screens */}
                <div className="space-y-2 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 h-10"
                      onClick={() => openTxDialog("DEPOSIT")}
                    >
                      <ArrowDownLeft className="w-4 h-4 mr-1" /> Cash In
                    </Button>
                    <Button
                      className="bg-rose-600 hover:bg-rose-700 h-10"
                      onClick={() => openTxDialog("WITHDRAWAL")}
                    >
                      <ArrowUpRight className="w-4 h-4 mr-1" /> Cash Out
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-9"
                      onClick={() => openTxDialog()}
                    >
                      <Plus className="w-4 h-4 mr-1" /> Other Tx
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-9"
                      onClick={() => {
                        setPrintCard(detailCard);
                        setDetailCard(null);
                      }}
                    >
                      <Printer className="w-4 h-4 mr-1" /> Print
                    </Button>
                  </div>
                </div>
              </div>

              {/* ─── RIGHT COLUMN: Histories (transaction + purchase) ─── */}
              <div className="lg:col-span-2 lg:overflow-y-auto p-4 space-y-4">
                {/* Transaction History — card transactions (deposits, withdrawals, etc.) */}
                <div>
                  <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background z-10 py-1">
                    <History className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-bold text-emerald-700">
                      Transaction History — تاریخِ لین دین
                    </span>
                    <Badge variant="outline" className="text-[10px] ml-auto">
                      {detailTransactions.length} txn(s)
                    </Badge>
                  </div>
                  {detailLoading ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">Loading transactions...</div>
                  ) : detailTransactions.length > 0 ? (
                    <div className="rounded-lg border overflow-hidden">
                      <div className="max-h-[35vh] overflow-y-auto">
                        <Table>
                          <TableHeader className="sticky top-0 bg-muted z-10">
                            <TableRow>
                              <TableHead className="text-xs">Date</TableHead>
                              <TableHead className="text-xs">Type</TableHead>
                              <TableHead className="text-xs text-right">Amount</TableHead>
                              <TableHead className="text-xs">Description</TableHead>
                              <TableHead className="text-xs">Operator</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detailTransactions.map((tx) => {
                              const txType = TRANSACTION_TYPES.find(t => t.value === tx.type);
                              const isCredit = ["DEPOSIT", "CREDIT", "REFUND"].includes(tx.type);
                              return (
                                <TableRow key={tx.id} className={isCredit ? "bg-emerald-50/40" : "bg-rose-50/40"}>
                                  <TableCell className="text-[10px] py-1.5">
                                    {new Date(tx.createdAt).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" })}
                                  </TableCell>
                                  <TableCell className="py-1.5">
                                    <Badge variant="outline" className={`text-[10px] py-0 h-5 ${
                                      isCredit ? "border-emerald-300 text-emerald-700" : "border-rose-300 text-rose-700"
                                    }`}>
                                      {txType?.labelEn || tx.type}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className={`text-right font-bold py-1.5 text-xs ${
                                    isCredit ? "text-emerald-700" : "text-rose-700"
                                  }`}>
                                    {isCredit ? "+" : "-"}{formatMoney(tx.amount, currency)}
                                  </TableCell>
                                  <TableCell className="text-[10px] text-muted-foreground py-1.5 max-w-[200px] truncate" title={tx.description || tx.note || ""}>
                                    {tx.description || tx.note || "-"}
                                  </TableCell>
                                  <TableCell className="text-[10px] py-1.5">
                                    {tx.operatorName || "-"}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-sm text-muted-foreground py-4 border rounded-lg">
                      No transactions yet — ابھی تک کوئی لین دین نہیں
                    </div>
                  )}
                </div>

                {/* ─── Purchase History (Sales linked to this card) ───
                    v2.10.79: Each sale row now shows:
                    - Invoice number (with link/button to view receipt)
                    - Date
                    - Total amount
                    - ITEMS purchased (full list, not just count)
                    - "View Receipt" button per sale
                    Rows are expandable — click to expand and see item list */}
                <div>
                  <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background z-10 py-1">
                    <Receipt className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-bold text-blue-700">
                      Purchase History — خریداری کی تاریخ
                    </span>
                    <Badge variant="outline" className="text-[10px] ml-auto">
                      {detailCardSales.length} sale(s)
                    </Badge>
                  </div>
                  {detailCardSales.length > 0 ? (
                    <div className="rounded-lg border overflow-hidden">
                      <div className="max-h-[40vh] overflow-y-auto">
                        <Table>
                          <TableHeader className="sticky top-0 bg-muted z-10">
                            <TableRow>
                              <TableHead className="text-xs">Date</TableHead>
                              <TableHead className="text-xs">Invoice / رسید نمبر</TableHead>
                              <TableHead className="text-xs text-right">Total</TableHead>
                              <TableHead className="text-xs">Items — خریدی ہوئی چیزیں</TableHead>
                              <TableHead className="text-xs text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detailCardSales.map((sale: any) => (
                              <TableRow
                                key={sale.id}
                                className="cursor-pointer hover:bg-blue-50"
                              >
                                <TableCell className="text-[10px] py-1.5">
                                  {new Date(sale.createdAt).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" })}
                                </TableCell>
                                <TableCell className="text-xs font-mono font-bold text-blue-700 py-1.5">
                                  {sale.invoiceNo}
                                </TableCell>
                                <TableCell className="text-right font-bold py-1.5 text-xs">
                                  {formatMoney(sale.total, currency)}
                                </TableCell>
                                <TableCell className="py-1.5">
                                  {/* v2.10.79: Show actual items purchased (not just count) */}
                                  {sale.items && sale.items.length > 0 ? (
                                    <div className="text-[10px] space-y-0.5 max-w-[280px]">
                                      {sale.items.slice(0, 3).map((it: any, i: number) => (
                                        <div key={i} className="flex justify-between gap-2 truncate">
                                          <span className="truncate">• {it.name}</span>
                                          <span className="text-muted-foreground whitespace-nowrap">×{it.quantity}</span>
                                        </div>
                                      ))}
                                      {sale.items.length > 3 && (
                                        <div className="text-muted-foreground italic">
                                          + {sale.items.length - 3} more item(s)
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">
                                      {sale.items?.length || 0} items (load receipt to see)
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right py-1.5">
                                  {/* v2.10.79: "View Receipt / پرچی" button per sale
                                      so the user can quickly open and print the receipt */}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px] border-blue-300 text-blue-700 hover:bg-blue-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      viewSaleReceipt(sale.id);
                                    }}
                                  >
                                    <Receipt className="w-3 h-3 mr-1" />
                                    پرچی
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-sm text-muted-foreground py-4 border rounded-lg">
                      No purchases yet — ابھی تک کوئی خریداری نہیں
                    </div>
                  )}
                </div>
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

            {/* v2.10.78: Cash Type — only show when transaction type = DEPOSIT
                (cash-in to customer card). Asks: "Cash" or "Legitimate Cash (جائز کیش)"
                - Cash: regular cash deposit (logged in reports under "Cash Deposits")
                - Legitimate Cash: formal cash record (future: links to wallet account) */}
            {txForm.type === "DEPOSIT" && (
              <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <Label className="font-bold text-emerald-900">
                  Cash Type / کیش کی قسم *
                </Label>
                <p className="text-xs text-emerald-700 mb-2">
                  خریدار کارڈ میں پیسے جمع کروانے کے لیے: کیش ہے یا جائز کیش؟
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTxForm({ ...txForm, cashType: "CASH" })}
                    className={`flex flex-col items-center gap-1 py-3 px-2 rounded-lg border-2 transition-all ${
                      txForm.cashType === "CASH"
                        ? "border-emerald-600 bg-white text-emerald-700 shadow-sm"
                        : "border-emerald-200 bg-white/50 text-emerald-600 hover:bg-white"
                    }`}
                  >
                    <Banknote className="w-5 h-5" />
                    <span className="text-sm font-bold">Cash</span>
                    <span className="text-[10px] opacity-80">رسد سودا</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxForm({ ...txForm, cashType: "LEGITIMATE_CASH" })}
                    className={`flex flex-col items-center gap-1 py-3 px-2 rounded-lg border-2 transition-all ${
                      txForm.cashType === "LEGITIMATE_CASH"
                        ? "border-blue-600 bg-white text-blue-700 shadow-sm"
                        : "border-blue-200 bg-white/50 text-blue-600 hover:bg-white"
                    }`}
                  >
                    <ShieldCheck className="w-5 h-5" />
                    <span className="text-sm font-bold">جائز کیش</span>
                    <span className="text-[10px] opacity-80">Legitimate Cash</span>
                  </button>
                </div>
                {txForm.cashType === "LEGITIMATE_CASH" && (
                  <div className="mt-2 text-xs text-blue-700 bg-blue-50 rounded p-2 border border-blue-200">
                    <ShieldCheck className="w-3 h-3 inline mr-1" />
                    جائز کیش — یہ رقم ریپورٹ میں "Cash Deposits" کے تحت "Legitimate Cash" کے طور پر ظاہر ہوگی۔
                    {/*
                      TODO v2.10.79+: Integrate with LoadBill → Wallet accounts.
                      When user picks "Legitimate Cash", show a dropdown of
                      wallet accounts (JazzCash, Easypaisa, Bank, etc. from
                      LoadBill → Wallet section). The selected account's
                      balance will be increased by this deposit amount.
                      For now, this is logged as metadata only.
                    */}
                  </div>
                )}
                {txForm.cashType === "CASH" && (
                  <div className="mt-2 text-xs text-emerald-700 bg-emerald-50 rounded p-2 border border-emerald-200">
                    <Banknote className="w-3 h-3 inline mr-1" />
                    کیش — یہ رقم ریپورٹ میں "Cash Deposits" کے تحت دکھائی دے گی (سیل کے طور پر نہیں)۔
                  </div>
                )}
              </div>
            )}

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
    // v2.10.42: Made async to allow /api/license/key fallback
    (async () => {
    // v2.10.25: Generate QR with Vercel URL so scanning opens the portal page
    // v2.10.31: Brand renamed to Pakistan POS. Vercel project renamed.
    // v2.10.32: Final URL = pakistanpos.vercel.app (no hyphen between pakistan & pos).
    // v2.10.42: Added fallback chain for license key retrieval.
    const vercelUrl = "https://pakistanpos.vercel.app";
    let licenseKey = "LICENSE";

    // v2.10.42: Try multiple ways to get the license key
    // 1. Try localStorage 'pakpos_license_data' (set by activation-screen.tsx)
    // 2. Try localStorage 'pakpos_license' (legacy key)
    // 3. Try localStorage 'license_key' (alternate legacy key)
    if (typeof window !== "undefined") {
      const sources = ["pakpos_license_data", "pakpos_license", "license_key"];
      for (const key of sources) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.licenseKey && typeof parsed.licenseKey === "string" && parsed.licenseKey.startsWith("PAKPOS-")) {
            licenseKey = parsed.licenseKey;
            break;
          }
          // Some legacy formats store licenseKey directly
          if (typeof parsed === "string" && parsed.startsWith("PAKPOS-")) {
            licenseKey = parsed;
            break;
          }
        } catch {
          // Maybe it's stored as a plain string
          if (typeof raw === "string" && raw.startsWith("PAKPOS-")) {
            licenseKey = raw;
            break;
          }
        }
      }
    }

    // v2.10.42: CRITICAL — if licenseKey is still "LICENSE", the QR will
    // generate an invalid URL. Log a warning so we can diagnose.
    if (licenseKey === "LICENSE") {
      console.error("[QR Generation] Could not find licenseKey in localStorage!");
      console.error("[QR Generation] localStorage keys:", typeof window !== "undefined" ? Object.keys(localStorage) : []);
      // Fallback: call /api/license/key (a new endpoint we'll add)
      // This makes a synchronous request to get the license key from the
      // server-side session or admin Supabase.
      try {
        const res = await fetch("/api/license/key", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.licenseKey && data.licenseKey.startsWith("PAKPOS-")) {
            licenseKey = data.licenseKey;
            console.log("[QR Generation] Got licenseKey from /api/license/key:", licenseKey);
          }
        }
      } catch (e) {
        console.warn("[QR Generation] /api/license/key failed:", e);
      }
    }

    const qrUrl = `${vercelUrl}/card/${licenseKey}/${card.cardNumber}`;

    QRCode.toDataURL(qrUrl, {
      width: 200,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((url: string) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });
    })(); // close async IIFE
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
    // QR image — embedded as base64 data URL so it loads instantly without network.
    const qrImg = qrDataUrl
      ? `<img src="${qrDataUrl}" class="qr-img" alt="QR" />`
      : "";

    // v2.10.35: Portrait card with TWO copies (top + bottom), cut line between them.
    // CR80 size: 85.6mm × 54mm per card.
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
              <span style="font-size:9px;">&#9635;</span>
              <span class="holder-name">${escapeHtml(card.name)}</span>
            </div>
            <span class="type-badge">${escapeHtml(cardTypeLabel)}</span>
          </div>
          ${card.phone ? `<div class="phone-row">Ph: ${escapeHtml(card.phone)}</div>` : ""}
          <div class="content-row">
            <div class="barcode-side">
              <svg class="barcode-svg"></svg>
            </div>
            <div class="qr-side">
              ${qrImg}
              <div class="qr-label">Scan QR &amp; Check Balance</div>
            </div>
          </div>
        </div>
      </div>`;

    // v2.10.35: A4 PORTRAIT — two cards stacked vertically (top + bottom)
    // with a horizontal cut line between them.
    // A4 portrait = 210mm × 297mm; usable area = 200mm × 287mm
    // Two CR80 cards (54mm each) + cut line + small margins = ~120mm total
    win.document.write(`
      <html dir="ltr"><head><title>Pakistan POS - Shop Card ${card.cardNumber}</title>
      <style>
        @page { size: A4 portrait; margin: 8mm; }
        html, body { margin: 0; padding: 0; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 4mm 0;
          font-family: Tahoma, Arial, sans-serif;
        }
        .card {
          width: 85.6mm;
          height: 54mm;
          border: 1.5px solid #000;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          color: #000;
          background: #fff;
          page-break-inside: avoid;
        }
        .header {
          border-bottom: 1px solid #000;
          padding: 1.5mm 2.5mm 0.5mm;
          text-align: center;
        }
        .shop-name { font-weight: bold; font-size: 12px; line-height: 1.2; color: #000; letter-spacing: 0.3px; }
        .shop-meta { font-weight: 700; font-size: 7px; line-height: 1.2; color: #333; margin-top: 0.5mm; }
        .body { flex: 1; padding: 1.5mm 2.5mm; display: flex; flex-direction: column; gap: 0.5mm; }
        .holder-row { display: flex; align-items: center; justify-content: space-between; gap: 2mm; }
        .holder-name { font-size: 10px; font-weight: bold; color: #000; text-transform: uppercase; }
        .phone-row { font-size: 8px; font-weight: bold; color: #333; margin-top: 0.3mm; }
        .type-badge { border: 1px solid #000; padding: 0.3mm 1.5mm; font-size: 6px; font-weight: bold; color: #000; background: #fff; text-transform: uppercase; letter-spacing: 0.5px; }
        .content-row { display: flex; justify-content: space-between; align-items: center; flex: 1; gap: 2mm; margin-top: 0.5mm; }
        .barcode-side { display: flex; justify-content: center; align-items: center; flex: 1; min-width: 0; }
        .barcode-side svg { max-width: 100%; height: auto; }
        .qr-side { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5mm; }
        .qr-img { width: 16mm; height: 16mm; }
        .qr-label { font-size: 5px; font-weight: bold; color: #333; text-align: center; font-family: Arial, sans-serif; }
        .cut-line-h {
          width: 100mm;
          margin: 6mm 0;
          border-top: 1px dashed #999;
          position: relative;
          text-align: center;
        }
        .cut-line-h::after {
          content: "✂";
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          background: #fff;
          padding: 2px 6px;
          font-size: 14px;
          color: #999;
        }
      </style></head>
      <body>
        <!-- Copy 1 (top) -->
        ${cardHtml}
        <div class="cut-line-h"></div>
        <!-- Copy 2 (bottom — identical) -->
        ${cardHtml}
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
        <script>
          // v2.10.35 FIX: Robust print trigger.
          // Old bug: barcodeScript.onload was attached AFTER the script started
          // loading. If the script had already loaded by then (cached), onload
          // never fired, so the barcode SVG never rendered → blank card.
          // Also the QR <img> was loaded async — print fired before it painted.
          //
          // Fix: track 3 readiness flags, only print when ALL are true:
          //   1. JsBarcode script loaded
          //   2. All QR images loaded (or errored — count as done)
          //   3. Barcodes rendered into SVGs
          // Also add a 2-second safety timeout so we don't wait forever.
          var ready = { script: false, qr: !document.querySelector('.qr-img'), rendered: false };
          var printed = false;

          function tryPrint() {
            if (printed) return;
            if (ready.script && ready.qr && ready.rendered) {
              printed = true;
              // Wait two RAFs so the SVG render commits to the DOM
              requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                  window.print();
                  setTimeout(function () { window.close(); }, 600);
                });
              });
            }
          }

          // Safety timeout — print whatever we have after 3 seconds
          setTimeout(function() {
            if (!printed) {
              console.warn('Print timeout reached — printing with whatever rendered');
              printed = true;
              window.print();
              setTimeout(function () { window.close(); }, 600);
            }
          }, 3000);

          // 1. Wait for QR images to load
          var qrImgs = document.querySelectorAll('.qr-img');
          var qrLoaded = 0;
          var qrTotal = qrImgs.length;
          if (qrTotal === 0) {
            ready.qr = true;
            tryPrint();
          } else {
            qrImgs.forEach(function(img) {
              if (img.complete) {
                qrLoaded++;
                if (qrLoaded === qrTotal) { ready.qr = true; tryPrint(); }
              } else {
                img.addEventListener('load', function() {
                  qrLoaded++;
                  if (qrLoaded === qrTotal) { ready.qr = true; tryPrint(); }
                });
                img.addEventListener('error', function() {
                  qrLoaded++;
                  if (qrLoaded === qrTotal) { ready.qr = true; tryPrint(); }
                });
              }
            });
          }

          // 2. Load and wait for JsBarcode script
          function loadBarcodeScript() {
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
            s.onload = renderBarcodes;
            s.onerror = function() {
              console.warn('JsBarcode CDN failed; printing without barcode');
              ready.script = true;
              ready.rendered = true;  // nothing to render
              tryPrint();
            };
            document.body.appendChild(s);
          }

          function renderBarcodes() {
            ready.script = true;
            try {
              var svgs = document.querySelectorAll('.barcode-svg');
              svgs.forEach(function(svg) {
                JsBarcode(svg, '${escapeHtml(card.cardNumber)}', {
                  format: 'CODE128',
                  width: 1.0,
                  height: 22,
                  displayValue: true,
                  fontSize: 7,
                  textMargin: 0,
                  margin: 0,
                });
              });
              ready.rendered = true;
            } catch (e) {
              console.error('barcode render error', e);
              ready.rendered = true;  // proceed anyway
            }
            tryPrint();
          }

          // Start loading script immediately (don't wait for window.onload)
          loadBarcodeScript();
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
