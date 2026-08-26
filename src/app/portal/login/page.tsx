"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Loader2, Store, KeyRound, Mail, Lock, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function ShopkeeperLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    licenseKey: "",
    email: "",
    password: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.licenseKey || !form.email || !form.password) {
      toast.error("All fields are required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        // Store shop info + Supabase credentials in sessionStorage
        sessionStorage.setItem("pakpos_shop", JSON.stringify(data.shop));
        toast.success(`Welcome, ${data.shop.customerName}!`);
        router.push("/portal/dashboard");
      } else {
        toast.error(data.error || "Login failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">Pakistan POS</CardTitle>
          <CardDescription>Shopkeeper Login — Access your online dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> Email
              </Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="shop@example.com"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Password
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-muted-foreground">
                <KeyRound className="w-3.5 h-3.5" /> License Key (optional)
              </Label>
              <Input
                value={form.licenseKey}
                onChange={(e) => setForm({ ...form, licenseKey: e.target.value.toUpperCase() })}
                placeholder="Leave empty to login with email only"
                className="font-mono"
              />
            </div>
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying…</>
              ) : (
                <>Login <ArrowRight className="w-4 h-4 ml-2" /></>
              )}
            </Button>
          </form>
          <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
            <p className="font-semibold mb-1">📋 How to login:</p>
            <p>1. Enter your License Key (PAKPOS-XXXX-XXXX)</p>
            <p>2. Enter the email and password provided by your software provider</p>
          </div>
          <p className="text-xs text-center text-muted-foreground mt-4">
            Developed by Mohsin Rasheed Baga · +923000088482
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
