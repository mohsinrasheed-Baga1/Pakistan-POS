"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save, Store } from "lucide-react";
import { PortalShell, useShopSupabase } from "@/components/portal/portal-shell";
import { toast } from "sonner";

export default function SettingsPage() {
  return (
    <PortalShell>
      <SettingsContent />
    </PortalShell>
  );
}

function SettingsContent() {
  const sb = useShopSupabase();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    shop_name: "",
    shop_address: "",
    shop_phone: "",
    owner_name: "",
    currency: "Rs",
  });

  useEffect(() => {
    if (!sb) return;
    (async () => {
      try {
        const { data } = await sb.from("shop_info").select("*").eq("id", "shop").single();
        if (data) {
          setForm({
            shop_name: data.shop_name || "",
            shop_address: data.shop_address || "",
            shop_phone: data.shop_phone || "",
            owner_name: data.owner_name || "",
            currency: data.currency || "Rs",
          });
        }
      } catch (err) {
        console.error("Settings load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [sb]);

  async function handleSave() {
    if (!sb) return;
    setSaving(true);
    try {
      const { error } = await sb.from("shop_info").update({
        shop_name: form.shop_name,
        shop_address: form.shop_address || null,
        shop_phone: form.shop_phone || null,
        owner_name: form.owner_name || null,
        currency: form.currency || "Rs",
        updated_at: new Date().toISOString(),
      }).eq("id", "shop");
      if (error) throw error;
      toast.success("Settings saved!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 max-w-md">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Update your shop information</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="w-4 h-4 text-emerald-600" />
            Shop Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Shop Name</Label>
            <Input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} placeholder="My Shop" />
          </div>
          <div className="space-y-1.5">
            <Label>Shop Address</Label>
            <Input value={form.shop_address} onChange={(e) => setForm({ ...form, shop_address: e.target.value })} placeholder="House #, Street, Area, City" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.shop_phone} onChange={(e) => setForm({ ...form, shop_phone: e.target.value })} placeholder="03001234567" />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="Rs" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Owner Name</Label>
            <Input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} placeholder="Owner name" />
          </div>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-center text-xs text-muted-foreground">
          <p>Pakistan POS · Developed by Mohsin Rasheed Baga · +923000088482</p>
        </CardContent>
      </Card>
    </div>
  );
}
