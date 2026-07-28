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
// @ts-ignore - qrcode has no bundled types in this project
import QRCode from "qrcode";
import type { CustomerCard, Settings } from "@/types";

interface CardsViewProps {
  userRole: string;
}

const emptyForm = {
  name: "",
  phone: "",
  address: "",
  type: "REGULAR" as "REGULAR" | "WHOLESALE" | "SHOP_KEEPER",
  cardNumber: "",
  active: true,
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
      {/* Header — subName (top, bold) + shop name/address/phone */}
      <div
        style={{
          background: "#f0f0f0",
          borderBottom: "1px solid #000",
          padding: "1mm 2mm",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontWeight: "bold",
            fontSize: "11px",
            lineHeight: 1.1,
            color: "#000",
          }}
        >
          {subName}
        </div>
        <div style={{ fontSize: "7px", lineHeight: 1.15, color: "#000" }}>
          {shopName}
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
        <div
          style={{
            textAlign: "center",
            fontWeight: "bold",
            fontSize: "8px",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            color: "#000",
          }}
        >
          — SHOP CARD —
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1mm",
          }}
        >
          <User
            style={{ width: "10px", height: "10px", color: "#000" }}
          />
          <span
            style={{
              fontSize: "9px",
              fontWeight: "bold",
              color: "#000",
              textTransform: "uppercase",
            }}
          >
            {card.name}
          </span>
        </div>

        <div
          style={{
            fontSize: "12px",
            fontWeight: "bold",
            fontFamily: "Courier New, monospace",
            letterSpacing: "1px",
            color: "#000",
            textAlign: "center",
            padding: "0.4mm 0",
          }}
        >
          {card.cardNumber}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              border: "1px solid #000",
              padding: "0.4mm 2mm",
              fontSize: "8px",
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

        {/* QR + Barcode side by side */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1mm",
            marginTop: "auto",
          }}
        >
          <div style={{ width: "12mm", height: "12mm" }}>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR"
                style={{ width: "100%", height: "100%" }}
              />
            ) : null}
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <BarcodeDisplay
              value={card.cardNumber}
              format="CODE128"
              height={26}
              width={1}
              displayValue={false}
            />
          </div>
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
    const win = window.open("", "_blank", "width=520,height=360");
    if (!win) {
      toast.error("Pop-up blocked. Please allow pop-ups to print.");
      return;
    }
    const cardTypeLabel = card.type === "WHOLESALE" ? "Wholesale" : card.type === "SHOP_KEEPER" ? "Shop Keeper" : "Regular";
    const qrImg = qrDataUrl
      ? `<img src="${qrDataUrl}" style="width:12mm;height:12mm;" alt="QR" />`
      : "";

    win.document.write(`
      <html dir="ltr"><head><title>Shop Card ${card.cardNumber}</title>
      <style>
        @page { size: 85.6mm 54mm; margin: 0; }
        html, body { margin: 0; padding: 0; }
        body { width: 85.6mm; height: 54mm; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .card {
          width: 85.6mm;
          height: 54mm;
          border: 1px solid #000;
          display: flex;
          flex-direction: column;
          font-family: Tahoma, Arial, sans-serif;
          overflow: hidden;
          color: #000;
          background: #fff;
        }
        .header {
          background: #f0f0f0;
          border-bottom: 1px solid #000;
          padding: 1mm 2mm;
          text-align: center;
        }
        .sub-name { font-weight: bold; font-size: 11px; line-height: 1.1; color: #000; }
        .shop-meta { font-size: 7px; line-height: 1.15; color: #000; }
        .body { flex: 1; padding: 1mm 2mm; display: flex; flex-direction: column; gap: 0.6mm; }
        .title { text-align: center; font-weight: bold; font-size: 8px; letter-spacing: 0.5px; text-transform: uppercase; color: #000; }
        .holder { display: flex; align-items: center; gap: 1mm; }
        .holder-name { font-size: 9px; font-weight: bold; color: #000; text-transform: uppercase; }
        .card-number { font-size: 12px; font-weight: bold; font-family: 'Courier New', monospace; letter-spacing: 1px; color: #000; text-align: center; padding: 0.4mm 0; }
        .type-row { display: flex; align-items: center; justify-content: center; }
        .type-badge { border: 1px solid #000; padding: 0.4mm 2mm; font-size: 8px; font-weight: bold; color: #000; background: #fff; text-transform: uppercase; letter-spacing: 0.5px; }
        .footer { display: flex; align-items: center; justify-content: space-between; gap: 1mm; margin-top: auto; }
        .qr { width: 12mm; height: 12mm; }
        .barcode { flex: 1; display: flex; justify-content: center; align-items: center; overflow: hidden; }
      </style></head>
      <body>
        <div class="card">
          <div class="header">
            <div class="sub-name">${escapeHtml(subName)}</div>
            <div class="shop-meta">
              ${escapeHtml(shopName)}${
                shopAddress ? ` &bull; ${escapeHtml(shopAddress)}` : ""
              }${shopPhone ? ` &bull; ${escapeHtml(shopPhone)}` : ""}
            </div>
          </div>
          <div class="body">
            <div class="title">&mdash; SHOP CARD &mdash;</div>
            <div class="holder">
              <span style="font-size:10px;">&#9635;</span>
              <span class="holder-name">${escapeHtml(card.name)}</span>
            </div>
            <div class="card-number">${escapeHtml(card.cardNumber)}</div>
            <div class="type-row">
              <span class="type-badge">${escapeHtml(cardTypeLabel)}</span>
            </div>
            <div class="footer">
              <div class="qr">${qrImg}</div>
              <div class="barcode">
                <svg id="barcode-svg"></svg>
              </div>
            </div>
          </div>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
        <script>
          try {
            JsBarcode('#barcode-svg', '${escapeHtml(card.cardNumber)}', {
              format: 'CODE128',
              width: 1,
              height: 26,
              displayValue: false,
              margin: 0
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
