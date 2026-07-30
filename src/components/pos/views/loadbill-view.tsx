"use client";

import * as React from "react";
import {
  Smartphone,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  TrendingUp,
  FileText,
  Wallet,
  Zap,
  Flame,
  Droplets,
  Globe,
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownLeft,
  BarChart3,
  ShoppingCart,
  CircleDollarSign,
  Send,
  Landmark,
  Search,
  Download,
  Phone,
  User,
  Hash,
  StickyNote,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface LoadBillViewProps {
  userRole: string;
}

interface Company {
  id: string;
  name: string;
  balance: number;
  totalPurchased: number;
  totalSold: number;
  totalProfit: number;
}

interface MobileLoadTx {
  id: string;
  date: string;
  companyId: string;
  companyName: string;
  type: "PURCHASE" | "SALE";
  amount: number;
  costPrice?: number;
  salePrice?: number;
  profit?: number;
  customerPhone?: string;
  customerName?: string;
  referenceNo?: string;
  note?: string;
}

interface BillPaymentTx {
  id: string;
  date: string;
  category: string;
  consumerName: string;
  consumerPhone?: string;
  accountNo?: string;
  billAmount: number;
  serviceCharge: number;
  totalPaid: number;
  referenceNo?: string;
  note?: string;
}

interface WalletTx {
  id: string;
  date: string;
  provider: string;
  type: "SEND" | "RECEIVE";
  amount: number;
  serviceCharge: number;
  customerName?: string;
  customerPhone?: string;
  referenceNo?: string;
  note?: string;
}

interface ReportData {
  [key: string]: unknown;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BILL_CATEGORIES = [
  { value: "electricity", label: "Electricity", color: "bg-amber-500 text-white" },
  { value: "gas", label: "Gas", color: "bg-blue-500 text-white" },
  { value: "water", label: "Water", color: "bg-cyan-500 text-white" },
  { value: "internet", label: "Internet", color: "bg-purple-500 text-white" },
  { value: "other", label: "Other", color: "bg-gray-500 text-white" },
];

const WALLET_PROVIDERS = ["JazzCash", "Easypaisa"];
const WALLET_TYPES = [
  { value: "SEND", label: "Send Money", color: "bg-red-500 text-white" },
  { value: "RECEIVE", label: "Receive Money", color: "bg-green-500 text-white" },
];

const REPORT_TYPES = [
  { value: "daily-cash", label: "Daily Cash" },
  { value: "company-wise", label: "Company-wise" },
  { value: "service-charge", label: "Service Charge" },
  { value: "wallet", label: "Wallet" },
];

function getCategoryBadge(category: string) {
  const cat = BILL_CATEGORIES.find((c) => c.value === category);
  return cat || { label: category, color: "bg-gray-500 text-white" };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LoadBillView({ userRole }: LoadBillViewProps) {
  const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-emerald-600" />
            Load & Bill Payment
            <span className="text-sm font-normal text-muted-foreground">
              (لوڈ اینند بل پیمنٹ)
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage mobile load, bill payments, wallet transactions &amp; reports
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="mobile-load" className="w-full">
        <TabsList className="w-full sm:w-auto flex flex-wrap">
          <TabsTrigger value="mobile-load" className="gap-1.5">
            <Smartphone className="w-4 h-4" />
            Mobile Load
          </TabsTrigger>
          <TabsTrigger value="bill-payment" className="gap-1.5">
            <FileText className="w-4 h-4" />
            Bill Payment
          </TabsTrigger>
          <TabsTrigger value="wallet" className="gap-1.5">
            <Wallet className="w-4 h-4" />
            Wallet
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5">
            <BarChart3 className="w-4 h-4" />
            Reports
          </TabsTrigger>
        </TabsList>

        {/* ───── Tab 1: Mobile Load ───── */}
        <TabsContent value="mobile-load">
          <MobileLoadTab isAdminOrManager={isAdminOrManager} />
        </TabsContent>

        {/* ───── Tab 2: Bill Payment ───── */}
        <TabsContent value="bill-payment">
          <BillPaymentTab isAdminOrManager={isAdminOrManager} />
        </TabsContent>

        {/* ───── Tab 3: Wallet ───── */}
        <TabsContent value="wallet">
          <WalletTab isAdminOrManager={isAdminOrManager} />
        </TabsContent>

        {/* ───── Tab 4: Reports ───── */}
        <TabsContent value="reports">
          <ReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1: MOBILE LOAD
// ═════════════════════════════════════════════════════════════════════════════

function MobileLoadTab({ isAdminOrManager }: { isAdminOrManager: boolean }) {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [transactions, setTransactions] = React.useState<MobileLoadTx[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [txLoading, setTxLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // Purchase dialog
  const [purchaseOpen, setPurchaseOpen] = React.useState(false);
  const [purchaseCompanyId, setPurchaseCompanyId] = React.useState("");
  const [purchaseForm, setPurchaseForm] = React.useState({
    amount: "",
    costPrice: "",
    note: "",
  });

  // Sale dialog
  const [saleOpen, setSaleOpen] = React.useState(false);
  const [saleCompanyId, setSaleCompanyId] = React.useState("");
  const [saleForm, setSaleForm] = React.useState({
    amount: "",
    salePrice: "",
    customerPhone: "",
    customerName: "",
    referenceNo: "",
    note: "",
  });

  // Filters
  const [filterCompany, setFilterCompany] = React.useState("all");
  const [filterType, setFilterType] = React.useState("all");
  const [filterFrom, setFilterFrom] = React.useState(thirtyDaysAgoStr());
  const [filterTo, setFilterTo] = React.useState(todayStr());

  const loadCompanies = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/load-bill/companies", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setCompanies(data.companies || []);
    } catch {
      toast.error("Failed to load companies");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTransactions = React.useCallback(async () => {
    setTxLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCompany !== "all") params.set("companyId", filterCompany);
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      const res = await fetch(`/api/load-bill/mobile-load?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch {
      toast.error("Failed to load transactions");
    } finally {
      setTxLoading(false);
    }
  }, [filterCompany, filterFrom, filterTo]);

  React.useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  React.useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  function openPurchase(companyId: string) {
    setPurchaseCompanyId(companyId);
    setPurchaseForm({ amount: "", costPrice: "", note: "" });
    setPurchaseOpen(true);
  }

  function openSale(companyId: string) {
    setSaleCompanyId(companyId);
    setSaleForm({
      amount: "",
      salePrice: "",
      customerPhone: "",
      customerName: "",
      referenceNo: "",
      note: "",
    });
    setSaleOpen(true);
  }

  async function handlePurchase() {
    if (!purchaseForm.amount || !purchaseForm.costPrice) {
      toast.error("Amount and Cost Price are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/load-bill/mobile-load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: purchaseCompanyId,
          type: "PURCHASE",
          amount: parseFloat(purchaseForm.amount),
          costPrice: parseFloat(purchaseForm.costPrice),
          note: purchaseForm.note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to add purchase");
        setSaving(false);
        return;
      }
      toast.success("Purchase added successfully");
      setPurchaseOpen(false);
      loadCompanies();
      loadTransactions();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSale() {
    if (!saleForm.amount || !saleForm.salePrice) {
      toast.error("Amount and Sale Price are required");
      return;
    }
    setSaving(true);
    try {
      const salePrice = parseFloat(saleForm.salePrice);
      const res = await fetch("/api/load-bill/mobile-load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: saleCompanyId,
          type: "SALE",
          amount: parseFloat(saleForm.amount),
          salePrice,
          profit: salePrice,
          customerPhone: saleForm.customerPhone || undefined,
          customerName: saleForm.customerName || undefined,
          referenceNo: saleForm.referenceNo || undefined,
          note: saleForm.note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to add sale");
        setSaving(false);
        return;
      }
      toast.success("Sale added successfully");
      setSaleOpen(false);
      loadCompanies();
      loadTransactions();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTx(id: string) {
    try {
      const res = await fetch(`/api/load-bill/mobile-load/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to delete");
        return;
      }
      toast.success("Transaction deleted");
      loadCompanies();
      loadTransactions();
    } catch {
      toast.error("Network error");
    }
  }

  const filtered = transactions.filter((tx) => {
    if (filterType !== "all" && tx.type !== filterType) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Refresh */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => { loadCompanies(); loadTransactions(); }}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Company Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-lg" />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>No companies found. Please add companies first.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {companies.map((c) => (
            <Card key={c.id} className="border-l-4 border-l-emerald-500">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-emerald-600" />
                  {c.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Balance</span>
                    <div className="font-semibold text-sm">{formatMoney(c.balance)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Purchased</span>
                    <div className="font-semibold text-sm">{formatMoney(c.totalPurchased)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sold</span>
                    <div className="font-semibold text-sm">{formatMoney(c.totalSold)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Profit</span>
                    <div className={`font-semibold text-sm ${c.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatMoney(c.totalProfit)}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-xs"
                    onClick={() => openPurchase(c.id)}
                  >
                    <ArrowDownLeft className="w-3 h-3 mr-1" />
                    Purchase
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-xs"
                    onClick={() => openSale(c.id)}
                  >
                    <ArrowUpRight className="w-3 h-3 mr-1" />
                    Sale
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Separator />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Company</Label>
          <select
            value={filterCompany}
            onChange={(e) => setFilterCompany(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">All Companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">All</option>
            <option value="PURCHASE">Purchase</option>
            <option value="SALE">Sale</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="h-9 w-36"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="h-9 w-36"
          />
        </div>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          {txLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Smartphone className="w-10 h-10 mx-auto mb-2 opacity-50" />
              No transactions found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Cost / Sale</TableHead>
                    <TableHead>Customer Phone</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    {isAdminOrManager && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDateTime(tx.date)}
                      </TableCell>
                      <TableCell className="font-medium">{tx.companyName}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            tx.type === "PURCHASE"
                              ? "bg-blue-500 text-white hover:bg-blue-600"
                              : "bg-green-500 text-white hover:bg-green-600"
                          }
                        >
                          {tx.type === "PURCHASE" ? "Purchase" : "Sale"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(tx.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {tx.type === "PURCHASE"
                          ? formatMoney(tx.costPrice || 0)
                          : formatMoney(tx.salePrice || 0)}
                      </TableCell>
                      <TableCell className="text-xs">{tx.customerPhone || "-"}</TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          (tx.profit || 0) >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatMoney(tx.profit || 0)}
                      </TableCell>
                      {isAdminOrManager && (
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-600 hover:text-red-700"
                            onClick={() => handleDeleteTx(tx.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Purchase Dialog */}
      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownLeft className="w-5 h-5 text-blue-600" />
              Purchase Load (خریداری)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>
                Amount <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <CircleDollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="e.g. 1000"
                  value={purchaseForm.amount}
                  onChange={(e) =>
                    setPurchaseForm({ ...purchaseForm, amount: e.target.value })
                  }
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                Cost Price <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <CircleDollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="What you paid"
                  value={purchaseForm.costPrice}
                  onChange={(e) =>
                    setPurchaseForm({ ...purchaseForm, costPrice: e.target.value })
                  }
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Input
                placeholder="Optional note"
                value={purchaseForm.note}
                onChange={(e) =>
                  setPurchaseForm({ ...purchaseForm, note: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurchaseOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handlePurchase}
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sale Dialog */}
      <Dialog open={saleOpen} onOpenChange={setSaleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-emerald-600" />
              Sale Load (فروخت)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>
                Amount <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <CircleDollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="e.g. 1000"
                  value={saleForm.amount}
                  onChange={(e) =>
                    setSaleForm({ ...saleForm, amount: e.target.value })
                  }
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                Sale Price <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <CircleDollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="What customer pays"
                  value={saleForm.salePrice}
                  onChange={(e) =>
                    setSaleForm({ ...saleForm, salePrice: e.target.value })
                  }
                  className="pl-9"
                />
              </div>
            </div>
            {saleForm.salePrice && (
              <div className="bg-muted/50 rounded-md p-2 text-sm">
                <span className="text-muted-foreground">Profit: </span>
                <span className="font-bold text-green-600">
                  {formatMoney(parseFloat(saleForm.salePrice))}
                </span>
              </div>
            )}
            <Separator />
            <div className="space-y-1.5">
              <Label>Customer Phone</Label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g. 03001234567"
                  value={saleForm.customerPhone}
                  onChange={(e) =>
                    setSaleForm({ ...saleForm, customerPhone: e.target.value })
                  }
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Customer Name</Label>
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Optional"
                  value={saleForm.customerName}
                  onChange={(e) =>
                    setSaleForm({ ...saleForm, customerName: e.target.value })
                  }
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reference No</Label>
              <div className="relative">
                <Hash className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Optional"
                  value={saleForm.referenceNo}
                  onChange={(e) =>
                    setSaleForm({ ...saleForm, referenceNo: e.target.value })
                  }
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <div className="relative">
                <StickyNote className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Optional note"
                  value={saleForm.note}
                  onChange={(e) =>
                    setSaleForm({ ...saleForm, note: e.target.value })
                  }
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaleOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSale}
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2: BILL PAYMENT
// ═════════════════════════════════════════════════════════════════════════════

function BillPaymentTab({ isAdminOrManager }: { isAdminOrManager: boolean }) {
  const [transactions, setTransactions] = React.useState<BillPaymentTx[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [selectedCategory, setSelectedCategory] = React.useState("electricity");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogCategory, setDialogCategory] = React.useState("electricity");
  const [form, setForm] = React.useState({
    consumerName: "",
    consumerPhone: "",
    accountNo: "",
    billAmount: "",
    serviceCharge: "",
    referenceNo: "",
    note: "",
  });

  // Filters
  const [filterCategory, setFilterCategory] = React.useState("all");
  const [filterFrom, setFilterFrom] = React.useState(thirtyDaysAgoStr());
  const [filterTo, setFilterTo] = React.useState(todayStr());

  const loadTransactions = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCategory !== "all") params.set("category", filterCategory);
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      const res = await fetch(`/api/load-bill/bill-payment?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch {
      toast.error("Failed to load bill payments");
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterFrom, filterTo]);

  React.useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  function openAddBill(category: string) {
    setDialogCategory(category);
    setForm({
      consumerName: "",
      consumerPhone: "",
      accountNo: "",
      billAmount: "",
      serviceCharge: "",
      referenceNo: "",
      note: "",
    });
    setDialogOpen(true);
  }

  const totalPaid = React.useMemo(
    () => transactions.reduce((s, t) => s + t.totalPaid, 0),
    [transactions]
  );
  const totalBillAmount = React.useMemo(
    () => transactions.reduce((s, t) => s + t.billAmount, 0),
    [transactions]
  );
  const totalServiceCharge = React.useMemo(
    () => transactions.reduce((s, t) => s + t.serviceCharge, 0),
    [transactions]
  );

  async function handleSave() {
    if (!form.billAmount) {
      toast.error("Bill Amount is required");
      return;
    }
    // serviceCharge is OPTIONAL — defaults to 0 if left blank. The user
    // requested that Bill Payment only needs bill amount + extra charges,
    // and extra charges can be 0 for transactions with no commission.
    setSaving(true);
    try {
      const billAmount = parseFloat(form.billAmount);
      const serviceCharge = parseFloat(form.serviceCharge || "0");
      const res = await fetch("/api/load-bill/bill-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: dialogCategory,
          consumerName: form.consumerName || undefined,
          consumerPhone: form.consumerPhone || undefined,
          accountNo: form.accountNo || undefined,
          billAmount,
          serviceCharge,
          totalPaid: billAmount + serviceCharge,
          referenceNo: form.referenceNo || undefined,
          note: form.note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to add bill payment");
        setSaving(false);
        return;
      }
      toast.success("Bill payment added successfully");
      setDialogOpen(false);
      loadTransactions();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/load-bill/bill-payment/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to delete");
        return;
      }
      toast.success("Bill payment deleted");
      loadTransactions();
    } catch {
      toast.error("Network error");
    }
  }

  const filtered = transactions;

  return (
    <div className="space-y-4">
      {/* Category buttons */}
      <div className="flex flex-wrap gap-2">
        {BILL_CATEGORIES.map((cat) => (
          <Button
            key={cat.value}
            variant={selectedCategory === cat.value ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(cat.value)}
            className={
              selectedCategory === cat.value
                ? "bg-emerald-600 hover:bg-emerald-700"
                : ""
            }
          >
            {cat.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:justify-between">
        {/* Summary cards */}
        <div className="flex flex-wrap gap-3">
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Total Bill Amount</div>
              <div className="text-lg font-bold text-amber-600">
                {formatMoney(totalBillAmount)}
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Service Charge (Income)</div>
              <div className="text-lg font-bold text-green-600">
                {formatMoney(totalServiceCharge)}
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[140px]">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Count</div>
              <div className="text-lg font-bold">{filtered.length}</div>
            </CardContent>
          </Card>
        </div>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={() => openAddBill(selectedCategory)}
        >
          <Plus className="w-4 h-4 mr-2" /> Add Bill Payment
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">All Categories</option>
            {BILL_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="h-9 w-36"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="h-9 w-36"
          />
        </div>
        <Button variant="outline" size="sm" onClick={loadTransactions}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
              No bill payments found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Consumer Name</TableHead>
                    <TableHead>Account No</TableHead>
                    <TableHead className="text-right">Bill Amount</TableHead>
                    <TableHead className="text-right">Service Charge</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                    <TableHead>Reference</TableHead>
                    {isAdminOrManager && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((tx) => {
                    const cat = getCategoryBadge(tx.category);
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDateTime(tx.date)}
                        </TableCell>
                        <TableCell>
                          <Badge className={cat.color}>{cat.label}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{tx.consumerName || "-"}</TableCell>
                        <TableCell className="text-xs font-mono">{tx.accountNo || "-"}</TableCell>
                        <TableCell className="text-right font-medium text-amber-600">
                          {formatMoney(tx.billAmount)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          {formatMoney(tx.serviceCharge)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {formatMoney(tx.totalPaid)}
                        </TableCell>
                        <TableCell className="text-xs">{tx.referenceNo || "-"}</TableCell>
                        {isAdminOrManager && (
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-red-600 hover:text-red-700"
                              onClick={() => handleDelete(tx.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Bill Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              Add Bill Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-muted/50 rounded-md p-2 text-sm">
              <Badge className={getCategoryBadge(dialogCategory).color}>
                {getCategoryBadge(dialogCategory).label}
              </Badge>
            </div>
            <div className="space-y-1.5">
              <Label>Consumer Name</Label>
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g. Ahmed Khan"
                  value={form.consumerName}
                  onChange={(e) => setForm({ ...form, consumerName: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Consumer Phone</Label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g. 03001234567"
                  value={form.consumerPhone}
                  onChange={(e) => setForm({ ...form, consumerPhone: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Account No / Reference</Label>
              <div className="relative">
                <Hash className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g. 123456789"
                  value={form.accountNo}
                  onChange={(e) => setForm({ ...form, accountNo: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label>
                Bill Amount (Liability) <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <CircleDollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="Actual bill amount"
                  value={form.billAmount}
                  onChange={(e) => setForm({ ...form, billAmount: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                Service Charge (Income) <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <CircleDollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="Your commission"
                  value={form.serviceCharge}
                  onChange={(e) => setForm({ ...form, serviceCharge: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
            {(form.billAmount && form.serviceCharge) && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-md p-3 text-sm">
                <span className="text-muted-foreground">Total Paid: </span>
                <span className="font-bold text-emerald-600">
                  {formatMoney(
                    parseFloat(form.billAmount || "0") + parseFloat(form.serviceCharge || "0")
                  )}
                </span>
              </div>
            )}
            <Separator />
            <div className="space-y-1.5">
              <Label>Reference No</Label>
              <div className="relative">
                <Hash className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Optional"
                  value={form.referenceNo}
                  onChange={(e) => setForm({ ...form, referenceNo: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <div className="relative">
                <StickyNote className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Optional"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSave}
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Bill Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 3: WALLET (JazzCash / Easypaisa)
// ═════════════════════════════════════════════════════════════════════════════

function WalletTab({ isAdminOrManager }: { isAdminOrManager: boolean }) {
  const [transactions, setTransactions] = React.useState<WalletTx[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [selectedProvider, setSelectedProvider] = React.useState("JazzCash");
  const [selectedType, setSelectedType] = React.useState("SEND");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogProvider, setDialogProvider] = React.useState("JazzCash");
  const [dialogType, setDialogType] = React.useState("SEND");
  const [form, setForm] = React.useState({
    amount: "",
    serviceCharge: "0",
    customerName: "",
    customerPhone: "",
    referenceNo: "",
    note: "",
  });

  // Filters
  const [filterProvider, setFilterProvider] = React.useState("all");
  const [filterType, setFilterType] = React.useState("all");
  const [filterFrom, setFilterFrom] = React.useState(thirtyDaysAgoStr());
  const [filterTo, setFilterTo] = React.useState(todayStr());

  const loadTransactions = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterProvider !== "all") params.set("provider", filterProvider);
      if (filterType !== "all") params.set("type", filterType);
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      const res = await fetch(`/api/load-bill/wallet?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTransactions(data.transactions || []);
    } catch {
      toast.error("Failed to load wallet transactions");
    } finally {
      setLoading(false);
    }
  }, [filterProvider, filterType, filterFrom, filterTo]);

  React.useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const totalSent = React.useMemo(
    () =>
      transactions
        .filter((t) => t.type === "SEND")
        .reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const totalReceived = React.useMemo(
    () =>
      transactions
        .filter((t) => t.type === "RECEIVE")
        .reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const totalServiceCharge = React.useMemo(
    () => transactions.reduce((s, t) => s + t.serviceCharge, 0),
    [transactions]
  );

  function openAddTx() {
    setDialogProvider(selectedProvider);
    setDialogType(selectedType);
    setForm({
      amount: "",
      serviceCharge: "0",
      customerName: "",
      customerPhone: "",
      referenceNo: "",
      note: "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.amount) {
      toast.error("Amount is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/load-bill/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: dialogProvider,
          type: dialogType,
          amount: parseFloat(form.amount),
          serviceCharge: parseFloat(form.serviceCharge || "0"),
          customerName: form.customerName || undefined,
          customerPhone: form.customerPhone || undefined,
          referenceNo: form.referenceNo || undefined,
          note: form.note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to add transaction");
        setSaving(false);
        return;
      }
      toast.success("Wallet transaction added");
      setDialogOpen(false);
      loadTransactions();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/load-bill/wallet/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to delete");
        return;
      }
      toast.success("Transaction deleted");
      loadTransactions();
    } catch {
      toast.error("Network error");
    }
  }

  function providerBadge(provider: string) {
    if (provider === "JazzCash") return "bg-red-500 text-white";
    if (provider === "Easypaisa") return "bg-green-600 text-white";
    return "bg-gray-500 text-white";
  }

  return (
    <div className="space-y-4">
      {/* Provider + Type selector */}
      <div className="flex flex-wrap gap-2">
        {WALLET_PROVIDERS.map((p) => (
          <Button
            key={p}
            variant={selectedProvider === p ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedProvider(p)}
            className={
              selectedProvider === p
                ? p === "JazzCash"
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-green-600 hover:bg-green-700"
                : ""
            }
          >
            <Wallet className="w-4 h-4 mr-1" />
            {p}
          </Button>
        ))}
        <div className="w-px h-8 bg-border mx-1" />
        {WALLET_TYPES.map((t) => (
          <Button
            key={t.value}
            variant={selectedType === t.value ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedType(t.value)}
            className={
              selectedType === t.value
                ? t.value === "SEND"
                  ? "bg-red-500 hover:bg-red-600"
                  : "bg-green-500 hover:bg-green-600"
                : ""
            }
          >
            {t.value === "SEND" ? (
              <Send className="w-4 h-4 mr-1" />
            ) : (
              <ArrowDownLeft className="w-4 h-4 mr-1" />
            )}
            {t.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:justify-between">
        {/* Summary */}
        <div className="flex flex-wrap gap-3">
          <Card className="flex-1 min-w-[130px]">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Total Sent</div>
              <div className="text-lg font-bold text-red-600">{formatMoney(totalSent)}</div>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[130px]">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Total Received</div>
              <div className="text-lg font-bold text-green-600">
                {formatMoney(totalReceived)}
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[130px]">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Service Charge (Profit)</div>
              <div className="text-lg font-bold text-emerald-600">
                {formatMoney(totalServiceCharge)}
              </div>
            </CardContent>
          </Card>
        </div>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={openAddTx}
        >
          <Plus className="w-4 h-4 mr-2" /> Add Transaction
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Provider</Label>
          <select
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">All Providers</option>
            {WALLET_PROVIDERS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">All</option>
            <option value="SEND">Send Money</option>
            <option value="RECEIVE">Receive Money</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="h-9 w-36"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="h-9 w-36"
          />
        </div>
        <Button variant="outline" size="sm" onClick={loadTransactions}>
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Wallet className="w-10 h-10 mx-auto mb-2 opacity-50" />
              No wallet transactions found
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
                    <TableHead className="text-right">Service Charge</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Reference</TableHead>
                    {isAdminOrManager && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDateTime(tx.date)}
                      </TableCell>
                      <TableCell>
                        <Badge className={providerBadge(tx.provider)}>{tx.provider}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            tx.type === "SEND"
                              ? "bg-red-500 text-white hover:bg-red-600"
                              : "bg-green-500 text-white hover:bg-green-600"
                          }
                        >
                          {tx.type === "SEND" ? "Send" : "Receive"}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          tx.type === "SEND" ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {formatMoney(tx.amount)}
                      </TableCell>
                      <TableCell className="text-right text-emerald-600 font-medium">
                        {formatMoney(tx.serviceCharge)}
                      </TableCell>
                      <TableCell className="font-medium">{tx.customerName || "-"}</TableCell>
                      <TableCell className="text-xs">{tx.customerPhone || "-"}</TableCell>
                      <TableCell className="text-xs">{tx.referenceNo || "-"}</TableCell>
                      {isAdminOrManager && (
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-600 hover:text-red-700"
                            onClick={() => handleDelete(tx.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Transaction Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600" />
              Add Wallet Transaction
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="bg-muted/50 rounded-md px-3 py-1.5 text-sm flex items-center gap-2">
                <Badge className={providerBadge(dialogProvider)}>{dialogProvider}</Badge>
              </div>
              <div className="bg-muted/50 rounded-md px-3 py-1.5 text-sm flex items-center gap-2">
                <Badge
                  className={
                    dialogType === "SEND"
                      ? "bg-red-500 text-white"
                      : "bg-green-500 text-white"
                  }
                >
                  {dialogType === "SEND" ? "Send Money" : "Receive Money"}
                </Badge>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                Amount <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <CircleDollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="Transaction amount"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                Service Charge (Profit) <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <CircleDollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="Default 0"
                  value={form.serviceCharge}
                  onChange={(e) => setForm({ ...form, serviceCharge: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label>Customer Name</Label>
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Optional"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Customer Phone</Label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="e.g. 03001234567"
                  value={form.customerPhone}
                  onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reference No</Label>
              <div className="relative">
                <Hash className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Optional"
                  value={form.referenceNo}
                  onChange={(e) => setForm({ ...form, referenceNo: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <div className="relative">
                <StickyNote className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Optional note"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleSave}
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 4: REPORTS
// ═════════════════════════════════════════════════════════════════════════════

function ReportsTab() {
  const [reportType, setReportType] = React.useState("daily-cash");
  const [dateFrom, setDateFrom] = React.useState(thirtyDaysAgoStr());
  const [dateTo, setDateTo] = React.useState(todayStr());
  const [companyId, setCompanyId] = React.useState("all");
  const [reportData, setReportData] = React.useState<ReportData[]>([]);
  const [reportSummary, setReportSummary] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(false);
  const [generated, setGenerated] = React.useState(false);

  async function generateReport() {
    setLoading(true);
    setGenerated(false);
    try {
      const params = new URLSearchParams();
      params.set("type", reportType);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (companyId && companyId !== "all") params.set("companyId", companyId);

      const res = await fetch(`/api/load-bill/reports?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setReportData(data.data || []);
      setReportSummary(data.summary || {});
      setGenerated(true);
      toast.success("Report generated");
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Report type selector */}
      <div className="flex flex-wrap gap-2">
        {REPORT_TYPES.map((rt) => (
          <Button
            key={rt.value}
            variant={reportType === rt.value ? "default" : "outline"}
            size="sm"
            onClick={() => setReportType(rt.value)}
            className={
              reportType === rt.value
                ? "bg-emerald-600 hover:bg-emerald-700"
                : ""
            }
          >
            <BarChart3 className="w-4 h-4 mr-1" />
            {rt.label}
          </Button>
        ))}
      </div>

      {/* Date range + options */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 w-40"
              />
            </div>
            {(reportType === "daily-cash" || reportType === "company-wise") && (
              <div className="space-y-1">
                <Label className="text-xs">Company</Label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="all">All Companies</option>
                </select>
              </div>
            )}
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={generateReport}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Generate Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Display */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : generated && reportData.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>No data found for the selected criteria.</AlertDescription>
        </Alert>
      ) : generated ? (
        <div className="space-y-4">
          {/* Summary cards */}
          {Object.keys(reportSummary).length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(reportSummary).map(([key, val]) => (
                <Card key={key}>
                  <CardContent className="p-4">
                    <div className="text-xs text-muted-foreground capitalize">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </div>
                    <div className="text-xl font-bold">
                      {typeof val === "number"
                        ? formatMoney(val)
                        : String(val)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Report-specific rendering */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                {REPORT_TYPES.find((r) => r.value === reportType)?.label} Report
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                {reportType === "daily-cash" && <DailyCashReport data={reportData} />}
                {reportType === "company-wise" && <CompanyWiseReport data={reportData} />}
                {reportType === "service-charge" && <ServiceChargeReport data={reportData} />}
                {reportType === "wallet" && <WalletReport data={reportData} />}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="py-16 text-center text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a report type and date range, then click Generate Report</p>
        </div>
      )}
    </div>
  );
}

// ─── Report Sub-components ──────────────────────────────────────────────────

function DailyCashReport({ data }: { data: ReportData[] }) {
  if (data.length === 0) return null;
  const keys = Object.keys(data[0]).filter((k) => k !== "date");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          {keys.map((k) => (
            <TableHead key={k} className="text-right capitalize">
              {k.replace(/([A-Z])/g, " $1").trim()}
            </TableHead>
          ))}
          <TableHead className="text-right font-bold">Total Income</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => {
          const income = keys.reduce(
            (s, k) => s + (Number(row[k]) || 0),
            0
          );
          return (
            <TableRow key={i}>
              <TableCell className="font-medium whitespace-nowrap">
                {formatDate(String(row.date))}
              </TableCell>
              {keys.map((k) => (
                <TableCell key={k} className="text-right">
                  {formatMoney(Number(row[k]) || 0)}
                </TableCell>
              ))}
              <TableCell className="text-right font-bold text-green-600">
                {formatMoney(income)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function CompanyWiseReport({ data }: { data: ReportData[] }) {
  if (data.length === 0) return null;
  const keys = Object.keys(data[0]).filter((k) => k !== "companyName");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company</TableHead>
          {keys.map((k) => (
            <TableHead key={k} className="text-right capitalize">
              {k.replace(/([A-Z])/g, " $1").trim()}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow key={i}>
            <TableCell className="font-medium">
              {String(row.companyName)}
            </TableCell>
            {keys.map((k) => {
              const val = Number(row[k]) || 0;
              return (
                <TableCell
                  key={k}
                  className={`text-right ${
                    k === "profit" ? (val >= 0 ? "text-green-600" : "text-red-600") : ""
                  }`}
                >
                  {formatMoney(val)}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ServiceChargeReport({ data }: { data: ReportData[] }) {
  if (data.length === 0) return null;
  const keys = Object.keys(data[0]).filter((k) => k !== "date" && k !== "source");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Source</TableHead>
          {keys.map((k) => (
            <TableHead key={k} className="text-right capitalize">
              {k.replace(/([A-Z])/g, " $1").trim()}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow key={i}>
            <TableCell className="whitespace-nowrap">
              {formatDate(String(row.date))}
            </TableCell>
            <TableCell>
              <Badge variant="outline">{String(row.source)}</Badge>
            </TableCell>
            {keys.map((k) => (
              <TableCell key={k} className="text-right text-green-600 font-medium">
                {formatMoney(Number(row[k]) || 0)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function WalletReport({ data }: { data: ReportData[] }) {
  if (data.length === 0) return null;
  const keys = Object.keys(data[0]).filter((k) => k !== "provider");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Provider</TableHead>
          {keys.map((k) => (
            <TableHead key={k} className="text-right capitalize">
              {k.replace(/([A-Z])/g, " $1").trim()}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow key={i}>
            <TableCell>
              <Badge
                className={
                  String(row.provider) === "JazzCash"
                    ? "bg-red-500 text-white"
                    : "bg-green-600 text-white"
                }
              >
                {String(row.provider)}
              </Badge>
            </TableCell>
            {keys.map((k) => (
              <TableCell
                key={k}
                className={`text-right ${
                  k === "serviceCharge"
                    ? "text-emerald-600 font-medium"
                    : ""
                }`}
              >
                {formatMoney(Number(row[k]) || 0)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default LoadBillView;
