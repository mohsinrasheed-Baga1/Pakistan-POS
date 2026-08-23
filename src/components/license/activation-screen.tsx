"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Gift, KeyRound, Sparkles, ShieldCheck, Clock, MessageCircle } from "lucide-react";
import { WhatsAppButton } from "./whatsapp-button";
import { Branding } from "./branding";
import { LICENSE_CONFIG } from "@/lib/license/config";
import { startTrial, activateLicense } from "@/lib/license/client";
import { saveLicense } from "@/lib/license/storage";
import { setShopSupabaseConfig } from "@/lib/supabase-sync";
import { toast } from "sonner";

type Props = {
  systemId: string;
  systemInfo: unknown;
  onLicenseActivated: () => void;
};

export function ActivationScreen({ systemId, systemInfo, onLicenseActivated }: Props) {
  const [tab, setTab] = useState<"trial" | "key">("trial");
  const [licenseKey, setLicenseKey] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  // v2.10.20: Optional Supabase credentials for online portal
  const [shopSupabaseUrl, setShopSupabaseUrl] = useState("");
  const [shopSupabaseKey, setShopSupabaseKey] = useState("");
  const [showSupabaseFields, setShowSupabaseFields] = useState(false);
  const [loading, setLoading] = useState<"trial" | "activate" | null>(null);

  async function handleStartTrial() {
    setLoading("trial");
    try {
      const result = await startTrial({
        systemId,
        systemInfo,
        customerName,
        shopName,
        phone,
      });
      if (result.success && result.license) {
        saveLicense({
          licenseKey: result.license.licenseKey,
          customerName: result.license.customerName || customerName || "Trial User",
          shopName: result.license.shopName || shopName || "Trial Shop",
          licenseType: "trial",
          expiresAt: result.license.expiresAt,
          activatedAt: new Date().toISOString(),
          lastVerifiedAt: new Date().toISOString(),
          systemId,
        });
        toast.success(`3-day trial activated! Enjoy Pakistan POS.`);
        onLicenseActivated();
      } else {
        toast.error(result.message || "Failed to start trial");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(msg);
    } finally {
      setLoading(null);
    }
  }

  async function handleActivate() {
    if (!licenseKey.trim()) {
      toast.error("Please enter your license key");
      return;
    }
    setLoading("activate");
    try {
      const result = await activateLicense({
        licenseKey,
        systemId,
        systemInfo,
      });
      if (result.success && result.license) {
        saveLicense({
          licenseKey: result.license.licenseKey,
          customerName: result.license.customerName,
          shopName: result.license.shopName,
          licenseType: result.license.licenseType,
          expiresAt: result.license.expiresAt,
          activatedAt: new Date().toISOString(),
          lastVerifiedAt: new Date().toISOString(),
          systemId,
        });
        // v2.10.20: If shop Supabase credentials provided, save them for sync
        if (shopSupabaseUrl.trim() && shopSupabaseKey.trim()) {
          setShopSupabaseConfig(shopSupabaseUrl.trim(), shopSupabaseKey.trim());
          toast.success(`License activated! Online portal sync enabled.`);
        } else {
          toast.success(`License activated! Welcome, ${result.license.customerName}.`);
        }
        onLicenseActivated();
      } else {
        toast.error(result.message || "Activation failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(msg);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 flex flex-col">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-semibold text-sm">Pakistan POS</div>
              <div className="text-xs text-muted-foreground">v{LICENSE_CONFIG.appVersion}</div>
            </div>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            ID: {systemId}
          </Badge>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center space-y-2 mb-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Activate Pakistan POS</h1>
            <p className="text-sm text-muted-foreground">
              Start your free 3-day trial, or enter a license key if you already purchased one.
            </p>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "trial" | "key")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="trial">
                <Gift className="w-4 h-4 mr-2" /> Free Trial
              </TabsTrigger>
              <TabsTrigger value="key">
                <KeyRound className="w-4 h-4 mr-2" /> License Key
              </TabsTrigger>
            </TabsList>

            {/* Trial Tab */}
            <TabsContent value="trial">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-emerald-600" /> 3-Day Free Trial
                  </CardTitle>
                  <CardDescription>
                    Use full Pakistan POS features for 3 days. No payment required.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Your Name</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Muhammad Ali"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Shop Name</Label>
                    <Input
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      placeholder="Ali Grocery Store"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone (optional)</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="03001234567"
                    />
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-md flex items-start gap-2">
                    <Clock className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>
                      Trial activates immediately. After 3 days, you&apos;ll need a license key
                      to continue using Pakistan POS.
                    </span>
                  </div>
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={handleStartTrial}
                    disabled={loading !== null}
                  >
                    {loading === "trial" ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting Trial…
                      </>
                    ) : (
                      <>
                        <Gift className="w-4 h-4 mr-2" /> Start Free Trial
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* License Key Tab */}
            <TabsContent value="key">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-primary" /> Enter License Key
                  </CardTitle>
                  <CardDescription>
                    Have a license key? Enter it below to activate your permanent or
                    subscription license.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>License Key</Label>
                    <Input
                      value={licenseKey}
                      onChange={(e) => setLicenseKey(e.target.value)}
                      placeholder="PAKPOS-XXXXXXXX-XXXX"
                      className="font-mono"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleActivate();
                      }}
                    />
                  </div>
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs p-3 rounded-md">
                    <strong>Format:</strong> PAKPOS-XXXXXXXX-XXXX
                    <br />
                    Don&apos;t have a key? Use WhatsApp to purchase one.
                  </div>

                  {/* v2.10.20: Optional Online Portal Sync */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowSupabaseFields(!showSupabaseFields)}
                      className="w-full flex items-center justify-between p-2.5 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 text-xs transition-colors"
                    >
                      <span className="font-medium text-blue-700">🌐 Enable Online Portal Sync (Optional)</span>
                      <span className="text-blue-500">{showSupabaseFields ? "▲ Hide" : "▼ Show"}</span>
                    </button>
                    {showSupabaseFields && (
                      <div className="mt-2 p-3 rounded-lg border border-blue-200 bg-blue-50/30 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          If your software provider gave you Supabase credentials for online portal access,
                          enter them below. This enables real-time sync to your online dashboard.
                        </p>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Supabase URL</Label>
                          <Input
                            value={shopSupabaseUrl}
                            onChange={(e) => setShopSupabaseUrl(e.target.value)}
                            placeholder="https://your-project.supabase.co"
                            className="text-xs h-8"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Supabase Anon Key</Label>
                          <Input
                            value={shopSupabaseKey}
                            onChange={(e) => setShopSupabaseKey(e.target.value)}
                            placeholder="sb_publishable_xxxxxxxx"
                            className="text-xs h-8 font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <Button className="w-full" onClick={handleActivate} disabled={loading !== null}>
                    {loading === "activate" ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Activating…
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 mr-2" /> Activate License
                      </>
                    )}
                  </Button>
                  <div className="pt-2 border-t flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Need to buy a license?</span>
                    <WhatsAppButton context="new_license" size="sm" showLabel />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Always-visible WhatsApp CTA */}
          <div className="text-center pt-4">
            <WhatsAppButton
              context="general"
              variant="outline"
              size="sm"
              className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
            />
          </div>
        </div>
      </main>

      <Branding variant="footer" />
    </div>
  );
}
