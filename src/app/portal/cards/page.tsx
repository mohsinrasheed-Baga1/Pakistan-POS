"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreditCard, Plus, Search, Loader2 } from "lucide-react";
import { PortalShell, useShopSupabase } from "@/components/portal/portal-shell";
import { toast } from "sonner";

export default function CardsPage() {
  return (
    <PortalShell>
      <CardsContent />
    </PortalShell>
  );
}

function CardsContent() {
  const sb = useShopSupabase();
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ card_number: "", customer_name: "", customer_phone: "", balance: 0 });

  useEffect(() => {
    if (!sb) return;
    (async () => {
      try {
        const { data } = await sb.from("customer_cards").select("*").order("created_at", { ascending: false }).limit(500);
        setCards(data || []);
      } catch (err) {
        console.error("Cards load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [sb]);

  async function handleSave() {
    if (!sb || !form.card_number.trim() || !form.customer_name.trim()) {
      toast.error("Card number and customer name are required");
      return;
    }
    setSaving(true);
    try {
      const { error } = await sb.from("customer_cards").insert({
        card_number: form.card_number.trim().toUpperCase(),
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim() || null,
        balance: Number(form.balance) || 0,
        card_type: "REGULAR",
        is_active: true,
      });
      if (error) throw error;
      toast.success("Card created");
      setShowForm(false);
      setForm({ card_number: "", customer_name: "", customer_phone: "", balance: 0 });
      const { data } = await sb.from("customer_cards").select("*").order("created_at", { ascending: false }).limit(500);
      setCards(data || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to create card");
    } finally {
      setSaving(false);
    }
  }

  const filtered = cards.filter(c =>
    !search || c.card_number?.includes(search.toUpperCase()) || c.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shop Cards</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} cards</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-2" /> Add Card
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by card number or name..." className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No cards found.</p>
          ) : (
            <div className="divide-y">
              {filtered.map((c) => (
                <div key={c.id} className="flex justify-between items-center p-3 hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-amber-600" />
                    <div>
                      <div className="font-medium">{c.customer_name}</div>
                      <div className="text-xs text-muted-foreground">
                        Card: <span className="font-mono">{c.card_number}</span>
                        {c.customer_phone && ` · ${c.customer_phone}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={c.balance >= 0 ? "bg-emerald-600" : "bg-red-600"}>
                      Rs {c.balance?.toLocaleString()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Card</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Card Number *</Label>
              <Input value={form.card_number} onChange={(e) => setForm({ ...form, card_number: e.target.value.toUpperCase() })} placeholder="CARD-001" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Customer Name *</Label>
              <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} placeholder="Ahmed Ali" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} placeholder="03001234567" />
            </div>
            <div className="space-y-1.5">
              <Label>Opening Balance (Rs)</Label>
              <Input type="number" value={form.balance} onChange={(e) => setForm({ ...form, balance: Number(e.target.value) })} placeholder="0" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Create Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
