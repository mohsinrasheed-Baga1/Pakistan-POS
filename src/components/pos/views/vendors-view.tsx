"use client";

import * as React from "react";
import {
  Truck,
  Plus,
  Search,
  Pencil,
  Trash2,
  RefreshCw,
  Building2,
  Phone,
  MapPin,
  DollarSign,
  Eye,
  Wallet,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
import type { Vendor, VendorPurchase } from "@/types";

interface VendorsViewProps {
  userRole: string;
}

interface VendorWithCount extends Vendor {
  _count?: { products?: number };
}

const emptyForm = {
  name: "",
  companyName: "",
  phone: "",
  address: "",
  note: "",
  active: true,
};

export function VendorsView({ userRole }: VendorsViewProps) {
  const canManage = userRole !== "CASHIER";
  const [vendors, setVendors] = React.useState<VendorWithCount[]>([]);
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<any>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  // Purchase / Payment dialogs
  const [purchaseDialogOpen, setPurchaseDialogOpen] = React.useState(false);
  const [purchaseVendorId, setPurchaseVendorId] = React.useState<string | null>(null);
  const [purchaseAmount, setPurchaseAmount] = React.useState("");
  const [purchaseDesc, setPurchaseDesc] = React.useState("");
  const [purchaseType, setPurchaseType] = React.useState<"PURCHASE" | "PAYMENT">("PURCHASE");
  const [purchaseSaving, setPurchaseSaving] = React.useState(false);

  // Detail dialog
  const [detailDialogOpen, setDetailDialogOpen] = React.useState(false);
  const [detailVendor, setDetailVendor] = React.useState<VendorWithCount | null>(null);
  const [detailPurchases, setDetailPurchases] = React.useState<VendorPurchase[]>([]);
  const [detailLoading, setDetailLoading] = React.useState(false);

  const loadVendors = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const res = await fetch(`/api/vendors?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      // Safely handle vendors - add missing fields with defaults for backward compat
      const vendorList = (data.vendors || []).map((v: any) => ({
        ...v,
        totalPurchased: v.totalPurchased ?? 0,
        totalPaid: v.totalPaid ?? 0,
        balance: v.balance ?? 0,
      }));
      setVendors(vendorList);
    } catch {
      toast.error("Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }, [q]);

  React.useEffect(() => {
    const t = setTimeout(loadVendors, 200);
    return () => clearTimeout(t);
  }, [loadVendors]);

  function openAdd() {
    setForm(emptyForm);
    setEditId(null);
    setDialogOpen(true);
  }

  function openEdit(v: Vendor) {
    setForm({
      name: v.name,
      companyName: v.companyName || "",
      phone: v.phone || "",
      address: v.address || "",
      note: v.note || "",
      active: v.active,
    });
    setEditId(v.id);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        companyName: form.companyName.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        note: form.note.trim() || null,
        active: form.active,
      };
      if (editId) body.id = editId;
      const url = editId ? "/api/vendors" : "/api/vendors";
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
      toast.success(editId ? "Vendor updated" : "Vendor added");
      setDialogOpen(false);
      loadVendors();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/vendors/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || "Failed to delete");
        return;
      }
      toast.success("Vendor deleted");
      setDeleteId(null);
      loadVendors();
    } catch {
      toast.error("Network error");
    }
  }

  // Open purchase dialog
  function openPurchaseDialog(v: VendorWithCount, type: "PURCHASE" | "PAYMENT") {
    setPurchaseVendorId(v.id);
    setPurchaseType(type);
    setPurchaseAmount("");
    setPurchaseDesc("");
    setPurchaseDialogOpen(true);
  }

  // Submit purchase/payment
  async function handlePurchaseSubmit() {
    if (!purchaseVendorId || !purchaseAmount || parseFloat(purchaseAmount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setPurchaseSaving(true);
    try {
      if (purchaseType === "PURCHASE") {
        const res = await fetch(`/api/vendors/${purchaseVendorId}/purchases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: parseFloat(purchaseAmount),
            description: purchaseDesc.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || "Failed"); return; }
        toast.success("Purchase recorded");
      } else {
        const res = await fetch(`/api/vendors/${purchaseVendorId}/pay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: parseFloat(purchaseAmount),
            description: purchaseDesc.trim() || undefined,
            payAll: false,
          }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error || "Failed"); return; }
        toast.success("Payment recorded");
      }
      setPurchaseDialogOpen(false);
      loadVendors();
    } catch {
      toast.error("Network error");
    } finally {
      setPurchaseSaving(false);
    }
  }

  // Pay All remaining balance
  async function handlePayAll(v: VendorWithCount) {
    if (!v || v.balance <= 0) return;
    try {
      const res = await fetch(`/api/vendors/${v.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: v.balance, payAll: true }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed"); return; }
      toast.success(`Paid Rs ${v.balance.toLocaleString()} to ${v.name}`);
      loadVendors();
    } catch {
      toast.error("Network error");
    }
  }

  // Open detail dialog
  async function openDetail(v: VendorWithCount) {
    setDetailVendor(v);
    setDetailDialogOpen(true);
    setDetailLoading(true);
    setDetailPurchases([]);
    try {
      const res = await fetch(`/api/vendors/${v.id}/purchases`);
      if (!res.ok) {
        // Purchases endpoint might not exist yet - that's OK
        setDetailPurchases([]);
        return;
      }
      const data = await res.json();
      setDetailPurchases(data.purchases || []);
    } catch {
      setDetailPurchases([]);
    } finally {
      setDetailLoading(false);
    }
  }

  // Totals
  const totalBalance = vendors.reduce((sum, v) => sum + (v.balance || 0), 0);
  const totalPurchased = vendors.reduce((sum, v) => sum + (v.totalPurchased || 0), 0);
  const totalPaid = vendors.reduce((sum, v) => sum + (v.totalPaid || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="w-6 h-6 text-emerald-600" />
            Vendors
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage suppliers, purchase tracking and payments
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadVendors}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          {canManage && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={openAdd}
            >
              <Plus className="w-4 h-4 mr-2" /> New Vendor
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Purchased</div>
              <div className="text-lg font-bold text-blue-700">
                Rs {totalPurchased.toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Paid</div>
              <div className="text-lg font-bold text-emerald-700">
                Rs {totalPaid.toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Balance Due</div>
              <div className="text-lg font-bold text-red-700">
                Rs {totalBalance.toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search vendors by name, company or phone..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : vendors.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Truck className="w-10 h-10 mx-auto mb-2 opacity-50" />
              No vendors found
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Purchased</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-center">Products</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                            <Truck className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div>
                            <div>{v.name}</div>
                            {v.note && (
                              <div className="text-xs text-muted-foreground max-w-[200px] truncate">
                                {v.note}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {v.companyName ? (
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                            {v.companyName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {v.phone ? (
                          <span className="inline-flex items-center gap-1 text-sm font-mono">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                            {v.phone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        Rs {(v.totalPurchased || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        Rs {(v.totalPaid || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-mono font-bold text-sm ${v.balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                          Rs {(v.balance || 0).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="font-mono">
                          {v._count?.products ?? 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {v.active ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage ? (
                          <div className="flex gap-1 justify-end flex-wrap">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDetail(v)} title="View details">
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openPurchaseDialog(v, "PURCHASE")} title="Add purchase">
                              <TrendingUp className="w-3 h-3 mr-1" /> Purchase
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openPurchaseDialog(v, "PAYMENT")} title="Record payment">
                              <TrendingDown className="w-3 h-3 mr-1" /> Pay
                            </Button>
                            {v.balance > 0 && (
                              <Button size="sm" variant="outline" className="h-8 text-xs bg-red-50 text-red-700 hover:bg-red-100" onClick={() => handlePayAll(v)} title="Pay all balance">
                                Pay All
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(v)} title="Edit">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => setDeleteId(v.id)} title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDetail(v)} title="View details">
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
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
              {editId ? "Edit Vendor" : "Add New Vendor"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Vendor Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. ABC Traders, John Smith"
              />
            </div>
            <div className="space-y-2">
              <Label>Company Name</Label>
              <Input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                placeholder="e.g. ABC Wholesale Ltd."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Contact number"
                  inputMode="tel"
                />
              </div>
              <div className="space-y-2">
                <Label>Active</Label>
                <div className="flex items-center h-9 gap-2">
                  <Switch
                    checked={form.active}
                    onCheckedChange={(c) => setForm({ ...form, active: c })}
                  />
                  <span className="text-sm text-muted-foreground">
                    {form.active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Street, city, region"
              />
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Optional internal note about this vendor"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purchase/Payment dialog */}
      <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {purchaseType === "PURCHASE" ? "Add Purchase" : "Record Payment"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (Rs) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={purchaseAmount}
                onChange={(e) => setPurchaseAmount(e.target.value)}
                placeholder="Enter amount"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={purchaseDesc}
                onChange={(e) => setPurchaseDesc(e.target.value)}
                placeholder="e.g. Monthly order, Invoice #123"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurchaseDialogOpen(false)} disabled={purchaseSaving}>
              Cancel
            </Button>
            <Button
              className={purchaseType === "PURCHASE" ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"}
              onClick={handlePurchaseSubmit}
              disabled={purchaseSaving}
            >
              {purchaseSaving ? "Saving..." : purchaseType === "PURCHASE" ? "Add Purchase" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-emerald-600" />
              {detailVendor?.name}
            </DialogTitle>
          </DialogHeader>
          {detailVendor && (
            <div className="space-y-4">
              {/* Info summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-blue-50">
                  <div className="text-xs text-blue-600">Total Purchased</div>
                  <div className="text-lg font-bold text-blue-700">Rs {(detailVendor.totalPurchased || 0).toLocaleString()}</div>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50">
                  <div className="text-xs text-emerald-600">Total Paid</div>
                  <div className="text-lg font-bold text-emerald-700">Rs {(detailVendor.totalPaid || 0).toLocaleString()}</div>
                </div>
                <div className="p-3 rounded-lg bg-red-50">
                  <div className="text-xs text-red-600">Balance Due</div>
                  <div className="text-lg font-bold text-red-700">Rs {(detailVendor.balance || 0).toLocaleString()}</div>
                </div>
                <div className="p-3 rounded-lg bg-gray-50">
                  <div className="text-xs text-gray-600">Products</div>
                  <div className="text-lg font-bold text-gray-700">{detailVendor._count?.products ?? 0}</div>
                </div>
              </div>

              {/* Vendor info */}
              <div className="text-sm text-muted-foreground space-y-1">
                {detailVendor.companyName && <div><Building2 className="w-3 h-3 inline mr-1" />{detailVendor.companyName}</div>}
                {detailVendor.phone && <div><Phone className="w-3 h-3 inline mr-1" />{detailVendor.phone}</div>}
                {detailVendor.address && <div><MapPin className="w-3 h-3 inline mr-1" />{detailVendor.address}</div>}
              </div>

              {/* Purchase history */}
              <div>
                <h3 className="font-semibold text-sm mb-2">Purchase & Payment History</h3>
                {detailLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : detailPurchases.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">No transactions yet</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailPurchases.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Badge className={p.type === "PURCHASE" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}>
                              {p.type === "PURCHASE" ? "Purchase" : "Payment"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.description || "-"}</TableCell>
                          <TableCell className={`text-right font-mono font-bold ${p.type === "PURCHASE" ? "text-blue-600" : "text-emerald-600"}`}>
                            {p.type === "PURCHASE" ? "+" : "-"} Rs {p.amount.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Products linked to this vendor will
              keep their vendor reference cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
