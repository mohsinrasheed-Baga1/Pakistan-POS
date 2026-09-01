"use client";

import * as React from "react";
import {
  Smartphone, Plus, RefreshCw, Wallet, FileText, ArrowDownLeft, ArrowUpRight,
  TrendingUp, TrendingDown, CreditCard, BarChart3, DollarSign, Search, Phone,
  PackageOpen, ArrowLeftRight, Banknote, ArrowDownToLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatMoney } from "@/lib/pos-utils";

interface LoadBillViewProps { userRole: string; }

// ─── Types ───────────────────────────────────────────────────────────────────
interface Company {
  id: string; name: string; balance: number; totalPurchased: number; totalSold: number; totalProfit: number;
}
interface WalletAccount {
  id: string; name: string; provider: string; phoneNumber: string | null;
  accountNumber: string | null; balance: number; totalReceived: number;
  totalSent: number; totalCharges: number; active: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// v2.10.54: Simple Error Boundary class component
// Catches any error from children and shows a retry button instead of
// crashing the entire page.
// ═════════════════════════════════════════════════════════════════════════════
class LoadBillErrorBoundary extends React.Component<
  { children: React.ReactNode; onRetry: () => void },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any) {
    console.error("[LoadBill ErrorBoundary]", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-rose-300 bg-rose-50">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-rose-700 mb-3">
              LoadBill page mein error aaya. Retry karein.
            </p>
            <Button variant="outline" onClick={() => { this.setState({ hasError: false }); this.props.onRetry(); }}>
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// v2.10.54: Wrapped in error boundary so page NEVER crashes — if any
// sub-component throws, we catch it and show a friendly error + retry button.
// ═════════════════════════════════════════════════════════════════════════════
export function LoadBillView({ userRole }: LoadBillViewProps) {
  const isAdmin = userRole === "ADMIN" || userRole === "MANAGER";
  const [refresh, setRefresh] = React.useState(0);
  const [syncing, setSyncing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const triggerRefresh = () => { setRefresh(r => r + 1); setError(null); };

  // v2.10.50: Sync LoadBill entities → POS Products
  async function syncToPos() {
    setSyncing(true);
    try {
      const res = await fetch("/api/load-bill/sync-pos-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        const r = d.results;
        toast.success(`Synced to POS: ${r.companies} companies, ${r.wallets} wallets, ${r.sims} SIM types`);
      } else {
        toast.error(d.error || "Sync failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-emerald-600" />
            Load & Bill Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            SIM Load • Bill Payment • JazzCash/Easypaisa • SIM Sales — ایک جگہ سے سب
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-blue-500 text-blue-700 hover:bg-blue-50"
            onClick={syncToPos}
            disabled={syncing}
          >
            <ArrowLeftRight className="w-4 h-4 mr-1" />
            {syncing ? "Syncing..." : "Sync to POS"}
          </Button>
          <Button variant="outline" size="sm" onClick={triggerRefresh}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* v2.10.54: Error boundary — if any sub-component crashes, show error
          + retry instead of white screen */}
      {error ? (
        <Card className="border-rose-300 bg-rose-50">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-rose-700 mb-3">{error}</p>
            <Button variant="outline" onClick={() => { setError(null); triggerRefresh(); }}>
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <LoadBillErrorBoundary onRetry={triggerRefresh}>
          <DashboardSummary refreshKey={refresh} />

          <Tabs defaultValue="load" className="w-full">
            <TabsList className="w-full sm:w-auto flex flex-wrap">
              <TabsTrigger value="load"><Smartphone className="w-4 h-4 mr-1" /> Load</TabsTrigger>
              <TabsTrigger value="productLoad"><PackageOpen className="w-4 h-4 mr-1" /> Product Load</TabsTrigger>
              <TabsTrigger value="bill"><FileText className="w-4 h-4 mr-1" /> Bill</TabsTrigger>
              <TabsTrigger value="wallet"><Wallet className="w-4 h-4 mr-1" /> Cash/Wallet</TabsTrigger>
              <TabsTrigger value="sim"><CreditCard className="w-4 h-4 mr-1" /> SIM</TabsTrigger>
              <TabsTrigger value="reports"><BarChart3 className="w-4 h-4 mr-1" /> Reports</TabsTrigger>
            </TabsList>
            <TabsContent value="load"><LoadTab isAdmin={isAdmin} refreshKey={refresh} onRefresh={triggerRefresh} /></TabsContent>
            <TabsContent value="productLoad"><ProductLoadTab isAdmin={isAdmin} refreshKey={refresh} onRefresh={triggerRefresh} /></TabsContent>
            <TabsContent value="bill"><BillTab refreshKey={refresh} onRefresh={triggerRefresh} /></TabsContent>
            <TabsContent value="wallet"><WalletTab isAdmin={isAdmin} refreshKey={refresh} onRefresh={triggerRefresh} /></TabsContent>
            <TabsContent value="sim"><SimTab isAdmin={isAdmin} refreshKey={refresh} onRefresh={triggerRefresh} /></TabsContent>
            <TabsContent value="reports"><ReportsTab refreshKey={refresh} /></TabsContent>
          </Tabs>
        </LoadBillErrorBoundary>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD SUMMARY
// ═════════════════════════════════════════════════════════════════════════════
function DashboardSummary({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = React.useState<any>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // v2.10.54: Each fetch wrapped in try-catch so one failure doesn't
        // crash the entire dashboard. This prevents the "page not opening"
        // issue when one endpoint is slow or returns an error.
        let loads: any[] = [];
        let bills: any[] = [];
        let wallets: any[] = [];
        let companies: any[] = [];
        let accounts: any[] = [];

        try {
          const r = await fetch("/api/load-bill/mobile-load?limit=500", { cache: "no-store" });
          if (r.ok) { const d = await r.json(); loads = d.transactions || []; }
        } catch (e) { console.warn("[Dashboard] mobile-load fetch failed:", e); }
        try {
          const r = await fetch("/api/load-bill/bill-payment?limit=500", { cache: "no-store" });
          if (r.ok) { const d = await r.json(); bills = d.transactions || d.payments || []; }
        } catch (e) { console.warn("[Dashboard] bill-payment fetch failed:", e); }
        try {
          const r = await fetch("/api/load-bill/wallet?limit=500", { cache: "no-store" });
          if (r.ok) { const d = await r.json(); wallets = d.transactions || []; }
        } catch (e) { console.warn("[Dashboard] wallet fetch failed:", e); }
        try {
          const r = await fetch("/api/load-bill/companies", { cache: "no-store" });
          if (r.ok) { const d = await r.json(); companies = d.companies || []; }
        } catch (e) { console.warn("[Dashboard] companies fetch failed:", e); }
        try {
          const r = await fetch("/api/load-bill/wallet-accounts", { cache: "no-store" });
          if (r.ok) { const d = await r.json(); accounts = d.accounts || []; }
        } catch (e) { console.warn("[Dashboard] wallet-accounts fetch failed:", e); }

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const isToday = (d: string) => { try { return new Date(d) >= today; } catch { return false; } };

        const tLoads = loads.filter((t: any) => isToday(t.createdAt) && t.type === "SALE");
        const tBills = bills.filter((t: any) => isToday(t.createdAt));
        const tWallets = wallets.filter((t: any) => isToday(t.createdAt));

        // v2.10.54: Today's totals — principal only (NOT charges)
        const totalLoad = tLoads.reduce((s: number, t: any) => s + (t.salePrice || t.amount || 0), 0);
        const totalBill = tBills.reduce((s: number, t: any) => s + (t.totalPaid || 0), 0);
        // v2.10.54 FIX: Wallet received/sent should show PRINCIPAL only (not charges)
        // Charges are tracked SEPARATELY as profit below.
        const totalReceived = tWallets.filter((t: any) => t.type === "RECEIVE").reduce((s: number, t: any) => s + (t.amount || 0), 0);
        const totalSent = tWallets.filter((t: any) => t.type === "SEND").reduce((s: number, t: any) => s + (t.amount || 0), 0);

        // v2.10.54 FIX: Profit = ONLY extra charges (serviceCharge), NOT principal
        // Previously, wallet transactions' `amount` was being counted in profit
        // calculations via `totalReceived`/`totalSent` which included charges.
        // Now: profit is strictly the sum of serviceCharge for each transaction.
        const loadProfit = tLoads.reduce((s: number, t: any) => s + ((t.salePrice || 0) - (t.amount || 0)), 0);
        const billProfit = tBills.reduce((s: number, t: any) => s + (t.serviceCharge || 0), 0);
        const walletProfit = tWallets.reduce((s: number, t: any) => s + (t.serviceCharge || 0), 0);
        const totalCharges = loadProfit + billProfit + walletProfit;

        const totalDue = [...tLoads, ...tBills, ...tWallets].reduce((s: number, t: any) => s + (t.due || 0), 0);
        const grandTotal = totalLoad + totalBill + totalReceived;

        // v2.10.53: Current balances — all-time, living totals
        const currentLoadBalance = companies.reduce((s: number, c: any) => s + (c.balance || 0), 0);
        const currentCashBalance = accounts.reduce((s: number, a: any) => s + (a.balance || 0), 0);
        const totalBillCollected = bills.reduce((s: number, t: any) => s + (t.totalPaid || 0), 0);

        if (mounted) {
          setData({
            totalLoad, totalBill, totalReceived, totalSent,
            totalCharges, totalDue, grandTotal,
            currentLoadBalance, currentCashBalance, totalBillCollected,
          });
        }
      } catch (err) {
        console.error("[Dashboard] unexpected error:", err);
        // Don't crash — set empty data
        if (mounted) setData({});
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [refreshKey]);

  // v2.10.54: If data failed to load, still render the page (don't crash)
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {[0, 1, 2].map(i => (
          <Card key={i} className="bg-muted/30">
            <CardContent className="p-4">
              <div className="h-4 w-24 bg-muted animate-pulse rounded mb-2" />
              <div className="h-8 w-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Row 1: Current balances (big, prominent)
  const currentBalances: Array<{ label: string; value: number; icon: any; color: string; bg: string; sublabel?: string }> = [
    { label: "موجودہ لوڈ بیلنس", value: data.currentLoadBalance || 0, icon: Smartphone, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-300", sublabel: "All companies" },
    { label: "موجودہ کیش بیلنس", value: data.currentCashBalance || 0, icon: Wallet, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-300", sublabel: "All wallets" },
    { label: "کل بل وصولی", value: data.totalBillCollected || 0, icon: FileText, color: "text-blue-700", bg: "bg-blue-50 border-blue-300", sublabel: "All-time" },
  ];

  // Row 2: Today's transactions
  const todayStats: Array<{ label: string; value: number; icon: any; color: string; bg: string }> = [
    { label: "آج کا لوڈ", value: data.totalLoad || 0, icon: Smartphone, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
    { label: "آج کے بل", value: data.totalBill || 0, icon: FileText, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
    { label: "وصول", value: data.totalReceived || 0, icon: ArrowDownLeft, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
    { label: "بھیجا", value: data.totalSent || 0, icon: ArrowUpRight, color: "text-rose-700", bg: "bg-rose-50 border-rose-200" },
    { label: "آج کی سیل", value: data.grandTotal || 0, icon: DollarSign, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
    { label: "منافع (charges)", value: data.totalCharges || 0, icon: TrendingUp, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
    { label: "بقایا", value: data.totalDue || 0, icon: TrendingDown, color: "text-rose-700", bg: "bg-rose-50 border-rose-200" },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {currentBalances.map((s, i) => (
          <Card key={i} className={`${s.bg} border-2`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-5 h-5 ${s.color}`} />
                <span className="text-xs font-bold text-muted-foreground">{s.label}</span>
              </div>
              <div className={`text-2xl font-bold ${s.color}`}>
                Rs {(s.value || 0).toLocaleString("en-PK")}
              </div>
              {s.sublabel && (
                <div className="text-[10px] text-muted-foreground mt-0.5">{s.sublabel}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {todayStats.map((s, i) => (
          <Card key={i} className={s.bg}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                <span className="text-[10px] font-medium text-muted-foreground">{s.label}</span>
              </div>
              <div className={`text-base font-bold ${s.color}`}>
                Rs {(s.value || 0).toLocaleString("en-PK")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// UNIFIED CHECKOUT DIALOG
// ═════════════════════════════════════════════════════════════════════════════
function CheckoutDialog({ open, onClose, title, fields, totals, onConfirm, saving }: {
  open: boolean; onClose: () => void; title: string;
  fields: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; options?: { value: string; label: string }[] }[];
  totals: { label: string; value: number }[];
  onConfirm: () => void; saving: boolean;
}) {
  const grandTotal = totals.reduce((s, t) => s + t.value, 0);
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {fields.map((f, i) => (
            <div key={i} className="space-y-1">
              <Label className="text-xs">{f.label}</Label>
              {f.type === "select" && f.options ? (
                <select className="w-full rounded-md border border-input px-3 py-2 text-sm" value={f.value} onChange={(e) => f.onChange(e.target.value)}>
                  <option value="">{f.placeholder || "Select"}</option>
                  {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <Input type={f.type || "text"} value={f.value} onChange={(e) => f.onChange(e.target.value)} placeholder={f.placeholder} className="h-9" autoFocus={i === 0} />
              )}
            </div>
          ))}
          <div className="rounded-lg bg-emerald-50 border border-emerald-300 p-3 space-y-1">
            {totals.map((t, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t.label}:</span>
                <span className="font-mono">Rs {t.value.toLocaleString()}</span>
              </div>
            ))}
            <div className="border-t border-emerald-300 mt-1 pt-1 flex justify-between">
              <span className="font-bold">کل وصول:</span>
              <span className="font-bold text-emerald-700 text-lg">Rs {grandTotal.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={onConfirm}>
            {saving ? "..." : `Checkout — Rs ${grandTotal.toLocaleString()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1: LOAD MANAGEMENT
// SIM cards treated as products with balance. Receive load adds balance.
// Sell load deducts from balance. Remaining balance always visible.
// ═════════════════════════════════════════════════════════════════════════════
function LoadTab({ isAdmin, refreshKey, onRefresh }: { isAdmin: boolean; refreshKey: number; onRefresh: () => void }) {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [txns, setTxns] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sellOpen, setSellOpen] = React.useState(false);
  const [recvOpen, setRecvOpen] = React.useState(false);
  const [selCompany, setSelCompany] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [extra, setExtra] = React.useState("");
  const [due, setDue] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [search, setSearch] = React.useState("");
  // Add new company dialog
  const [addCompanyOpen, setAddCompanyOpen] = React.useState(false);
  const [newCompanyName, setNewCompanyName] = React.useState("");
  const [addCompanySaving, setAddCompanySaving] = React.useState(false);
  // v2.10.52: Edit company state
  const [editCompanyOpen, setEditCompanyOpen] = React.useState(false);
  const [editCompanyId, setEditCompanyId] = React.useState("");
  const [editCompanyName, setEditCompanyName] = React.useState("");
  const [editCompanyBalance, setEditCompanyBalance] = React.useState("");
  const [editCompanySaving, setEditCompanySaving] = React.useState(false);

  // Handle creating a new company, then immediately select it
  async function handleAddCompany() {
    const name = newCompanyName.trim();
    if (!name) { toast.error("Company name required"); return; }
    setAddCompanySaving(true);
    try {
      const res = await fetch("/api/load-bill/companies", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || "Failed"); setAddCompanySaving(false); return; }
      toast.success(`Company "${name}" added`);
      setAddCompanyOpen(false);
      setNewCompanyName("");
      await load();
      setSelCompany(d.company.id);
      onRefresh();
    } catch { toast.error("Network error"); }
    finally { setAddCompanySaving(false); }
  }

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // Fetch separately so one failing doesn't break the other
      let cd: any = { companies: [] };
      let td: any = { transactions: [] };
      try {
        const r = await fetch("/api/load-bill/companies", { cache: "no-store" });
        if (r.ok) cd = await r.json();
      } catch {}
      try {
        const r = await fetch("/api/load-bill/mobile-load?limit=50", { cache: "no-store" });
        if (r.ok) td = await r.json();
      } catch {}
      setCompanies(cd.companies || []);
      setTxns(td.transactions || []);
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load, refreshKey]);

  const amtNum = parseFloat(amount) || 0;
  const extraNum = parseFloat(extra) || 0;
  const dueNum = parseFloat(due) || 0;
  const total = amtNum + extraNum;

  // Selected company's current balance (for display in sell dialog)
  const selectedCompany = companies.find(c => c.id === selCompany);
  const remainingAfter = selectedCompany ? selectedCompany.balance - amtNum : 0;

  // Filter companies by search
  const filteredCompanies = companies.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSell() {
    if (!selCompany) { toast.error("Select company"); return; }
    if (amtNum <= 0) { toast.error("Enter amount"); return; }
    if (selectedCompany && amtNum > selectedCompany.balance) {
      toast.error(`Insufficient balance! Only Rs ${selectedCompany.balance.toLocaleString()} available`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/load-bill/mobile-load", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: selCompany, type: "SALE", amount: amtNum, salePrice: total, due: dueNum, customerPhone: phone || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error); setSaving(false); return; }
      toast.success(`Load sold: Rs ${total} | Remaining: Rs ${remainingAfter.toLocaleString()}`);
      setSellOpen(false); setSelCompany(""); setAmount(""); setExtra(""); setDue(""); setPhone("");
      load(); onRefresh();
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  }

  async function handleReceive() {
    if (!selCompany) { toast.error("Select company"); return; }
    if (amtNum <= 0) { toast.error("Enter amount"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/load-bill/mobile-load", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: selCompany, type: "PURCHASE", amount: amtNum, costPrice: amtNum }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error); setSaving(false); return; }
      toast.success(`Load received: Rs ${amtNum} | New balance: Rs ${(selectedCompany!.balance + amtNum).toLocaleString()}`);
      setRecvOpen(false); setSelCompany(""); setAmount("");
      load(); onRefresh();
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  }

  const companyOptions = companies.map(c => ({
    value: c.id,
    label: `${c.name} — Balance: Rs ${c.balance.toLocaleString()}`,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5 text-emerald-600" /> Mobile Load</CardTitle>
          <div className="flex gap-2">
            {isAdmin && (
              <Button size="sm" variant="outline" className="border-blue-600 text-blue-700 bg-blue-50"
                onClick={() => { setNewCompanyName(""); setAddCompanyOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Add Company
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" variant="outline" className="border-blue-300 text-blue-700"
                onClick={() => { setSelCompany(""); setAmount(""); setRecvOpen(true); }}>
                <ArrowDownLeft className="w-4 h-4 mr-1" /> Receive Load
              </Button>
            )}
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => { setSelCompany(""); setAmount(""); setExtra(""); setDue(""); setPhone(""); setSellOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Sell Load
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search company... (e.g. Jazz, Zong, Easypaisa)" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>

        {/* If no companies exist yet — show add prompt */}
        {companies.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-blue-300 bg-blue-50 p-6 text-center">
            <Smartphone className="w-10 h-10 text-blue-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-blue-800 mb-1">No load companies yet — کوئی کمپنی موجود نہیں</p>
            <p className="text-xs text-muted-foreground mb-3">
              Click "Add Company" to create your first company (e.g. Jazz, Zong, Telenor).
              Then click "Receive Load" to add balance.
            </p>
            {isAdmin && (
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700"
                onClick={() => { setNewCompanyName(""); setAddCompanyOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Add Company
              </Button>
            )}
          </div>
        )}

        {/* Company balance cards — each shows balance + quick receive/send buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filteredCompanies.map(c => (
            <div key={c.id} className={`rounded-lg border-2 p-3 transition-all ${c.balance > 0 ? "border-emerald-300 bg-emerald-50" : "border-muted bg-muted/30"}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-bold">{c.name}</div>
                <div className={`text-lg font-bold ${c.balance > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                  Rs {c.balance.toLocaleString()}
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground mb-2">
                Sold: Rs {c.totalSold.toLocaleString()} • Profit: Rs {c.totalProfit.toLocaleString()}
              </div>
              {/* Quick action buttons — POS-like instant access */}
              <div className="flex gap-1">
                {isAdmin && (
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-1 border-blue-300 text-blue-700"
                    onClick={() => { setSelCompany(c.id); setAmount(""); setRecvOpen(true); }}>
                    <ArrowDownLeft className="w-3 h-3 mr-1" /> Receive
                  </Button>
                )}
                <Button size="sm" className="h-7 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => { setSelCompany(c.id); setAmount(""); setExtra(""); setDue(""); setPhone(""); setSellOpen(true); }}>
                  <Plus className="w-3 h-3 mr-1" /> Sell
                </Button>
              </div>
              {/* v2.10.52: Edit + Delete buttons */}
              {isAdmin && (
                <div className="flex gap-1 mt-1">
                  <Button
                    size="sm" variant="ghost" className="h-6 text-xs flex-1 text-blue-600 hover:bg-blue-50"
                    onClick={() => { setEditCompanyId(c.id); setEditCompanyName(c.name); setEditCompanyBalance(String(c.balance)); setEditCompanyOpen(true); }}
                  >
                    ✎ Rename
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="h-6 text-xs flex-1 text-rose-600 hover:bg-rose-50"
                    onClick={async () => {
                      if (!confirm(`Delete company "${c.name}"?\n\nThis will also delete all its transactions. This cannot be undone.`)) return;
                      try {
                        const res = await fetch(`/api/load-bill/companies?id=${c.id}`, { method: "DELETE" });
                        if (res.ok) { toast.success(`Company "${c.name}" deleted`); load(); onRefresh(); }
                        else { const d = await res.json(); toast.error(d.error || "Failed"); }
                      } catch { toast.error("Network error"); }
                    }}
                  >
                    🗑 Delete
                  </Button>
                </div>
              )}
            </div>
          ))}
          {filteredCompanies.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-4">
              {companies.length === 0 ? "No companies added yet. Click Receive Load to add." : "No companies found"}
            </div>
          )}
        </div>

        {/* Recent transactions */}
        {loading ? <div className="h-20 rounded bg-muted animate-pulse" /> : txns.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">No transactions yet</div>
        ) : (
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Company</TableHead><TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Extra</TableHead>
                <TableHead className="text-right">Due</TableHead><TableHead>Phone</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {txns.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{new Date(t.createdAt).toLocaleString("en-PK")}</TableCell>
                    <TableCell>{t.companyName || "-"}</TableCell>
                    <TableCell><Badge variant={t.type === "SALE" ? "default" : "secondary"}>{t.type}</Badge></TableCell>
                    <TableCell className="text-right font-mono">Rs {t.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-700">{t.type === "SALE" ? `Rs ${(t.salePrice - t.amount).toLocaleString()}` : "-"}</TableCell>
                    <TableCell className="text-right font-mono text-rose-600">{(t.due || 0) > 0 ? `Rs ${t.due.toLocaleString()}` : "-"}</TableCell>
                    <TableCell className="text-xs">{t.customerPhone || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Sell Load Checkout — shows current balance + remaining after sale
          NOTE: "Total" = Load Amount + Extra Charges (what customer pays)
          "Current Balance" = company's existing balance (info only, NOT added to total)
          "After Sale (بقایا)" = balance - load amount (info only, NOT added to total) */}
      <CheckoutDialog
        open={sellOpen} onClose={() => setSellOpen(false)} title="Sell Mobile Load — لوڈ بیچیں"
        saving={saving} onConfirm={handleSell}
        fields={[
          { label: "Company *", value: selCompany, onChange: setSelCompany, type: "select", options: companyOptions, placeholder: "Select company" },
          { label: "Load Amount *", value: amount, onChange: setAmount, type: "number", placeholder: "e.g. 100" },
          { label: "Extra Charges (profit)", value: extra, onChange: setExtra, type: "number", placeholder: "0" },
          { label: "Due (if unpaid)", value: due, onChange: setDue, type: "number", placeholder: "0" },
          { label: "Customer Phone", value: phone, onChange: setPhone, placeholder: "03001234567" },
        ]}
        totals={[
          { label: "Load Amount", value: amtNum },
          { label: "Extra Charges", value: extraNum },
        ]}
      />

      {/* Add Company Dialog — create a new company before receiving load */}
      <Dialog open={addCompanyOpen} onOpenChange={setAddCompanyOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add New Company — نئی کمپنی</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Company Name *</Label>
              <Input
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="e.g. Jazz, Zong, Telenor, Ufone"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCompany(); } }}
              />
              <p className="text-[10px] text-muted-foreground">
                Enter the company name. After creating, you can receive load balance for this company.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCompanyOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" disabled={addCompanySaving} onClick={handleAddCompany}>
              {addCompanySaving ? "..." : "Create Company"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive Load — adds balance to SIM
          Total = Amount only (not current balance + amount) */}
      <CheckoutDialog
        open={recvOpen} onClose={() => setRecvOpen(false)} title="Receive Load — لوڈ وصول"
        saving={saving} onConfirm={handleReceive}
        fields={[
          { label: "Company *", value: selCompany, onChange: setSelCompany, type: "select", options: companyOptions, placeholder: "Select company" },
          { label: "Amount *", value: amount, onChange: setAmount, type: "number", placeholder: "e.g. 5000" },
        ]}
        totals={[
          { label: "Load Received", value: amtNum },
        ]}
      />

      {/* v2.10.52: Edit Company Dialog */}
      <Dialog open={editCompanyOpen} onOpenChange={setEditCompanyOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
            <DialogDescription>Rename company or adjust its balance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Company Name *</Label>
              <Input
                value={editCompanyName}
                onChange={(e) => setEditCompanyName(e.target.value)}
                placeholder="e.g. Jazz, Ufone, Telenor"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label>Balance (optional — leave blank to keep unchanged)</Label>
              <Input
                type="number"
                value={editCompanyBalance}
                onChange={(e) => setEditCompanyBalance(e.target.value)}
                placeholder="Leave blank to keep current"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCompanyOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={editCompanySaving}
              onClick={async () => {
                if (!editCompanyName.trim()) { toast.error("Company name required"); return; }
                setEditCompanySaving(true);
                try {
                  const body: any = { id: editCompanyId, name: editCompanyName.trim() };
                  if (editCompanyBalance.trim() !== "") body.balance = parseFloat(editCompanyBalance) || 0;
                  const res = await fetch("/api/load-bill/companies", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  });
                  const d = await res.json();
                  if (!res.ok) { toast.error(d.error || "Failed"); setEditCompanySaving(false); return; }
                  toast.success(`Company updated: ${d.company.name}`);
                  setEditCompanyOpen(false);
                  load(); onRefresh();
                } catch { toast.error("Network error"); }
                finally { setEditCompanySaving(false); }
              }}
            >
              {editCompanySaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2: BILL PAYMENT — amount + charges + due, daily total
// ═════════════════════════════════════════════════════════════════════════════
function BillTab({ refreshKey, onRefresh }: { refreshKey: number; onRefresh: () => void }) {
  const [txns, setTxns] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [withdrawOpen, setWithdrawOpen] = React.useState(false);
  const [withdrawAmount, setWithdrawAmount] = React.useState("");
  const [withdrawNote, setWithdrawNote] = React.useState("");
  const [withdrawSaving, setWithdrawSaving] = React.useState(false);
  const [category, setCategory] = React.useState("electricity");
  const [billAmount, setBillAmount] = React.useState("");
  const [charge, setCharge] = React.useState("");
  const [due, setDue] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/load-bill/bill-payment?limit=50", { cache: "no-store" });
      const d = await res.json();
      setTxns(d.transactions || d.payments || []);
    } catch { toast.error("Failed"); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load, refreshKey]);

  // v2.10.48: Calculate total collected bills (all-time, not just today)
  const totalCollected = txns.reduce((s, t) => s + (t.totalPaid || 0), 0);
  const totalCharges = txns.reduce((s, t) => s + (t.serviceCharge || 0), 0);
  const totalDue = txns.reduce((s, t) => s + (t.due || 0), 0);

  // Today's total collection
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayTxns = txns.filter(t => new Date(t.createdAt) >= today);
  const todayTotal = todayTxns.reduce((s, t) => s + (t.totalPaid || 0), 0);
  const todayCharges = todayTxns.reduce((s, t) => s + (t.serviceCharge || 0), 0);
  const todayDue = todayTxns.reduce((s, t) => s + (t.due || 0), 0);

  async function handleWithdraw() {
    const amt = parseFloat(withdrawAmount) || 0;
    if (amt <= 0) { toast.error("Enter amount > 0"); return; }
    if (amt > totalCollected) {
      toast.error(`Cannot withdraw more than total collected (Rs ${totalCollected.toLocaleString()})`);
      return;
    }
    setWithdrawSaving(true);
    try {
      // Create a "WITHDRAW" bill payment transaction to track the withdrawal
      const res = await fetch("/api/load-bill/bill-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "withdrawal",
          billAmount: -amt,  // negative = withdrawal
          serviceCharge: 0,
          totalPaid: -amt,
          amountReceived: -amt,
          due: 0,
          note: withdrawNote.trim() || "Bill collection withdrawn",
        }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error); setWithdrawSaving(false); return; }
      toast.success(`Withdrew Rs ${amt.toLocaleString()} from bill collection`);
      setWithdrawOpen(false);
      setWithdrawAmount("");
      setWithdrawNote("");
      load(); onRefresh();
    } catch { toast.error("Network error"); }
    finally { setWithdrawSaving(false); }
  }

  const billNum = parseFloat(billAmount) || 0;
  const chargeNum = parseFloat(charge) || 0;
  const dueNum = parseFloat(due) || 0;
  const total = billNum + chargeNum;

  async function handleSave() {
    if (billNum <= 0) { toast.error("Enter bill amount"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/load-bill/bill-payment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, billAmount: billNum, serviceCharge: chargeNum, totalPaid: total, amountReceived: total - dueNum, due: dueNum }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error); setSaving(false); return; }
      toast.success(`Bill: Rs ${total}${dueNum > 0 ? ` (Due: Rs ${dueNum})` : ""}`);
      setOpen(false); setBillAmount(""); setCharge(""); setDue("");
      load(); onRefresh();
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-600" /> Bill Payment</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="border-rose-500 text-rose-700 hover:bg-rose-50" onClick={() => setWithdrawOpen(true)}>
              <ArrowDownToLine className="w-4 h-4 mr-1" /> Withdraw
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setBillAmount(""); setCharge(""); setDue(""); setOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Add Bill
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* v2.10.48: All-time totals (withdrawable amount + charges + due) */}
        <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-blue-900">کل بل وصولی (All-time)</span>
            <Badge variant="outline" className="bg-white">{txns.length} bills</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="text-xs text-blue-700">کل وصول شدہ</div>
              <div className="text-lg font-bold text-blue-900">Rs {totalCollected.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-blue-700">کل منافع</div>
              <div className="text-lg font-bold text-emerald-700">Rs {totalCharges.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-blue-700">کل بقایا</div>
              <div className="text-lg font-bold text-rose-600">Rs {totalDue.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Today's collection summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-center">
            <div className="text-xs text-emerald-700">آج کی کل وصولی</div>
            <div className="text-lg font-bold text-emerald-700">Rs {todayTotal.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-center">
            <div className="text-xs text-amber-700">آج کا منافع</div>
            <div className="text-lg font-bold text-amber-700">Rs {todayCharges.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-center">
            <div className="text-xs text-rose-700">آج کا بقایا</div>
            <div className="text-lg font-bold text-rose-700">Rs {todayDue.toLocaleString()}</div>
          </div>
        </div>

        {loading ? <div className="h-20 rounded bg-muted animate-pulse" /> : txns.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">No bill payments yet</div>
        ) : (
          <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Category</TableHead>
                <TableHead className="text-right">Bill</TableHead><TableHead className="text-right">Charge</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Due</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {txns.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{new Date(t.createdAt).toLocaleString("en-PK")}</TableCell>
                    <TableCell className="capitalize">{t.category}</TableCell>
                    <TableCell className="text-right font-mono">Rs {t.billAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-700">Rs {(t.serviceCharge || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono font-bold">Rs {(t.totalPaid || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-rose-600">{(t.due || 0) > 0 ? `Rs ${t.due.toLocaleString()}` : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <CheckoutDialog
        open={open} onClose={() => setOpen(false)} title="Bill Payment — بل ادائیگی"
        saving={saving} onConfirm={handleSave}
        fields={[
          { label: "Category", value: category, onChange: setCategory, type: "select",
            options: [
              { value: "electricity", label: "Electricity" },
              { value: "gas", label: "Gas" },
              { value: "water", label: "Water" },
              { value: "internet", label: "Internet" },
              { value: "other", label: "Other" },
            ] },
          { label: "Bill Amount *", value: billAmount, onChange: setBillAmount, type: "number", placeholder: "e.g. 5000" },
          { label: "Service Charge (profit)", value: charge, onChange: setCharge, type: "number", placeholder: "0" },
          { label: "Due (if unpaid)", value: due, onChange: setDue, type: "number", placeholder: "0" },
        ]}
        totals={[
          { label: "Bill Amount", value: billNum },
          { label: "Service Charge", value: chargeNum },
        ]}
      />

      {/* v2.10.48: Withdraw Dialog — withdraw money from bill collection */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Withdraw from Bill Collection</DialogTitle>
            <DialogDescription>
              Withdraw collected bill money from your collection. This creates a withdrawal record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-700">Available to withdraw:</span>
                <span className="font-bold text-blue-900">Rs {totalCollected.toLocaleString()}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-blue-700">Total charges (profit):</span>
                <span className="font-bold text-emerald-700">Rs {totalCharges.toLocaleString()}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Withdraw Amount *</Label>
              <Input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Input
                value={withdrawNote}
                onChange={(e) => setWithdrawNote(e.target.value)}
                placeholder="e.g. Cash withdrawal, Bank deposit"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700"
              disabled={withdrawSaving}
              onClick={handleWithdraw}
            >
              {withdrawSaving ? "Withdrawing..." : `Withdraw Rs ${withdrawAmount ? parseFloat(withdrawAmount).toLocaleString() : "0"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 3: WALLET — multiple JazzCash/Easypaisa/Bank accounts
// ═════════════════════════════════════════════════════════════════════════════
function WalletTab({ isAdmin, refreshKey, onRefresh }: { isAdmin: boolean; refreshKey: number; onRefresh: () => void }) {
  const [accounts, setAccounts] = React.useState<WalletAccount[]>([]);
  const [txns, setTxns] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [txnOpen, setTxnOpen] = React.useState(false);
  const [addAccOpen, setAddAccOpen] = React.useState(false);
  const [txnType, setTxnType] = React.useState("RECEIVE");
  const [selAccount, setSelAccount] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [charge, setCharge] = React.useState("");
  const [due, setDue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [accName, setAccName] = React.useState("");
  const [accProvider, setAccProvider] = React.useState("JAZZCASH");
  const [accPhone, setAccPhone] = React.useState("");
  const [accBalance, setAccBalance] = React.useState("");
  // v2.10.52: If set, the Add Account dialog is in EDIT mode
  const [editAccId, setEditAccId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      let ad: any = { accounts: [] };
      let td: any = { transactions: [] };
      try {
        const r = await fetch("/api/load-bill/wallet-accounts", { cache: "no-store" });
        if (r.ok) ad = await r.json();
      } catch {}
      try {
        const r = await fetch("/api/load-bill/wallet?limit=30", { cache: "no-store" });
        if (r.ok) td = await r.json();
      } catch {}
      setAccounts(ad.accounts || []);
      setTxns(td.transactions || []);
    } catch { toast.error("Failed"); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load, refreshKey]);

  const amtNum = parseFloat(amount) || 0;
  const chargeNum = parseFloat(charge) || 0;
  const dueNum = parseFloat(due) || 0;
  const total = amtNum + chargeNum;

  // v2.10.52 FIX: Extra charges are PROFIT — they must NOT be deducted
  // from the wallet balance. Only the PRINCIPAL amount affects balance:
  //   RECEIVE: balance += amtNum (charges are separate profit)
  //   SEND:    balance -= amtNum (charges are separate profit)
  // Previously, `total` (amt + charges) was added/subtracted, so charges
  // were wrongly deducted from the balance.
  const selectedAccount = accounts.find(a => a.id === selAccount);
  const balanceAfter = selectedAccount
    ? txnType === "RECEIVE" ? selectedAccount.balance + amtNum : selectedAccount.balance - amtNum
    : 0;

  async function handleTxn() {
    if (!selAccount) { toast.error("Select account"); return; }
    if (amtNum <= 0) { toast.error("Enter amount"); return; }
    if (txnType === "SEND" && amtNum > (selectedAccount?.balance || 0)) {
      toast.error(`Insufficient balance! Only Rs ${(selectedAccount?.balance || 0).toLocaleString()} available`);
      return;
    }
    setSaving(true);
    try {
      const acc = accounts.find(a => a.id === selAccount);
      const res = await fetch("/api/load-bill/wallet", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: selAccount, provider: acc?.provider || "JAZZCASH", type: txnType, amount: amtNum, serviceCharge: chargeNum, due: dueNum }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error); setSaving(false); return; }
      // Update account balance — v2.10.52: only PRINCIPAL amount affects
      // balance; charges are tracked separately as profit (totalCharges).
      if (acc) {
        await fetch("/api/load-bill/wallet-accounts", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selAccount, balance: balanceAfter, totalReceived: txnType === "RECEIVE" ? amtNum : 0, totalSent: txnType === "SEND" ? amtNum : 0, totalCharges: chargeNum }),
        });
      }
      toast.success(`${txnType === "RECEIVE" ? "Received" : "Sent"}: Rs ${total} | Balance: Rs ${balanceAfter.toLocaleString()}`);
      setTxnOpen(false); setSelAccount(""); setAmount(""); setCharge(""); setDue("");
      load(); onRefresh();
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  }

  async function handleAddAccount() {
    if (!accName.trim()) { toast.error("Account name required"); return; }
    setSaving(true);
    try {
      // v2.10.52: If editAccId is set, we're EDITING an existing account
      if (editAccId) {
        const res = await fetch("/api/load-bill/wallet-accounts", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editAccId,
            name: accName,
            provider: accProvider,
            phoneNumber: accPhone,
            balance: accBalance !== "" ? (parseFloat(accBalance) || 0) : undefined,
          }),
        });
        const d = await res.json();
        if (!res.ok) { toast.error(d.error); setSaving(false); return; }
        toast.success("Account updated");
        setAddAccOpen(false); setAccName(""); setAccPhone(""); setAccBalance(""); setEditAccId(null);
        load(); onRefresh();
        return;
      }

      const res = await fetch("/api/load-bill/wallet-accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: accName, provider: accProvider, phoneNumber: accPhone, balance: accBalance || 0 }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error); setSaving(false); return; }
      toast.success("Account added");
      setAddAccOpen(false); setAccName(""); setAccPhone(""); setAccBalance("");
      load(); onRefresh();
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  }

  const accountOptions = accounts.map(a => ({
    value: a.id,
    label: `${a.name} — Balance: Rs ${a.balance.toLocaleString()}`,
  }));

  // v2.10.48: Calculate total balance across all accounts
  const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const totalReceived = accounts.reduce((s, a) => s + (a.totalReceived || 0), 0);
  const totalSent = accounts.reduce((s, a) => s + (a.totalSent || 0), 0);
  const totalChargesAll = accounts.reduce((s, a) => s + (a.totalCharges || 0), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Wallet className="w-5 h-5 text-emerald-600" /> Digital Wallet (Cash)</CardTitle>
          <div className="flex gap-2">
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => { setAccName(""); setAccPhone(""); setAccBalance(""); setEditAccId(null); setAddAccOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Add Account
              </Button>
            )}
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => { setSelAccount(""); setAmount(""); setCharge(""); setDue(""); setTxnType("RECEIVE"); setTxnOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> New Txn
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* v2.10.48: Total cash balance across all accounts */}
        <div className="rounded-lg border-2 border-emerald-400 bg-emerald-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-emerald-900">موجودہ کیش بیلنس (Total)</span>
            <Badge variant="outline" className="bg-white">{accounts.length} accounts</Badge>
          </div>
          <div className="text-2xl font-bold text-emerald-900 mb-2">Rs {totalBalance.toLocaleString()}</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-emerald-700">کل موصول</div>
              <div className="font-bold text-emerald-700">Rs {totalReceived.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-rose-700">کل بھیجا</div>
              <div className="font-bold text-rose-700">Rs {totalSent.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-amber-700">کل چارجز</div>
              <div className="font-bold text-amber-700">Rs {totalChargesAll.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Account cards — each shows balance + quick receive/send buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {accounts.map(a => (
            <div key={a.id} className={`rounded-lg border-2 p-3 transition-all ${a.balance > 0 ? "border-emerald-300 bg-emerald-50" : "border-muted"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold">{a.name}</span>
                <Badge variant="outline">{a.provider}</Badge>
              </div>
              <div className={`text-xl font-bold ${a.balance > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                Rs {a.balance.toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground mb-2">
                {a.phoneNumber || a.accountNumber || ""} • Recv: Rs {a.totalReceived.toLocaleString()} • Sent: Rs {a.totalSent.toLocaleString()}
              </div>
              {/* Quick receive/send buttons — POS-like instant access */}
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1 border-emerald-300 text-emerald-700"
                  onClick={() => { setSelAccount(a.id); setTxnType("RECEIVE"); setAmount(""); setCharge(""); setDue(""); setTxnOpen(true); }}>
                  <ArrowDownLeft className="w-3 h-3 mr-1" /> Receive
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1 border-rose-300 text-rose-700"
                  onClick={() => { setSelAccount(a.id); setTxnType("SEND"); setAmount(""); setCharge(""); setDue(""); setTxnOpen(true); }}>
                  <ArrowUpRight className="w-3 h-3 mr-1" /> Send
                </Button>
              </div>
              {/* v2.10.52: Edit + Delete buttons */}
              {isAdmin && (
                <div className="flex gap-1 mt-1">
                  <Button
                    size="sm" variant="ghost" className="h-6 text-xs flex-1 text-blue-600 hover:bg-blue-50"
                    onClick={() => {
                      setEditAccId(a.id);
                      setAccName(a.name);
                      setAccProvider(a.provider);
                      setAccPhone(a.phoneNumber || "");
                      setAccBalance(String(a.balance));
                      setAddAccOpen(true); // reuse the Add Account dialog for editing
                    }}
                  >
                    ✎ Rename
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="h-6 text-xs flex-1 text-rose-600 hover:bg-rose-50"
                    onClick={async () => {
                      if (!confirm(`Delete account "${a.name}"?\n\nThis will also delete all its transactions. This cannot be undone.`)) return;
                      try {
                        const res = await fetch(`/api/load-bill/wallet-accounts?id=${a.id}`, { method: "DELETE" });
                        if (res.ok) { toast.success(`Account "${a.name}" deleted`); load(); onRefresh(); }
                        else { const d = await res.json(); toast.error(d.error || "Failed"); }
                      } catch { toast.error("Network error"); }
                    }}
                  >
                    🗑 Delete
                  </Button>
                </div>
              )}
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-4">
              No accounts added yet. Click "Add Account" to create JazzCash, Easypaisa, or Bank accounts.
            </div>
          )}
        </div>

        {/* Recent transactions */}
        {loading ? <div className="h-20 rounded bg-muted animate-pulse" /> : txns.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">No transactions yet</div>
        ) : (
          <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Provider</TableHead><TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Charge</TableHead><TableHead className="text-right">Due</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {txns.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs">{new Date(t.createdAt).toLocaleString("en-PK")}</TableCell>
                    <TableCell>{t.provider}</TableCell>
                    <TableCell><Badge variant={t.type === "SEND" ? "destructive" : "default"}>{t.type}</Badge></TableCell>
                    <TableCell className="text-right font-mono">Rs {t.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-700">Rs {(t.serviceCharge || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-rose-600">{(t.due || 0) > 0 ? `Rs ${t.due.toLocaleString()}` : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Transaction Checkout — shows current balance + after */}
      <CheckoutDialog
        open={txnOpen} onClose={() => setTxnOpen(false)} title={`${txnType === "RECEIVE" ? "Receive" : "Send"} Money`}
        saving={saving} onConfirm={handleTxn}
        fields={[
          { label: "Account *", value: selAccount, onChange: setSelAccount, type: "select", options: accountOptions, placeholder: "Select account" },
          { label: "Type", value: txnType, onChange: setTxnType, type: "select",
            options: [{ value: "RECEIVE", label: "Receive Money" }, { value: "SEND", label: "Send Money" }] },
          { label: "Amount *", value: amount, onChange: setAmount, type: "number", placeholder: "e.g. 5000" },
          { label: "Service Charge", value: charge, onChange: setCharge, type: "number", placeholder: "0" },
          { label: "Due (if unpaid)", value: due, onChange: setDue, type: "number", placeholder: "0" },
        ]}
        totals={[
          { label: "Amount", value: amtNum },
          { label: "Service Charge", value: chargeNum },
          ...(selectedAccount ? [{ label: "Current Balance", value: selectedAccount.balance }] : []),
          ...(selectedAccount ? [{ label: txnType === "RECEIVE" ? "After Receive" : "After Send", value: balanceAfter }] : []),
        ]}
      />

      {/* Add/Edit Account Dialog — v2.10.52: reuses dialog for edit */}
      <Dialog open={addAccOpen} onOpenChange={setAddAccOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editAccId ? "Edit Wallet Account" : "Add Wallet Account"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Provider</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={accProvider} onChange={(e) => setAccProvider(e.target.value)}>
                <option value="JAZZCASH">JazzCash</option><option value="EASYPAISA">Easypaisa</option><option value="BANK">Bank</option>
              </select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Name *</Label><Input value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="e.g. JazzCash 03001234567" /></div>
            <div className="space-y-1"><Label className="text-xs">Phone / Account #</Label><Input value={accPhone} onChange={(e) => setAccPhone(e.target.value)} placeholder="03001234567" /></div>
            <div className="space-y-1"><Label className="text-xs">{editAccId ? "Current Balance (update)" : "Opening Balance"}</Label><Input type="number" value={accBalance} onChange={(e) => setAccBalance(e.target.value)} placeholder="0" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddAccOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={handleAddAccount}>{saving ? "..." : (editAccId ? "Save Changes" : "Add")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 4: SIM MANAGEMENT — New SIM + Replacement, separate stock
// When a SIM is sold, its costPrice is auto-deducted from the linked
// MobileLoadCompany's balance (represents paying back company credit).
// ═════════════════════════════════════════════════════════════════════════════
function SimTab({ isAdmin, refreshKey, onRefresh }: { isAdmin: boolean; refreshKey: number; onRefresh: () => void }) {
  const [sims, setSims] = React.useState<any[]>([]);
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [sellOpen, setSellOpen] = React.useState(false);
  const [simCompany, setSimCompany] = React.useState("Jazz");
  const [simType, setSimType] = React.useState("NEW");
  const [simPhone, setSimPhone] = React.useState("");
  const [simCost, setSimCost] = React.useState("");
  const [simSale, setSimSale] = React.useState("");
  const [linkedCompanyId, setLinkedCompanyId] = React.useState("");
  const [linkedSimId, setLinkedSimId] = React.useState("");
  // v2.9.16: stock quantity + deduction settings
  const [simStockQty, setSimStockQty] = React.useState("1");
  const [deductionType, setDeductionType] = React.useState("FIXED");
  const [deductionAmount, setDeductionAmount] = React.useState("");
  const [sellSimId, setSellSimId] = React.useState("");
  const [sellCust, setSellCust] = React.useState("");
  const [sellPhone, setSellPhone] = React.useState("");
  const [sellSalePrice, setSellSalePrice] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // Fetch SIMs and load companies separately so one failing doesn't break both
      let sd: any = { sims: [] };
      let cd: any = { companies: [] };
      try {
        const r = await fetch("/api/load-bill/sim-stock", { cache: "no-store" });
        if (r.ok) sd = await r.json();
      } catch {}
      try {
        const r = await fetch("/api/load-bill/companies", { cache: "no-store" });
        if (r.ok) cd = await r.json();
      } catch {}
      setSims(sd.sims || []);
      setCompanies(cd.companies || []);
    } catch { toast.error("Failed"); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load, refreshKey]);

  const inStock = sims.filter(s => s.status === "IN_STOCK");
  const sold = sims.filter(s => s.status === "SOLD");

  // Filter by search
  const filteredSims = sims.filter(s =>
    !search ||
    s.company.toLowerCase().includes(search.toLowerCase()) ||
    (s.phoneNumber || "").includes(search) ||
    (s.customerName || "").toLowerCase().includes(search.toLowerCase())
  );

  // Linked company name lookup
  const companyById = (id: string) => companies.find(c => c.id === id);

  // Selected SIM for sell dialog
  const selectedSim = inStock.find(s => s.id === sellSimId);
  const selectedLinkedCompany = selectedSim?.linkedCompanyId ? companyById(selectedSim.linkedCompanyId) : null;
  const finalSaleNum = parseFloat(sellSalePrice) || selectedSim?.salePrice || 0;
  const costNum = selectedSim?.costPrice || 0;
  const profitNum = finalSaleNum - costNum;
  const balanceAfterDeduction = selectedLinkedCompany ? selectedLinkedCompany.balance - costNum : 0;

  async function handleAddSim() {
    if (!simCompany || !simType) { toast.error("Company and type required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/load-bill/sim-stock", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: simCompany, type: simType, phoneNumber: simPhone,
          costPrice: simCost, salePrice: simSale,
          linkedCompanyId: linkedCompanyId || undefined,
          linkedSimId: linkedSimId || undefined,
          deductionType, deductionAmount: deductionAmount || 0,
          stockQuantity: simStockQty || 1,
        }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error); setSaving(false); return; }
      const qtyMsg = d.count > 1 ? ` (${d.count} SIMs added)` : "";
      toast.success("SIM added to stock" + (linkedCompanyId ? " (linked to load company)" : "") + qtyMsg);
      setAddOpen(false); setSimPhone(""); setSimCost(""); setSimSale(""); setLinkedCompanyId(""); setLinkedSimId("");
      setSimStockQty("1"); setDeductionType("FIXED"); setDeductionAmount("");
      load(); onRefresh();
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  }

  async function handleSellSim() {
    if (!sellSimId) { toast.error("Select a SIM"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/load-bill/sim-stock", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: sellSimId, customerName: sellCust, customerPhone: sellPhone,
          salePrice: finalSaleNum,
        }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error); setSaving(false); return; }
      // Show success message with deduction info
      const deductionMsg = d.companyAfter
        ? ` | Load balance: Rs ${d.companyAfter.balance.toLocaleString()}`
        : "";
      toast.success(`SIM sold for Rs ${finalSaleNum.toLocaleString()} (Profit: Rs ${d.profit.toLocaleString()})${deductionMsg}`);
      setSellOpen(false); setSellSimId(""); setSellCust(""); setSellPhone(""); setSellSalePrice("");
      load(); onRefresh();
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  }

  // Stock summary by sim company and type
  const simCompanies = ["Jazz", "Zong", "Ufone", "Telenor"];
  const newStock = simCompanies.map(c => ({ company: c, count: inStock.filter(s => s.company === c && s.type === "NEW").length }));
  const replStock = simCompanies.map(c => ({ company: c, count: inStock.filter(s => s.company === c && s.type === "REPLACEMENT").length }));
  const soldCount = sold.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5 text-emerald-600" /> SIM Management</CardTitle>
          <div className="flex gap-2">
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => { setSimPhone(""); setSimCost(""); setSimSale(""); setLinkedCompanyId(""); setLinkedSimId(""); setAddOpen(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Add SIM
              </Button>
            )}
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={inStock.length === 0}
              onClick={() => { setSellSimId(""); setSellCust(""); setSellPhone(""); setSellSalePrice(""); setSellOpen(true); }}>
              <ArrowUpRight className="w-4 h-4 mr-1" /> Sell SIM
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by company, phone, or customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>

        {/* Stock summary — New SIM and Replacement separate */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-sm font-bold text-emerald-800 mb-2">New SIM Stock</div>
            <div className="grid grid-cols-4 gap-1">
              {newStock.map(s => (
                <div key={s.company} className="text-center">
                  <div className="text-xs text-muted-foreground">{s.company}</div>
                  <div className="text-lg font-bold text-emerald-700">{s.count}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="text-sm font-bold text-amber-800 mb-2">Replacement SIM Stock</div>
            <div className="grid grid-cols-4 gap-1">
              {replStock.map(s => (
                <div key={s.company} className="text-center">
                  <div className="text-xs text-muted-foreground">{s.company}</div>
                  <div className="text-lg font-bold text-amber-700">{s.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">Total sold: {soldCount} SIMs</div>

        {/* SIM list */}
        {loading ? <div className="h-20 rounded bg-muted animate-pulse" /> : filteredSims.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">No SIMs found</div>
        ) : (
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Company</TableHead><TableHead>Type</TableHead><TableHead>Phone</TableHead>
                <TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Sale</TableHead>
                <TableHead>Linked Load Co.</TableHead>
                <TableHead>Status</TableHead><TableHead>Customer</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredSims.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>{s.company}</TableCell>
                    <TableCell><Badge variant={s.type === "NEW" ? "default" : "secondary"}>{s.type}</Badge></TableCell>
                    <TableCell className="text-xs">{s.phoneNumber || "-"}</TableCell>
                    <TableCell className="text-right font-mono">Rs {(s.costPrice || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">Rs {(s.salePrice || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">
                      {s.linkedCompanyId ? (
                        <Badge variant="outline" className="text-blue-700 border-blue-300">
                          {companyById(s.linkedCompanyId)?.name || "Linked"}
                        </Badge>
                      ) : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell><Badge variant={s.status === "IN_STOCK" ? "default" : "destructive"}>{s.status}</Badge></TableCell>
                    <TableCell className="text-xs">{s.customerName || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Add SIM Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add SIM to Stock</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Company</Label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={simCompany} onChange={(e) => setSimCompany(e.target.value)}>
                  <option>Jazz</option><option>Zong</option><option>Ufone</option><option>Telenor</option>
                </select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Type</Label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={simType} onChange={(e) => setSimType(e.target.value)}>
                  <option value="NEW">New SIM</option><option value="REPLACEMENT">Replacement</option>
                </select>
              </div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Phone Number (optional)</Label><Input value={simPhone} onChange={(e) => setSimPhone(e.target.value)} placeholder="03001234567" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-xs">Cost Price</Label><Input type="number" value={simCost} onChange={(e) => setSimCost(e.target.value)} placeholder="0" /></div>
              <div className="space-y-1"><Label className="text-xs">Sale Price</Label><Input type="number" value={simSale} onChange={(e) => setSimSale(e.target.value)} placeholder="0" /></div>
              <div className="space-y-1"><Label className="text-xs">Stock Qty</Label><Input type="number" value={simStockQty} onChange={(e) => setSimStockQty(e.target.value)} placeholder="1" min="1" /></div>
            </div>
            {/* Linked Load Company — selling this SIM will deduct from this company's balance */}
            <div className="space-y-1">
              <Label className="text-xs">Linked Load Company — لنک لوڈ کمپنی</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={linkedCompanyId} onChange={(e) => setLinkedCompanyId(e.target.value)}>
                <option value="">— None —</option>
                {companies.filter(c => c.active).map(c => (
                  <option key={c.id} value={c.id}>{c.name} — Balance: Rs {c.balance.toLocaleString()}</option>
                ))}
              </select>
            </div>
            {/* Deduction settings — how much to deduct from linked company when SIM is sold */}
            {linkedCompanyId && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                <Label className="text-xs font-bold text-blue-800">Deduction Settings — کٹوتی</Label>
                <p className="text-[10px] text-muted-foreground">
                  How much to deduct from the linked load company's balance when this SIM is sold.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Deduction Type</Label>
                    <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={deductionType} onChange={(e) => setDeductionType(e.target.value)}>
                      <option value="FIXED">Fixed Amount (Rs)</option>
                      <option value="PERCENTAGE">Percentage (%)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">
                      {deductionType === "PERCENTAGE" ? "Percentage (%)" : "Amount (Rs)"}
                    </Label>
                    <Input
                      type="number"
                      value={deductionAmount}
                      onChange={(e) => setDeductionAmount(e.target.value)}
                      placeholder={deductionType === "PERCENTAGE" ? "e.g. 10" : "e.g. 50"}
                    />
                  </div>
                </div>
                {deductionAmount && parseFloat(deductionAmount) > 0 && (
                  <div className="text-[10px] text-blue-700 font-medium">
                    {deductionType === "PERCENTAGE"
                      ? `→ ${deductionAmount}% of Rs ${parseFloat(simCost) || 0} = Rs ${((parseFloat(simCost) || 0) * parseFloat(deductionAmount)) / 100}`
                      : `→ Rs ${deductionAmount} will be deducted per SIM sale`
                    }
                  </div>
                )}
                {!deductionAmount && (
                  <div className="text-[10px] text-muted-foreground">
                    → Full cost price (Rs {parseFloat(simCost) || 0}) will be deducted per SIM sale
                  </div>
                )}
              </div>
            )}
            {/* For Replacement SIM — link to a sold SIM's phone number */}
            {simType === "REPLACEMENT" && (
              <div className="space-y-1">
                <Label className="text-xs">Link to Original SIM (optional)</Label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={linkedSimId} onChange={(e) => setLinkedSimId(e.target.value)}>
                  <option value="">— None —</option>
                  {sold.map(s => (
                    <option key={s.id} value={s.id}>{s.company} {s.phoneNumber || ""} — {s.customerName || "Customer"}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={handleAddSim}>{saving ? "..." : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sell SIM Dialog — shows deduction preview */}
      <Dialog open={sellOpen} onOpenChange={setSellOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Sell SIM</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">Select SIM *</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={sellSimId} onChange={(e) => {
                setSellSimId(e.target.value);
                setSellSalePrice(""); // reset so default is used
              }}>
                <option value="">Select from stock</option>
                {inStock.map(s => (
                  <option key={s.id} value={s.id}>{s.company} {s.type} {s.phoneNumber || ""} — Rs {s.salePrice || 0}</option>
                ))}
              </select>
            </div>
            {selectedSim && (
              <div className="rounded-lg bg-muted/40 border p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Cost Price:</span><span className="font-mono">Rs {costNum.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Default Sale Price:</span><span className="font-mono">Rs {(selectedSim.salePrice || 0).toLocaleString()}</span></div>
                {selectedLinkedCompany && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Linked Load Co.:</span><span className="font-medium text-blue-700">{selectedLinkedCompany.name}</span></div>
                )}
                {selectedLinkedCompany && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Current Balance:</span><span className="font-mono">Rs {selectedLinkedCompany.balance.toLocaleString()}</span></div>
                )}
                {selectedLinkedCompany && (
                  <div className="flex justify-between text-rose-700"><span>After Deduction:</span><span className="font-mono font-bold">Rs {balanceAfterDeduction.toLocaleString()}</span></div>
                )}
              </div>
            )}
            <div className="space-y-1"><Label className="text-xs">Sale Price (editable)</Label>
              <Input type="number" value={sellSalePrice} onChange={(e) => setSellSalePrice(e.target.value)} placeholder={(selectedSim?.salePrice || 0).toString()} />
            </div>
            {selectedSim && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-300 p-2 flex justify-between">
                <span className="text-sm font-medium text-emerald-800">Profit:</span>
                <span className={`font-mono font-bold ${profitNum >= 0 ? "text-emerald-700" : "text-rose-700"}`}>Rs {profitNum.toLocaleString()}</span>
              </div>
            )}
            <div className="space-y-1"><Label className="text-xs">Customer Name</Label><Input value={sellCust} onChange={(e) => setSellCust(e.target.value)} placeholder="Customer name" /></div>
            <div className="space-y-1"><Label className="text-xs">Customer Phone</Label><Input value={sellPhone} onChange={(e) => setSellPhone(e.target.value)} placeholder="03001234567" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSellOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving || !sellSimId} onClick={handleSellSim}>
              {saving ? "..." : `Sell SIM — Rs ${finalSaleNum.toLocaleString()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 5: REPORTS
// ═════════════════════════════════════════════════════════════════════════════
function ReportsTab({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = React.useState<any>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const [loadRes, billRes, walletRes, simRes] = await Promise.all([
          fetch("/api/load-bill/mobile-load?limit=500", { cache: "no-store" }),
          fetch("/api/load-bill/bill-payment?limit=500", { cache: "no-store" }),
          fetch("/api/load-bill/wallet?limit=500", { cache: "no-store" }),
          fetch("/api/load-bill/sim-stock", { cache: "no-store" }),
        ]);
        const loads = (await loadRes.json()).transactions || [];
        const bills = (await billRes.json()).transactions || [];
        const wallets = (await walletRes.json()).transactions || [];
        const sims = (await simRes.json()).sims || [];

        const loadSales = loads.filter((t: any) => t.type === "SALE");
        const loadProfit = loadSales.reduce((s: number, t: any) => s + (t.salePrice - t.amount), 0);
        const billProfit = bills.reduce((s: number, t: any) => s + (t.serviceCharge || 0), 0);
        const walletProfit = wallets.reduce((s: number, t: any) => s + (t.serviceCharge || 0), 0);
        const simRevenue = sims.filter((s: any) => s.status === "SOLD").reduce((s: number, t: any) => s + (t.salePrice || 0), 0);
        const totalDue = [...loads, ...bills, ...wallets].reduce((s: number, t: any) => s + (t.due || 0), 0);
        const totalProfit = loadProfit + billProfit + walletProfit;

        setData({ loadSales: loadSales.length, loadProfit, billCount: bills.length, billProfit, walletCount: wallets.length, walletProfit, simSold: sims.filter((s: any) => s.status === "SOLD").length, simRevenue, totalDue, totalProfit });
      } catch {}
      finally { setLoading(false); }
    })();
  }, [refreshKey]);

  if (loading) return <Card><CardContent className="p-8 text-center text-muted-foreground">Loading reports...</CardContent></Card>;

  const rows = [
    { label: "Load Sales Count", value: data.loadSales || 0 },
    { label: "Load Profit (Service Charges)", value: `Rs ${(data.loadProfit || 0).toLocaleString()}` },
    { label: "Bill Payment Count", value: data.billCount || 0 },
    { label: "Bill Profit (Service Charges)", value: `Rs ${(data.billProfit || 0).toLocaleString()}` },
    { label: "Wallet Transaction Count", value: data.walletCount || 0 },
    { label: "Wallet Profit (Service Charges)", value: `Rs ${(data.walletProfit || 0).toLocaleString()}` },
    { label: "SIMs Sold", value: data.simSold || 0 },
    { label: "SIM Revenue", value: `Rs ${(data.simRevenue || 0).toLocaleString()}` },
    { label: "Total Due (بقایا)", value: `Rs ${(data.totalDue || 0).toLocaleString()}` },
    { label: "Total Profit (کل منافع)", value: `Rs ${(data.totalProfit || 0).toLocaleString()}` },
  ];

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-emerald-600" /> Reports — رپورٹس</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Metric</TableHead><TableHead className="text-right">Value</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-right font-mono font-bold">{r.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// v2.10.47: PRODUCT LOAD TAB
// Creates load requests (e.g. "Jazz Load 100", "Ufone Load 50") that can be
// processed from POS sales point. Shows pending + completed + cancelled.
// ═════════════════════════════════════════════════════════════════════════════
function ProductLoadTab({ isAdmin, refreshKey, onRefresh }: { isAdmin: boolean; refreshKey: number; onRefresh: () => void }) {
  const [requests, setRequests] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<any | null>(null);

  // Form state
  const [productName, setProductName] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [loadAmount, setLoadAmount] = React.useState("");
  const [extraCharges, setExtraCharges] = React.useState("");
  const [due, setDue] = React.useState("");
  const [referenceNo, setReferenceNo] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/load-bill/product-load?limit=100", { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        setRequests(d.requests || []);
      }
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { load(); }, [load, refreshKey]);

  const loadNum = parseFloat(loadAmount) || 0;
  const chargeNum = parseFloat(extraCharges) || 0;
  const dueNum = parseFloat(due) || 0;
  const total = loadNum + chargeNum;

  async function handleSave() {
    if (!productName.trim()) { toast.error("Product name required"); return; }
    if (loadNum <= 0) { toast.error("Load amount must be > 0"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/load-bill/product-load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: productName.trim(),
          customerName: customerName.trim() || null,
          customerPhone: customerPhone.trim() || null,
          loadAmount: loadNum,
          extraCharges: chargeNum,
          totalAmount: total,
          due: dueNum,
          referenceNo: referenceNo.trim() || null,
          note: note.trim() || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error); setSaving(false); return; }
      toast.success(`Load request created: Rs ${total}`);
      setOpen(false);
      setProductName(""); setCustomerName(""); setCustomerPhone("");
      setLoadAmount(""); setExtraCharges(""); setDue(""); setReferenceNo(""); setNote("");
      load(); onRefresh();
    } catch { toast.error("Network error"); }
    finally { setSaving(false); }
  }

  async function updateStatus(reqId: string, status: string) {
    try {
      const res = await fetch(`/api/load-bill/product-load?id=${reqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          processedAt: status === "COMPLETED" ? new Date().toISOString() : null,
        }),
      });
      if (res.ok) {
        toast.success(`Request ${status.toLowerCase()}`);
        load(); onRefresh();
        if (detail?.id === reqId) setDetail(null);
      }
    } catch { toast.error("Failed to update"); }
  }

  // Stats
  const pending = requests.filter(r => r.status === "PENDING");
  const completed = requests.filter(r => r.status === "COMPLETED");
  const cancelled = requests.filter(r => r.status === "CANCELLED");
  const pendingTotal = pending.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const completedTotal = completed.reduce((s, r) => s + (r.totalAmount || 0), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><PackageOpen className="w-5 h-5 text-emerald-600" /> Product Load Requests</CardTitle>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Load
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-center">
            <div className="text-xs text-amber-700">Pending ({pending.length})</div>
            <div className="text-lg font-bold text-amber-700">Rs {pendingTotal.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-center">
            <div className="text-xs text-emerald-700">Completed ({completed.length})</div>
            <div className="text-lg font-bold text-emerald-700">Rs {completedTotal.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-center">
            <div className="text-xs text-rose-700">Cancelled ({cancelled.length})</div>
            <div className="text-lg font-bold text-rose-700">{cancelled.length}</div>
          </div>
        </div>

        {/* Hint about POS integration */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          💡 یہ فیچر ابھی تیار ہے۔ آپ load requests بنا سکتے ہیں، اور بعد میں POS سیلز پوائنٹ سے انہیں پروسیس کریں گے۔
        </div>

        {loading ? <div className="h-20 rounded bg-muted animate-pulse" /> : requests.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">No load requests yet</div>
        ) : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>Customer</TableHead>
                <TableHead className="text-right">Load</TableHead><TableHead className="text-right">Charges</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {requests.map(r => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetail(r)}>
                    <TableCell className="text-xs">{new Date(r.createdAt).toLocaleString("en-PK")}</TableCell>
                    <TableCell className="font-medium">{r.productName}</TableCell>
                    <TableCell className="text-xs">{r.customerName || "-"}</TableCell>
                    <TableCell className="text-right font-mono">Rs {(r.loadAmount || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-700">Rs {(r.extraCharges || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono font-bold">Rs {(r.totalAmount || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-rose-600">{(r.due || 0) > 0 ? `Rs ${r.due.toLocaleString()}` : "-"}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "COMPLETED" ? "default" : r.status === "CANCELLED" ? "destructive" : "secondary"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* New Load Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Product Load Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Product Name *</Label>
              <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. Jazz Load 100, Ufone Load 50" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Customer Name</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1">
                <Label>Customer Phone</Label>
                <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Load Amount *</Label>
                <Input type="number" value={loadAmount} onChange={(e) => setLoadAmount(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label>Extra Charges</Label>
                <Input type="number" value={extraCharges} onChange={(e) => setExtraCharges(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Due (بقایا)</Label>
                <Input type="number" value={due} onChange={(e) => setDue(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label>Reference No</Label>
                <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <div className="flex justify-between"><span>Total (Load + Charges):</span><span className="font-bold text-emerald-700">Rs {total.toLocaleString()}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={handleSave}>
              {saving ? "Saving..." : "Create Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Load Request Details</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Product:</span><span className="font-medium">{detail.productName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Customer:</span><span>{detail.customerName || "-"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Phone:</span><span>{detail.customerPhone || "-"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Load Amount:</span><span className="font-mono">Rs {(detail.loadAmount || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Extra Charges:</span><span className="font-mono text-emerald-700">Rs {(detail.extraCharges || 0).toLocaleString()}</span></div>
              <div className="flex justify-between border-t pt-2"><span className="font-bold">Total:</span><span className="font-bold font-mono">Rs {(detail.totalAmount || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Due:</span><span className="font-mono text-rose-600">Rs {(detail.due || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><Badge variant={detail.status === "COMPLETED" ? "default" : detail.status === "CANCELLED" ? "destructive" : "secondary"}>{detail.status}</Badge></div>
              {detail.referenceNo && <div className="flex justify-between"><span className="text-muted-foreground">Reference:</span><span className="font-mono">{detail.referenceNo}</span></div>}
              {detail.note && <div className="flex justify-between"><span className="text-muted-foreground">Note:</span><span>{detail.note}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Created:</span><span className="text-xs">{new Date(detail.createdAt).toLocaleString("en-PK")}</span></div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {detail?.status === "PENDING" && (
              <>
                <Button variant="outline" className="border-emerald-500 text-emerald-700 hover:bg-emerald-50" onClick={() => updateStatus(detail.id, "COMPLETED")}>
                  ✓ Mark Completed
                </Button>
                <Button variant="outline" className="border-rose-500 text-rose-700 hover:bg-rose-50" onClick={() => updateStatus(detail.id, "CANCELLED")}>
                  ✗ Cancel
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setDetail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
