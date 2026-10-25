"use client";

import * as React from "react";
import {
  FileText,
  Plus,
  Trash2,
  TrendingUp,
  Banknote,
  Package,
  Phone,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatMoney } from "@/lib/pos-utils";

// v2.10.110: Bill Receive View — replaces the old "Scanner" nav item.
// This is a dedicated page for collecting electricity/gas/water/internet
// bills from customers. Records:
//   - category (electricity/gas/water/internet/other)
//   - consumer name + phone (optional)
//   - account number / reference
//   - bill amount (the actual bill value — liability to the company)
//   - service charge (the shop's profit / commission)
//   - total paid by customer = bill amount + service charge
//
// The page shows today's totals:
//   - Bill count (تعداد)
//   - Total bill amount collected (بل کی اماؤنٹ)
//   - Total extra charges (ایکسٹرا چارجز — profit)
//   - Total cash received from customer
//
// The user spec:
//   "بل ریسیو والا ایک پیج ایڈ کرو جس کے اندر ہم بجلی کے بل کسٹمر سے
//    وصول کریں گے اس میں پیمنٹ کتنی ریسیو کی ہے اور ایکسٹرا چارجز کتنے
//    ریسیو کیے ہیں تو اس طرح ہم وہاں سے ہی ٹوٹل دیکھ سکیں گے کہ ٹوٹل
//    ہم نے بل کتنے بل کی کتنی اماؤنٹ کا ٹھیک کی ہے فار ایگزمپل بل کی
//    تعداد ہمیں پتہ ہونی چاہیے اور دوسرا بل کی جو اماؤنٹ ہم نے ریسیو
//    کی ہے وہ کتنی ہے ایکسٹرا چارجر پرافٹ گنے جائیں گے وہ ٹوٹل اماؤنٹ
//    سے علیحدہ ہی ہوں گے جو ہمیں دکھائے گا کہ اج پرافٹ بل کا اتنا ہے"

interface BillPayment {
  id: string;
  category: string;
  consumerName?: string | null;
  consumerPhone?: string | null;
  accountNo?: string | null;
  billAmount: number;
  serviceCharge: number;
  totalPaid: number;
  amountReceived: number;
  due: number;
  referenceNo?: string | null;
  note?: string | null;
  operatorName?: string | null;
  createdAt: string;
}

const CATEGORIES = [
  { value: "electricity", label: "Electricity — بجلی", color: "amber" },
  { value: "gas", label: "Gas — گیس", color: "blue" },
  { value: "water", label: "Water — پانی", color: "sky" },
  { value: "internet", label: "Internet — انٹرنیٹ", color: "violet" },
  { value: "other", label: "Other — دیگر", color: "slate" },
];

