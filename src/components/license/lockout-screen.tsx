"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldX, AlertTriangle, RefreshCw, KeyRound } from "lucide-react";
import { WhatsAppButton } from "./whatsapp-button";
import { Branding } from "./branding";
import { useState } from "react";
import { activateLicense } from "@/lib/license/client";
import { saveLicense } from "@/lib/license/storage";
import { toast } from "sonner";

type Props = {
  /** Why the user is locked out. */
  reason: "revoked" | "expired" | "trial_expired" | "verification_failed";
  /** The system ID for re-activation. */
  systemId: string;
  systemInfo: unknown;
  /** Optional extra message from server. */
  message?: string;
  /** Old license key (for reference). */
  oldLicenseKey?: string;
  /** Called when a new license is successfully activated. */
  onReactivated: () => void;
};

const COPY: Record<
  Props["reason"],
  { title: string; description: string; icon: React.ReactNode; color: string }
> = {
  revoked: {
    title: "License Revoked",
    description:
      "This license has been revoked by the administrator. Please contact support to resolve this issue.",
    icon: <ShieldX className="w-12 h-12 text-red-600" />,
    color: "text-red-600",
  },
  expired: {
    title: "License Expired",
    description:
      "Your license has expired. Please purchase a new license key or renew your subscription to continue using Pakistan POS.",
    icon: <AlertTriangle className="w-12 h-12 text-amber-600" />,
    color: "text-amber-600",
  },
  trial_expired: {
    title: "Trial Period Ended",
    description:
      "Your 3-day free trial has ended. Purchase a license key to continue using Pakistan POS with all your data intact.",
    icon: <AlertTriangle className="w-12 h-12 text-amber-600" />,
    color: "text-amber-600",
  },
  verification_failed: {
    title: "License Verification Failed",
    description:
      "We couldn't verify your license. This might be a temporary network issue, or your license may have been revoked. Please try again or contact support.",
    icon: <AlertTriangle className="w-12 h-12 text-amber-600" />,
    color: "text-amber-600",
  },
};

export function LockoutScreen({
  reason,
  systemId,
  systemInfo,
  message,
  oldLicenseKey,
  onReactivated,
}: Props) {
  const copy = COPY[reason];
  const [showActivate, setShowActivate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleActivateNew() {
    if (!newKey.trim()) {
      toast.error("Please enter your new license key");
      return;
    }
    setLoading(true);
    try {
      const result = await activateLicense({
        licenseKey: newKey,
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
        toast.success(`License activated! Welcome back.`);
        onReactivated();
      } else {
        toast.error(result.message || "Activation failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-amber-50 flex flex-col">
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center space-y-3">
            <div className="mx-auto flex justify-center">{copy.icon}</div>
            <h1 className={`text-2xl font-bold ${copy.color}`}>{copy.title}</h1>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {copy.description}
            </p>
            {message && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3 rounded-md">
                {message}
              </div>
            )}
          </div>

          {/* System ID for reference */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              System ID:{" "}
              <code className="font-mono text-foreground bg-muted px-2 py-0.5 rounded">
                {systemId}
              </code>
            </p>
            {oldLicenseKey && (
              <p className="text-xs text-muted-foreground mt-1">
                Old license:{" "}
                <code className="font-mono text-muted-foreground">{oldLicenseKey}</code>
              </p>
            )}
          </div>

          {!showActivate ? (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <WhatsAppButton
                  context={reason === "trial_expired" ? "trial_expired" : "license_expired"}
                  size="lg"
                  className="w-full"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowActivate(true)}
                >
                  <KeyRound className="w-4 h-4 mr-2" /> I have a new license key
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Enter New License Key</CardTitle>
                <CardDescription>
                  If you&apos;ve purchased a new license, enter it below to re-activate.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>New License Key</Label>
                  <Input
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="PAKPOS-XXXXXXXX-XXXX"
                    className="font-mono"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleActivateNew();
                    }}
                  />
                </div>
                <Button className="w-full" onClick={handleActivateNew} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Activating…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" /> Activate New License
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowActivate(false)}
                >
                  ← Back to contact options
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="text-center pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.reload()}
              className="text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Try again
            </Button>
          </div>
        </div>
      </main>

      <Branding variant="footer" />
    </div>
  );
}
