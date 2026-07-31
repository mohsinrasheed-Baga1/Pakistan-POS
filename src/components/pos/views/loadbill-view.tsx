"use client";

import * as React from "react";
import {
  Smartphone,
  Plus,
  Trash2,
  RefreshCw,
  Wallet,
  FileText,
  ArrowDownLeft,
  ArrowUpRight,
  Phone,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatMoney } from "@/lib/pos-utils";

interface LoadBillViewProps {
  userRole: string;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  name: string;
  balance: number;
  totalPurchased: number;
  totalSold: number;
  totalProfit: number;
}

interface SimCard {
  id: string;
  companyId: string;
  companyName: string;
  number: string;
  balance: number;
  active: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LoadBillView({ userRole }: LoadBillViewProps) {
  const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-emerald-600" />
            Load & Bill Payment
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage SIM cards, mobile load, bill payments, and wallet transactions
          </p>
        </div>
      </div>

      <Tabs defaultValue="sims" className="w-full">
        <TabsList className="w-full sm:w-auto flex flex-wrap">
          <TabsTrigger value="sims">SIM Cards</TabsTrigger>
          <TabsTrigger value="load">Mobile Load</TabsTrigger>
          <TabsTrigger value="bill">Bill Payment</TabsTrigger>
          <TabsTrigger value="wallet">Wallet</TabsTrigger>
        </TabsList>

        <TabsContent value="sims">
          <SimTab isAdminOrManager={isAdminOrManager} />
        </TabsContent>
        <TabsContent value="load">
          <LoadTab isAdminOrManager={isAdminOrManager} />
        </TabsContent>
        <TabsContent value="bill">
          <BillTab />
        </TabsContent>
        <TabsContent value="wallet">
          <WalletTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1: SIM CARDS — add SIM, balance in/out, replacement, per-SIM balance
// ═════════════════════════════════════════════════════════════════════════════

function SimTab({ isAdminOrManager }: { isAdminOrManager: boolean }) {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadCompanies = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/load-bill/companies", { cache: "no-store" });
      const data = await res.json();
      setCompanies(data.companies || []);
    } catch {
      toast.error("Failed to load companies");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  // Add company dialog
  const [addOpen, setAddOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleAddCompany() {
    if (!newName.trim()) {
      toast.error("Company name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/load-bill/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to add company");
        setSaving(false);
        return;
      }
      toast.success(`${newName} added`);
      setNewName("");
      setAddOpen(false);
      loadCompanies();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  // Balance in/out dialog
  const [balanceOpen, setBalanceOpen] = React.useState(false);
  const [balanceCompany, setBalanceCompany] = React.useState<Company | null>(null);
  const [balanceType, setBalanceType] = React.useState<"IN" | "OUT">("IN");
  const [balanceAmount, setBalanceAmount] = React.useState("");

  function openBalanceDialog(c: Company, type: "IN" | "OUT") {
    setBalanceCompany(c);
    setBalanceType(type);
    setBalanceAmount("");
    setBalanceOpen(true);
  }

  async function handleBalanceSave() {
    if (!balanceCompany) return;
    const amt = parseFloat(balanceAmount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      // Use the mobile-load endpoint with type=PURCHASE for IN, type=SALE for OUT
      const endpoint = balanceType === "IN" ? "mobile-load" : "mobile-load";
      const type = balanceType === "IN" ? "PURCHASE" : "SALE";
      const body: any = {
        companyId: balanceCompany.id,
        type,
        amount: amt,
        costPrice: balanceType === "IN" ? amt : 0,
        salePrice: balanceType === "OUT" ? amt : 0,
      };
      const res = await fetch(`/api/load-bill/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed");
        setSaving(false);
        return;
      }
      toast.success(`${balanceType === "IN" ? "Balance added" : "Balance removed"}: Rs ${amt}`);
      setBalanceOpen(false);
      loadCompanies();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-600" />
            SIM Companies
          </CardTitle>
          {isAdminOrManager && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add SIM Company
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : companies.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <Smartphone className="w-10 h-10 mx-auto mb-2 opacity-50" />
            No SIM companies added yet. Click "Add SIM Company" to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {companies.map((c) => (
              <div key={c.id} className="rounded-lg border p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Balance: <span className="font-bold text-emerald-700">Rs {c.balance.toLocaleString()}</span>
                    {" • "}Purchased: Rs {c.totalPurchased.toLocaleString()}
                    {" • "}Sold: Rs {c.totalSold.toLocaleString()}
                    {" • "}Profit: Rs {c.totalProfit.toLocaleString()}
                  </div>
                </div>
                {isAdminOrManager && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700" onClick={() => openBalanceDialog(c, "IN")}>
                      <ArrowDownLeft className="w-3 h-3 mr-1" /> Balance In
                    </Button>
                    <Button size="sm" variant="outline" className="border-rose-300 text-rose-700" onClick={() => openBalanceDialog(c, "OUT")}>
                      <ArrowUpRight className="w-3 h-3 mr-1" /> Balance Out
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add Company Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add SIM Company</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Jazz, Ufone, Zong, Telenor" autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={handleAddCompany}>
              {saving ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Balance In/Out Dialog */}
      <Dialog open={balanceOpen} onOpenChange={setBalanceOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{balanceType === "IN" ? "Balance In" : "Balance Out"} — {balanceCompany?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Current balance: <span className="font-bold">Rs {balanceCompany?.balance.toLocaleString()}</span>
            </div>
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input type="number" value={balanceAmount} onChange={(e) => setBalanceAmount(e.target.value)} placeholder="0" autoFocus />
            </div>
            <p className="text-xs text-muted-foreground">
              {balanceType === "IN"
                ? "Adding balance means you loaded money into this SIM (e.g. from bank deposit)"
                : "Removing balance means you sent money out of this SIM (e.g. to customer)"}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={handleBalanceSave}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2: MOBILE LOAD — sell load to customer (amount + extra charges)
// ═════════════════════════════════════════════════════════════════════════════

function LoadTab({ isAdminOrManager }: { isAdminOrManager: boolean }) {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [transactions, setTransactions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [todayTotal, setTodayTotal] = React.useState(0);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, tRes] = await Promise.all([
        fetch("/api/load-bill/companies", { cache: "no-store" }),
        fetch("/api/load-bill/mobile-load?limit=50", { cache: "no-store" }),
      ]);
      const cData = await cRes.json();
      const tData = await tRes.json();
      const txns = tData.transactions || [];
      setCompanies(cData.companies || []);
      setTransactions(txns);

      // Calculate today's total (sum of salePrice for today's transactions)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTxns = txns.filter((t: any) => new Date(t.createdAt) >= today);
      const total = todayTxns.reduce((s: number, t: any) => s + (t.salePrice || t.amount || 0), 0);
      setTodayTotal(total);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Sell load dialog
  const [sellOpen, setSellOpen] = React.useState(false);
  const [sellCompany, setSellCompany] = React.useState("");
  const [sellAmount, setSellAmount] = React.useState("");
  const [sellExtra, setSellExtra] = React.useState("");
  const [sellPhone, setSellPhone] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Live total calculation for the checkout dialog
  const sellAmountNum = parseFloat(sellAmount) || 0;
  const sellExtraNum = parseFloat(sellExtra) || 0;
  const sellTotal = sellAmountNum + sellExtraNum;

  async function handleSellLoad() {
    if (!sellCompany) {
      toast.error("Select a company");
      return;
    }
    const amt = parseFloat(sellAmount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const extra = parseFloat(sellExtra) || 0;
    setSaving(true);
    try {
      const res = await fetch("/api/load-bill/mobile-load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: sellCompany,
          type: "SALE",
          amount: amt,
          salePrice: amt + extra,
          customerPhone: sellPhone || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed");
        setSaving(false);
        return;
      }
      toast.success(`Load sold: Rs ${amt}${extra > 0 ? ` + Rs ${extra} extra` : ""} = Rs ${amt + extra} total`);
      setSellOpen(false);
      setSellCompany("");
      setSellAmount("");
      setSellExtra("");
      setSellPhone("");
      load();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-600" />
            Mobile Load
          </CardTitle>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setSellOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Sell Load
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Today's total summary */}
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-emerald-700 font-medium">آج کی کل سیل (Today's Total Sales)</div>
            <div className="text-2xl font-bold text-emerald-700">Rs {todayTotal.toLocaleString("en-PK")}</div>
          </div>
          <Smartphone className="w-8 h-8 text-emerald-400" />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No load transactions yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Extra</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{new Date(t.createdAt).toLocaleString("en-PK")}</TableCell>
                    <TableCell>{t.companyName || "-"}</TableCell>
                    <TableCell className="text-xs">{t.customerPhone || "-"}</TableCell>
                    <TableCell className="text-right font-mono">Rs {t.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-700">
                      Rs {(t.salePrice - t.amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">Rs {t.salePrice.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Sell Load Dialog — checkout style with live total */}
      <Dialog open={sellOpen} onOpenChange={setSellOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sell Mobile Load — لوڈ بیچیں</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Company *</Label>
              <select
                className="w-full rounded-md border border-input px-3 py-2 text-sm"
                value={sellCompany}
                onChange={(e) => setSellCompany(e.target.value)}
              >
                <option value="">Select company</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} (Bal: Rs {c.balance.toLocaleString()})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Amount (load value) *</Label>
              <Input type="number" value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} placeholder="e.g. 100" autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Extra Charges (profit)</Label>
              <Input type="number" value={sellExtra} onChange={(e) => setSellExtra(e.target.value)} placeholder="0" />
              <p className="text-xs text-muted-foreground">Extra charges are your profit on this load</p>
            </div>
            <div className="space-y-2">
              <Label>Customer Phone (optional)</Label>
              <Input value={sellPhone} onChange={(e) => setSellPhone(e.target.value)} placeholder="03001234567" />
            </div>

            {/* Live total — checkout style */}
            <div className="rounded-lg bg-emerald-50 border border-emerald-300 p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Load Amount:</span>
                <span className="font-mono">Rs {sellAmountNum.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Extra Charges:</span>
                <span className="font-mono text-emerald-700">Rs {sellExtraNum.toLocaleString()}</span>
              </div>
              <div className="border-t border-emerald-300 mt-1 pt-1 flex justify-between">
                <span className="font-bold">Total to Collect:</span>
                <span className="font-bold text-emerald-700 text-lg">Rs {sellTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSellOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving || !sellCompany || sellAmountNum <= 0} onClick={handleSellLoad}>
              {saving ? "Saving..." : `Checkout — Rs ${sellTotal.toLocaleString()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 3: BILL PAYMENT — amount + extra charges (profit)
// ═════════════════════════════════════════════════════════════════════════════

function BillTab() {
  const [transactions, setTransactions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [todayTotal, setTodayTotal] = React.useState(0);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/load-bill/bill-payment?limit=50", { cache: "no-store" });
      const data = await res.json();
      const txns = data.transactions || data.payments || [];
      setTransactions(txns);

      // Calculate today's total
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTxns = txns.filter((t: any) => new Date(t.createdAt) >= today);
      const total = todayTxns.reduce((s: number, t: any) => s + (t.totalPaid || 0), 0);
      setTodayTotal(total);
    } catch {
      toast.error("Failed to load bill payments");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Add bill payment dialog
  const [addOpen, setAddOpen] = React.useState(false);
  const [billCategory, setBillCategory] = React.useState("electricity");
  const [billAmount, setBillAmount] = React.useState("");
  const [billExtra, setBillExtra] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleSaveBill() {
    const amt = parseFloat(billAmount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid bill amount");
      return;
    }
    const extra = parseFloat(billExtra) || 0;
    setSaving(true);
    try {
      const res = await fetch("/api/load-bill/bill-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: billCategory,
          billAmount: amt,
          serviceCharge: extra,
          totalPaid: amt + extra,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed");
        setSaving(false);
        return;
      }
      toast.success(`Bill payment: Rs ${amt}${extra > 0 ? ` + Rs ${extra} extra` : ""}`);
      setAddOpen(false);
      setBillAmount("");
      setBillExtra("");
      load();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-600" />
            Bill Payment
          </CardTitle>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Bill Payment
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Today's total summary */}
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-emerald-700 font-medium">آج کی کل سیل (Today's Total)</div>
            <div className="text-2xl font-bold text-emerald-700">Rs {todayTotal.toLocaleString("en-PK")}</div>
          </div>
          <FileText className="w-8 h-8 text-emerald-400" />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No bill payments yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Bill Amount</TableHead>
                  <TableHead className="text-right">Extra Charges</TableHead>
                  <TableHead className="text-right">Total Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{new Date(t.createdAt).toLocaleString("en-PK")}</TableCell>
                    <TableCell className="capitalize">{t.category}</TableCell>
                    <TableCell className="text-right font-mono">Rs {t.billAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-700">Rs {t.serviceCharge.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono font-bold">Rs {t.totalPaid.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Bill Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <select
                className="w-full rounded-md border border-input px-3 py-2 text-sm"
                value={billCategory}
                onChange={(e) => setBillCategory(e.target.value)}
              >
                <option value="electricity">Electricity</option>
                <option value="gas">Gas</option>
                <option value="water">Water</option>
                <option value="internet">Internet</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Bill Amount *</Label>
              <Input type="number" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} placeholder="e.g. 5000" />
            </div>
            <div className="space-y-2">
              <Label>Extra Charges (profit)</Label>
              <Input type="number" value={billExtra} onChange={(e) => setBillExtra(e.target.value)} placeholder="0" />
              <p className="text-xs text-muted-foreground">Extra charges are your profit on this bill payment</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={handleSaveBill}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 4: WALLET — send/receive money (amount + extra charges)
// ═════════════════════════════════════════════════════════════════════════════

function WalletTab() {
  const [transactions, setTransactions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/load-bill/wallet?limit=20", { cache: "no-store" });
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch {
      toast.error("Failed to load wallet transactions");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Add wallet transaction dialog
  const [addOpen, setAddOpen] = React.useState(false);
  const [walletProvider, setWalletProvider] = React.useState("JAZZCASH");
  const [walletType, setWalletType] = React.useState("SEND");
  const [walletAmount, setWalletAmount] = React.useState("");
  const [walletExtra, setWalletExtra] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleSaveWallet() {
    const amt = parseFloat(walletAmount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const extra = parseFloat(walletExtra) || 0;
    setSaving(true);
    try {
      const res = await fetch("/api/load-bill/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: walletProvider,
          type: walletType,
          amount: amt,
          serviceCharge: extra,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed");
        setSaving(false);
        return;
      }
      toast.success(`${walletType === "SEND" ? "Sent" : "Received"}: Rs ${amt}${extra > 0 ? ` + Rs ${extra} extra` : ""}`);
      setAddOpen(false);
      setWalletAmount("");
      setWalletExtra("");
      load();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  // Calculate totals
  const totalSent = transactions.filter((t) => t.type === "SEND").reduce((s, t) => s + t.amount, 0);
  const totalReceived = transactions.filter((t) => t.type === "RECEIVE").reduce((s, t) => s + t.amount, 0);
  const totalExtra = transactions.reduce((s, t) => s + (t.serviceCharge || 0), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            Wallet (JazzCash / Easypaisa)
          </CardTitle>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Transaction
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-center">
            <div className="text-xs text-rose-700">Total Sent</div>
            <div className="text-lg font-bold text-rose-700">Rs {totalSent.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-center">
            <div className="text-xs text-emerald-700">Total Received</div>
            <div className="text-lg font-bold text-emerald-700">Rs {totalReceived.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-center">
            <div className="text-xs text-blue-700">Total Extra (Profit)</div>
            <div className="text-lg font-bold text-blue-700">Rs {totalExtra.toLocaleString()}</div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No wallet transactions yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Extra</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{new Date(t.createdAt).toLocaleString("en-PK")}</TableCell>
                    <TableCell>{t.provider}</TableCell>
                    <TableCell>
                      <Badge variant={t.type === "SEND" ? "destructive" : "default"}>
                        {t.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">Rs {t.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-700">Rs {(t.serviceCharge || 0).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Wallet Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Provider</Label>
              <select
                className="w-full rounded-md border border-input px-3 py-2 text-sm"
                value={walletProvider}
                onChange={(e) => setWalletProvider(e.target.value)}
              >
                <option value="JAZZCASH">JazzCash</option>
                <option value="EASYPAISA">Easypaisa</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <select
                className="w-full rounded-md border border-input px-3 py-2 text-sm"
                value={walletType}
                onChange={(e) => setWalletType(e.target.value)}
              >
                <option value="SEND">Send Money</option>
                <option value="RECEIVE">Receive Money</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input type="number" value={walletAmount} onChange={(e) => setWalletAmount(e.target.value)} placeholder="e.g. 5000" />
            </div>
            <div className="space-y-2">
              <Label>Extra Charges (profit)</Label>
              <Input type="number" value={walletExtra} onChange={(e) => setWalletExtra(e.target.value)} placeholder="0" />
              <p className="text-xs text-muted-foreground">Extra charges are your profit on this transaction</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={handleSaveWallet}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
