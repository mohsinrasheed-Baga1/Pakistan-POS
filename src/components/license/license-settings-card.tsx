"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Gift,
  Crown,
  ShieldCheck,
  Clock,
  RefreshCw,
  Copy,
  Monitor,
  User,
  Store,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  ensureSystemId,
  getStoredLicense,
  getDaysRemaining,
  isExpired,
  saveLicense,
  type StoredLicense,
} from "@/lib/license/storage";
import { verifyLicense } from "@/lib/license/client";
import { LICENSE_CONFIG } from "@/lib/license/config";
import { WhatsAppButton } from "@/components/license/whatsapp-button";
import { getShopSupabaseConfig, setShopSupabaseConfig, hasSupabaseSync } from "@/lib/supabase-sync";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LicenseSettingsCard() {
  const [license, setLicense] = React.useState<StoredLicense | null>(null);
  const [systemId, setSystemId] = React.useState<string>("");
  const [systemInfo, setSystemInfo] = React.useState<unknown>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [lastChecked, setLastChecked] = React.useState<string | null>(null);
  // v2.10.22: Supabase credentials editing
  const [showSyncEdit, setShowSyncEdit] = React.useState(false);
  const [syncUrl, setSyncUrl] = React.useState("");
  const [syncKey, setSyncKey] = React.useState("");
  const [syncSaving, setSyncSaving] = React.useState(false);
  const [syncEnabled, setSyncEnabled] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const { systemId, systemInfo } = await ensureSystemId();
      setSystemId(systemId);
      setSystemInfo(systemInfo);
      setLicense(getStoredLicense());
      // v2.10.22: Load Supabase sync config
      const config = getShopSupabaseConfig();
      if (config) {
        setSyncUrl(config.url);
        setSyncKey(config.key);
        setSyncEnabled(true);
      }
    })();
  }, []);

  const daysRemaining = license ? getDaysRemaining(license) : 0;
  const expired = license ? isExpired(license) : false;
  const isTrial = license?.licenseType === "trial";
  const isPermanent = license?.licenseType === "permanent" && !license.expiresAt;
  const isExpiringSoon = !isPermanent && !expired && daysRemaining <= 3;

  async function handleVerifyNow() {
    if (!license) return;
    setVerifying(true);
    try {
      const result = await verifyLicense({
        licenseKey: license.licenseKey,
        systemId,
      });
      if (result.success && result.valid) {
        const updated: StoredLicense = {
          ...license,
          lastVerifiedAt: new Date().toISOString(),
          expiresAt: result.license?.expiresAt || license.expiresAt,
        };
        saveLicense(updated);
        setLicense(updated);
        setLastChecked(new Date().toISOString());
        toast.success("License verified successfully");
      } else {
        toast.error(result.message || "License verification failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setVerifying(false);
    }
  }

  function copyKey() {
    if (!license) return;
    navigator.clipboard.writeText(license.licenseKey);
    toast.success("License key copied to clipboard");
  }

  function copySystemId() {
    navigator.clipboard.writeText(systemId);
    toast.success("System ID copied to clipboard");
  }

  if (!license) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            No License Found
          </CardTitle>
          <CardDescription>
            Your license data is missing. Please restart the app to trigger
            the activation screen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Reload App
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          License Information
          {expired ? (
            <Badge variant="destructive">EXPIRED</Badge>
          ) : isExpiringSoon ? (
            <Badge variant="destructive">EXPIRING SOON</Badge>
          ) : isTrial ? (
            <Badge className="bg-emerald-600">TRIAL ACTIVE</Badge>
          ) : isPermanent ? (
            <Badge className="bg-amber-600">PERMANENT</Badge>
          ) : (
            <Badge className="bg-blue-600">SUBSCRIPTION</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Your Pakistan POS license details, status, and verification.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* License status banner */}
        {expired && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded-md flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <strong>Your license has expired.</strong> Please contact the
              developer to renew or purchase a new license.
            </div>
          </div>
        )}
        {isExpiringSoon && !expired && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-md flex items-start gap-2">
            <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <strong>Your license expires in {daysRemaining} {daysRemaining === 1 ? "day" : "days"}.</strong> Renew
              now to avoid interruption.
            </div>
          </div>
        )}

        {/* License details grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* License Key */}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs uppercase text-muted-foreground font-medium">
              License Key
            </label>
            <div className="flex gap-2 items-center">
              <code className="flex-1 font-mono text-sm bg-muted px-3 py-2 rounded-md">
                {license.licenseKey}
              </code>
              <Button size="sm" variant="outline" onClick={copyKey}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Type */}
          <InfoRow
            icon={
              isTrial ? <Gift className="w-4 h-4 text-emerald-600" />
              : isPermanent ? <Crown className="w-4 h-4 text-amber-600" />
              : <ShieldCheck className="w-4 h-4 text-blue-600" />
            }
            label="Type"
            value={
              isTrial ? "Free Trial (3 days)"
              : isPermanent ? "Permanent License"
              : "Subscription License"
            }
          />

          {/* Days remaining */}
          <InfoRow
            icon={<Clock className="w-4 h-4 text-muted-foreground" />}
            label="Days Remaining"
            value={isPermanent ? "Lifetime (no expiry)" : `${daysRemaining} days`}
            highlight={isExpiringSoon ? "text-amber-600 font-bold" : ""}
          />

          {/* Customer name */}
          <InfoRow
            icon={<User className="w-4 h-4 text-muted-foreground" />}
            label="Customer"
            value={license.customerName}
          />

          {/* Shop name */}
          <InfoRow
            icon={<Store className="w-4 h-4 text-muted-foreground" />}
            label="Shop"
            value={license.shopName}
          />

          {/* Activated date */}
          <InfoRow
            icon={<Calendar className="w-4 h-4 text-muted-foreground" />}
            label="Activated On"
            value={new Date(license.activatedAt).toLocaleDateString()}
          />

          {/* Expiry date — hide for permanent licenses (they have no expiry) */}
          {!isPermanent && (
            <InfoRow
              icon={<Calendar className="w-4 h-4 text-muted-foreground" />}
              label="Expires On"
              value={
                license.expiresAt
                  ? new Date(license.expiresAt).toLocaleDateString()
                  : "Never (permanent)"
              }
              highlight={isExpiringSoon ? "text-amber-600 font-bold" : ""}
            />
          )}
          {isPermanent && (
            <InfoRow
              icon={<Crown className="w-4 h-4 text-amber-600" />}
              label="License Status"
              value="Lifetime License — No Expiry"
              highlight="text-amber-700 font-bold"
            />
          )}

          {/* Last verified */}
          <InfoRow
            icon={<CheckCircle2 className="w-4 h-4 text-muted-foreground" />}
            label="Last Verified"
            value={new Date(license.lastVerifiedAt).toLocaleString()}
          />

          {/* System ID */}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs uppercase text-muted-foreground font-medium flex items-center gap-1">
              <Monitor className="w-3 h-3" />
              System ID (Machine Fingerprint)
            </label>
            <div className="flex gap-2 items-center">
              <code className="flex-1 font-mono text-xs bg-muted px-3 py-2 rounded-md">
                {systemId}
              </code>
              <Button size="sm" variant="outline" onClick={copySystemId}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This ID uniquely identifies your machine. Your license is bound to this system.
            </p>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleVerifyNow}
            disabled={verifying}
            className="flex-1"
          >
            {verifying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying…
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" /> Verify Now
              </>
            )}
          </Button>
          <WhatsAppButton
            context={expired || isExpiringSoon ? "license_expired" : "general"}
            variant="outline"
            className="flex-1 border-emerald-600 text-emerald-700 hover:bg-emerald-50"
          />
        </div>

        {lastChecked && (
          <p className="text-xs text-muted-foreground text-center">
            Last checked: {new Date(lastChecked).toLocaleTimeString()}
          </p>
        )}

        {/* v2.10.22: Online Portal Sync Settings */}
        <Separator />
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-medium flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              Online Portal Sync
            </h4>
            {syncEnabled ? (
              <Badge className="bg-emerald-600">ENABLED</Badge>
            ) : (
              <Badge variant="secondary">OFFLINE ONLY</Badge>
            )}
          </div>

          {syncEnabled && !showSyncEdit && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-sm space-y-1">
              <div><strong>Supabase URL:</strong> {syncUrl}</div>
              <div><strong>Key:</strong> <code className="text-xs">{syncKey.substring(0, 25)}...</code></div>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => setShowSyncEdit(true)}>
                Edit Sync Settings
              </Button>
            </div>
          )}

          {!syncEnabled && !showSyncEdit && (
            <div className="bg-muted/50 border border-dashed border-muted-foreground/30 rounded-md p-3 text-sm text-muted-foreground">
              Online sync is not configured. Your POS works offline only.
              <Button size="sm" variant="outline" className="mt-2 w-full border-emerald-300 text-emerald-700" onClick={() => setShowSyncEdit(true)}>
                Enable Online Sync
              </Button>
            </div>
          )}

          {showSyncEdit && (
            <div className="border-2 border-dashed border-emerald-300 rounded-lg p-4 space-y-3 bg-emerald-50/30">
              <div className="space-y-1.5">
                <Label className="text-xs">Supabase URL</Label>
                <Input
                  value={syncUrl}
                  onChange={(e) => setSyncUrl(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Supabase Anon Key</Label>
                <Input
                  value={syncKey}
                  onChange={(e) => setSyncKey(e.target.value)}
                  placeholder="sb_publishable_xxxxxxxx"
                  className="h-9 text-sm font-mono"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 flex-1"
                  disabled={syncSaving}
                  onClick={() => {
                    if (syncUrl.trim() && syncKey.trim()) {
                      setShopSupabaseConfig(syncUrl.trim(), syncKey.trim());
                      setSyncEnabled(true);
                      setShowSyncEdit(false);
                      toast.success("Online sync enabled!");
                    } else {
                      toast.error("Both fields are required");
                    }
                  }}
                >
                  {syncSaving ? "Saving…" : "Save & Enable Sync"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowSyncEdit(false)}>
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                These credentials connect your POS to the online portal. Get them from your software provider.
              </p>
            </div>
          )}
        </div>

        <Separator />

        {/* Developer info */}
        <div className="text-xs text-muted-foreground space-y-1">
          <div>
            <strong>Developer:</strong> {LICENSE_CONFIG.developer.name}
          </div>
          <div>
            <strong>Phone/WhatsApp:</strong>{" "}
            <a
              href={`tel:${LICENSE_CONFIG.developer.phone}`}
              className="text-primary hover:underline"
            >
              {LICENSE_CONFIG.developer.phone}
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({
  icon,
  label,
  value,
  highlight = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground uppercase font-medium">
          {label}
        </div>
        <div className={`truncate ${highlight}`}>{value}</div>
      </div>
    </div>
  );
}