export function BillReceiveView() {
  const [txns, setTxns] = React.useState<BillPayment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Form state
  const [category, setCategory] = React.useState("electricity");
  const [consumerName, setConsumerName] = React.useState("");
  const [consumerPhone, setConsumerPhone] = React.useState("");
  const [accountNo, setAccountNo] = React.useState("");
  const [billAmount, setBillAmount] = React.useState("");
  const [serviceCharge, setServiceCharge] = React.useState("");
  const [referenceNo, setReferenceNo] = React.useState("");
  const [note, setNote] = React.useState("");

  const currency = "Rs"; // Default; could be made dynamic later

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/load-bill/bill-payment?limit=200", { cache: "no-store" });
      const d = await res.json();
      setTxns(d.payments || []);
    } catch {
      toast.error("Failed to load bill payments");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Compute today's totals
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTxns = txns.filter(t => new Date(t.createdAt) >= today);
  // Exclude withdrawals (negative billAmount records are withdrawals)
  const todayBills = todayTxns.filter(t => (t.billAmount || 0) > 0);

  const billCount = todayBills.length;
  const totalBillAmount = todayBills.reduce((s, t) => s + (t.billAmount || 0), 0);
  const totalCharges = todayBills.reduce((s, t) => s + (t.serviceCharge || 0), 0);
  const totalReceived = todayBills.reduce((s, t) => s + (t.totalPaid || 0), 0);

  // Category breakdown for today
  const categoryBreakdown = CATEGORIES.map(cat => {
    const catTxns = todayBills.filter(t => t.category === cat.value);
    return {
      ...cat,
      count: catTxns.length,
      billAmount: catTxns.reduce((s, t) => s + (t.billAmount || 0), 0),
      charges: catTxns.reduce((s, t) => s + (t.serviceCharge || 0), 0),
    };
  }).filter(c => c.count > 0);

  const billAmountNum = parseFloat(billAmount) || 0;
  const serviceChargeNum = parseFloat(serviceCharge) || 0;
  const totalForCustomer = billAmountNum + serviceChargeNum;

  function resetForm() {
    setCategory("electricity");
    setConsumerName("");
    setConsumerPhone("");
    setAccountNo("");
    setBillAmount("");
    setServiceCharge("");
    setReferenceNo("");
    setNote("");
  }

  async function handleSave() {
    if (billAmountNum <= 0) {
      toast.error("Enter bill amount");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/load-bill/bill-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          consumerName: consumerName.trim() || undefined,
          consumerPhone: consumerPhone.trim() || undefined,
          accountNo: accountNo.trim() || undefined,
          billAmount: billAmountNum,
          serviceCharge: serviceChargeNum,
          totalPaid: totalForCustomer,
          amountReceived: totalForCustomer,
          due: 0,
          referenceNo: referenceNo.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to save bill payment");
        setSaving(false);
        return;
      }
      toast.success(`Bill recorded: ${formatMoney(totalForCustomer, currency)} (Profit: ${formatMoney(serviceChargeNum, currency)})`);
      setOpen(false);
      resetForm();
      load();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this bill payment? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/load-bill/bill-payment?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Bill payment deleted");
        load();
      } else {
        const d = await res.json();
        toast.error(d.error || "Failed to delete");
      }
    } catch {
      toast.error("Network error");
    }
  }

  function openNew() {
    resetForm();
    setOpen(true);
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-600" />
            Bill Receive — بل وصول
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            بجلی / گیس / پانی / انٹرنیٹ بل کسٹمر سے وصول کریں — تعداد، اماؤنٹ، اور پرافٹ ایک جگہ دیکھیں
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> New Bill
          </Button>
        </div>
      </div>

      {/* Today's Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Bill Count */}
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center mx-auto mb-2">
              <Package className="w-6 h-6 text-emerald-700" />
            </div>
            <div className="text-xs text-emerald-700 font-medium">Bill Count — بل کی تعداد</div>
            <div className="text-2xl font-bold text-emerald-800">{billCount}</div>
            <div className="text-[10px] text-emerald-600 mt-1">bills received today</div>
          </CardContent>
        </Card>

        {/* Total Bill Amount */}
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center mx-auto mb-2">
              <Banknote className="w-6 h-6 text-blue-700" />
            </div>
            <div className="text-xs text-blue-700 font-medium">Bill Amount — بل کی اماؤنٹ</div>
            <div className="text-2xl font-bold text-blue-800">{formatMoney(totalBillAmount, currency)}</div>
            <div className="text-[10px] text-blue-600 mt-1">total bills value</div>
          </CardContent>
        </Card>

        {/* Extra Charges (Profit) */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mx-auto mb-2">
              <TrendingUp className="w-6 h-6 text-amber-700" />
            </div>
            <div className="text-xs text-amber-700 font-medium">Extra Charges — ایکسٹرا چارجز</div>
            <div className="text-2xl font-bold text-amber-800">{formatMoney(totalCharges, currency)}</div>
            <div className="text-[10px] text-amber-600 mt-1">profit from bills today</div>
          </CardContent>
        </Card>

        {/* Total Received from Customer */}
        <Card className="border-violet-200 bg-violet-50">
          <CardContent className="p-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center mx-auto mb-2">
              <Banknote className="w-6 h-6 text-violet-700" />
            </div>
            <div className="text-xs text-violet-700 font-medium">Total Received — کل موصول</div>
            <div className="text-2xl font-bold text-violet-800">{formatMoney(totalReceived, currency)}</div>
            <div className="text-[10px] text-violet-600 mt-1">bill + charges (cash from customer)</div>
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown (only if there are bills today) */}
      {categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Today's Breakdown by Category — آج کی تفصیل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {categoryBreakdown.map(cat => (
                <div key={cat.value} className={`rounded-lg border p-3 text-center ${
                  cat.color === "amber" ? "border-amber-200 bg-amber-50" :
                  cat.color === "blue" ? "border-blue-200 bg-blue-50" :
                  cat.color === "sky" ? "border-sky-200 bg-sky-50" :
                  cat.color === "violet" ? "border-violet-200 bg-violet-50" :
                  "border-slate-200 bg-slate-50"
                }`}>
                  <div className="text-xs font-medium">{cat.label}</div>
                  <div className="text-lg font-bold mt-1">{cat.count}</div>
                  <div className="text-[10px] text-muted-foreground">
                    Bills: {formatMoney(cat.billAmount, currency)} | Profit: {formatMoney(cat.charges, currency)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Today's Bills — آج کے بل
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-32 rounded bg-muted animate-pulse" />
          ) : todayBills.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No bills received today. Click "New Bill" to start.</p>
              <p className="text-xs mt-1">آج کوئی بل نہیں موصول۔ "New Bill" پر کلک کریں۔</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Time</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Consumer</TableHead>
                    <TableHead className="text-xs">Account/Ref</TableHead>
                    <TableHead className="text-xs text-right">Bill Amt</TableHead>
                    <TableHead className="text-xs text-right">Charge</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayBills.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">
                        {new Date(t.createdAt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {CATEGORIES.find(c => c.value === t.category)?.label?.split(" — ")[0] || t.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {t.consumerName || "—"}
                        {t.consumerPhone && (
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {t.consumerPhone}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{t.accountNo || t.referenceNo || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatMoney(t.billAmount, currency)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-emerald-700">{formatMoney(t.serviceCharge || 0, currency)}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold">{formatMoney(t.totalPaid, currency)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-rose-600 hover:bg-rose-50 px-2"
                          onClick={() => handleDelete(t.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* New Bill Dialog */}
      <Dialog open={open} onOpenChange={(v) => {
        if (!v) {
          setOpen(false);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              New Bill — نیا بل
            </DialogTitle>
            <DialogDescription className="text-sm">
              Record a bill received from customer (electricity / gas / water / internet)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Category */}
            <div className="space-y-1">
              <Label className="text-sm font-medium">Category — قسم *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Consumer Name + Phone */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Consumer Name — نام</Label>
                <Input
                  value={consumerName}
                  onChange={(e) => setConsumerName(e.target.value)}
                  placeholder="Customer name"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone — فون</Label>
                <Input
                  value={consumerPhone}
                  onChange={(e) => setConsumerPhone(e.target.value)}
                  placeholder="Phone"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Account No + Reference */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Account No — اکاؤنٹ نمبر</Label>
                <Input
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  placeholder="Bill account/reference"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reference No — ریفرنس</Label>
                <Input
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="Optional"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Bill Amount + Service Charge */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Bill Amount — بل کی رقم *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  autoFocus
                  className="h-12 text-lg text-center font-mono font-bold border-emerald-300"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && billAmountNum > 0) {
                      e.preventDefault();
                      handleSave();
                    }
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Service Charge — چارجز (profit)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={serviceCharge}
                  onChange={(e) => setServiceCharge(e.target.value)}
                  placeholder="e.g. 50"
                  className="h-12 text-lg text-center font-mono font-bold border-amber-300"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && billAmountNum > 0) {
                      e.preventDefault();
                      handleSave();
                    }
                  }}
                />
              </div>
            </div>

            {/* Total preview */}
            <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-emerald-700 font-medium">Customer Pays — گاہک ادا کرے گا</div>
                <div className="text-[10px] text-emerald-600">Bill + Service Charge</div>
              </div>
              <div className="text-2xl font-bold text-emerald-800">
                {formatMoney(totalForCustomer, currency)}
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1">
              <Label className="text-xs">Note — نوٹ (optional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={saving || billAmountNum <= 0}
              onClick={handleSave}
            >
              {saving ? "Saving..." : "Save Bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
