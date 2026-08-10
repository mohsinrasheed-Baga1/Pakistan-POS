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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Store,
  Tag,
  Image as ImageIcon,
  Printer,
  Key,
  Shield,
  Database,
  Download,
  Upload,
  Trash2,
  ScanBarcode,
  Lock,
  Save,
  Loader2,
  Info,
  Receipt,
  Percent,
  FileText,
  Phone,
  MapPin,
  KeyRound,
  ShieldCheck,
  RefreshCw,
  X,
  Network,
  Wifi,
  Server,
  Monitor,
  Link2,
  Unlink,
  FolderOpen,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Cloud,
  DownloadCloud,
  ExternalLink,
  Package,
  CloudOff,
  List,
  Clock,
  Keyboard,
  HardDriveDownload,
  ChevronDown,
  ChevronUp,
  Barcode as BarcodeIcon,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BarcodeSettingsPage } from "@/components/settings/barcode-settings-page";
import { ReceiptSettingsPage } from "@/components/settings/receipt-settings-page";
import type { Settings } from "@/types";
import { useAppStore } from "@/stores/use-pos-store";

// ============================================================
// In-app auto-update (uses electron-updater IPC from main process)
// ============================================================
type SoftwareUpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
  downloadSize?: number;
}

interface BackupFile {
  name: string;
  size: number;
  mtime: string;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Resize/compress an image file to a base64 data URL using a canvas.
 * Used for the shop logo so we don't store huge base64 strings in the DB.
 */
function resizeImageToDataUrl(file: File, maxSize = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(canvas.toDataURL("image/jpeg", 0.9));
        }
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US");
  } catch {
    return iso;
  }
}

// ============================================================
// Main SettingsView
// ============================================================
export function SettingsView() {
  const [loading, setLoading] = React.useState(true);
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [activeSection, setActiveSection] = React.useState("shop");

  const reload = React.useCallback(async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
    } catch {
      toast.error("Could not load settings");
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    (async () => {
      await reload();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [reload]);

  /**
   * Save a partial settings patch. The full settings object is sent to the
   * API (which upserts) so other fields are preserved.
   */
  const savePartial = React.useCallback(
    async (partial: Partial<Settings>): Promise<Settings> => {
      if (!settings) throw new Error("Settings not loaded");
      const pick = <K extends keyof Settings>(key: K): Settings[K] =>
        partial[key] !== undefined
          ? (partial[key] as Settings[K])
          : settings[key];
      const body = {
        shopName: pick("shopName"),
        subName: pick("subName"),
        logo: pick("logo"),
        shopAddress: pick("shopAddress"),
        shopPhone: pick("shopPhone"),
        currency: pick("currency"),
        taxEnabled: pick("taxEnabled"),
        defaultTax: pick("defaultTax"),
        receiptFooter: pick("receiptFooter"),
        invoicePrefix: pick("invoicePrefix"),
        printerWidth: pick("printerWidth"),
        googleClientId: pick("googleClientId"),
        googleClientSecret: pick("googleClientSecret"),
        googleRefreshToken: pick("googleRefreshToken"),
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Save failed");
      }
      const data = await res.json();
      const s: Settings | undefined = data?.settings;
      if (s) setSettings(s);
      return s as Settings;
    },
    [settings]
  );

  if (loading || !settings) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto" dir="ltr">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto" dir="ltr">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm shrink-0">
          <Store className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Shop Settings</h1>
          <p className="text-sm text-muted-foreground">
            Click a button below to open that section
          </p>
        </div>
      </div>

      {/* Settings menu grid — each button opens a section */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {[
          { id: "shop", label: "Shop Details", icon: Store, color: "emerald" },
          { id: "subname", label: "Sub-Name", icon: Tag, color: "emerald" },
          { id: "logo", label: "Logo", icon: ImageIcon, color: "emerald" },
          { id: "printer", label: "Printer", icon: Printer, color: "emerald" },
          { id: "password", label: "Change Password", icon: KeyRound, color: "amber" },
          { id: "backuppw", label: "Backup Password", icon: ShieldCheck, color: "amber" },
          { id: "backup", label: "Backup & Restore", icon: Database, color: "emerald" },
          { id: "sharing", label: "Multi-PC Sharing", icon: Network, color: "emerald" },
          { id: "updates", label: "Check Updates", icon: DownloadCloud, color: "emerald" },
          { id: "gdrive", label: "Google Drive", icon: Cloud, color: "emerald" },
          { id: "migration", label: "Data Migration", icon: HardDriveDownload, color: "emerald" },
          { id: "shortcuts", label: "Shortcuts", icon: Keyboard, color: "emerald" },
          { id: "scanner", label: "Barcode Scanner", icon: ScanBarcode, color: "emerald" },
          { id: "barcode", label: "Barcode & Sticker", icon: BarcodeIcon, color: "emerald" },
          { id: "receipt", label: "Receipt Settings", icon: Receipt, color: "emerald" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                activeSection === item.id
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-border hover:border-emerald-300 bg-card"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                activeSection === item.id ? "bg-emerald-600" : "bg-emerald-100"
              }`}>
                <Icon className={`w-5 h-5 ${activeSection === item.id ? "text-white" : "text-emerald-600"}`} />
              </div>
              <span className="text-xs font-medium text-center">{item.label}</span>
            </button>
          );
        })}
      </div>

      <Separator />

      {/* Active section content */}
      {activeSection === "shop" && <ShopDetailsCard settings={settings} onSave={savePartial} />}
      {activeSection === "subname" && <SubNameCard settings={settings} onSave={savePartial} />}
      {activeSection === "logo" && <LogoCard settings={settings} onSave={savePartial} />}
      {activeSection === "printer" && <PrinterSettingsCard settings={settings} onSave={savePartial} />}
      {activeSection === "password" && <ChangePasswordCard />}
      {activeSection === "backuppw" && <BackupPasswordCard settings={settings} onSaved={reload} />}
      {activeSection === "backup" && <BackupRestoreCard />}
      {activeSection === "sharing" && <MultiComputerSharingCard settings={settings} onSaved={reload} />}
      {activeSection === "updates" && <SoftwareUpdatesCard />}
      {activeSection === "gdrive" && <CloudBackupCard />}
      {activeSection === "migration" && <DataMigrationCard />}
      {activeSection === "shortcuts" && <ShortcutsCard />}
      {activeSection === "scanner" && <ScannerCard />}
      {activeSection === "barcode" && <BarcodeSettingsPage />}
      {activeSection === "receipt" && <ReceiptSettingsPage />}
    </div>
  );
}

// ============================================================
// 1. Shop Details card
// ============================================================
interface ShopDetailsCardProps {
  settings: Settings;
  onSave: (partial: Partial<Settings>) => Promise<Settings>;
}

function ShopDetailsCard({ settings, onSave }: ShopDetailsCardProps) {
  const [form, setForm] = React.useState({
    shopName: settings.shopName ?? "",
    shopAddress: settings.shopAddress ?? "",
    shopPhone: settings.shopPhone ?? "",
    currency: settings.currency || "Rs",
    taxEnabled: !!settings.taxEnabled,
    defaultTax:
      typeof settings.defaultTax === "number" && !isNaN(settings.defaultTax)
        ? settings.defaultTax
        : 0,
    receiptFooter: settings.receiptFooter ?? "",
    invoicePrefix: settings.invoicePrefix || "INV",
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setForm({
      shopName: settings.shopName ?? "",
      shopAddress: settings.shopAddress ?? "",
      shopPhone: settings.shopPhone ?? "",
      currency: settings.currency || "Rs",
      taxEnabled: !!settings.taxEnabled,
      defaultTax:
        typeof settings.defaultTax === "number" && !isNaN(settings.defaultTax)
          ? settings.defaultTax
          : 0,
      receiptFooter: settings.receiptFooter ?? "",
      invoicePrefix: settings.invoicePrefix || "INV",
    });
  }, [settings]);

  function setField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        shopName: form.shopName.trim() || "My Shop",
        shopAddress: form.shopAddress.trim(),
        shopPhone: form.shopPhone.trim(),
        currency: form.currency.trim() || "Rs",
        taxEnabled: form.taxEnabled,
        defaultTax: form.taxEnabled ? Number(form.defaultTax) || 0 : 0,
        receiptFooter: form.receiptFooter.trim(),
        invoicePrefix: form.invoicePrefix.trim() || "INV",
      });
      toast.success("Shop details saved");
    } catch (err: any) {
      toast.error(err?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Store className="w-5 h-5 text-emerald-600" />
          Shop Details
        </CardTitle>
        <CardDescription>
          Shop name, address, phone, currency, tax and receipt settings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="shopName" className="flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-emerald-600" />
                Shop Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="shopName"
                value={form.shopName}
                onChange={(e) => setField("shopName", e.target.value)}
                placeholder="e.g. Noor General Store"
                required
                className="h-11"
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="shopAddress" className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                Address
              </Label>
              <Textarea
                id="shopAddress"
                value={form.shopAddress}
                onChange={(e) => setField("shopAddress", e.target.value)}
                placeholder="Full shop address"
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shopPhone" className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                Phone Number
              </Label>
              <Input
                id="shopPhone"
                value={form.shopPhone}
                onChange={(e) => setField("shopPhone", e.target.value)}
                placeholder="e.g. 0300-1234567"
                dir="ltr"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency" className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-emerald-600" />
                Currency
              </Label>
              <Input
                id="currency"
                value={form.currency}
                onChange={(e) => setField("currency", e.target.value)}
                placeholder="Rs"
                dir="ltr"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                This symbol is shown with all amounts (e.g. Rs, $, &euro;)
              </p>
            </div>
          </div>

          <Separator />

          {/* Tax settings */}
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/10 p-3">
              <div className="space-y-0.5">
                <Label
                  htmlFor="taxEnabled"
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <Percent className="w-3.5 h-3.5 text-emerald-600" />
                  Enable Tax
                </Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, default tax is applied to sales
                </p>
              </div>
              <Switch
                id="taxEnabled"
                checked={form.taxEnabled}
                onCheckedChange={(v) => setField("taxEnabled", v)}
              />
            </div>

            {form.taxEnabled && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label
                    htmlFor="defaultTax"
                    className="flex items-center gap-1.5"
                  >
                    <Percent className="w-3.5 h-3.5 text-emerald-600" />
                    Default Tax %
                  </Label>
                  <Input
                    id="defaultTax"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.defaultTax}
                    onChange={(e) =>
                      setField("defaultTax", Number(e.target.value))
                    }
                    placeholder="0"
                    dir="ltr"
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    Percentage between 0 and 100 (e.g. 5 means 5%)
                  </p>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Receipt & invoice settings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-2 lg:col-span-2">
              <Label
                htmlFor="receiptFooter"
                className="flex items-center gap-1.5"
              >
                <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                Receipt Footer Text
              </Label>
              <Textarea
                id="receiptFooter"
                value={form.receiptFooter}
                onChange={(e) => setField("receiptFooter", e.target.value)}
                placeholder="e.g. Thank you! Please come again."
                rows={2}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                This text is printed at the bottom of every receipt
              </p>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="invoicePrefix"
                className="flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                Invoice Prefix
              </Label>
              <Input
                id="invoicePrefix"
                value={form.invoicePrefix}
                onChange={(e) => setField("invoicePrefix", e.target.value)}
                placeholder="INV"
                dir="ltr"
                className="h-11 uppercase"
              />
              <p className="text-xs text-muted-foreground">
                This prefix is used at the start of every invoice number (e.g.
                INV-0001)
              </p>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={saving}
              className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white min-w-[180px]"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Shop Details
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 2. Sub-Name card
// ============================================================
interface SubNameCardProps {
  settings: Settings;
  onSave: (partial: Partial<Settings>) => Promise<Settings>;
}

function SubNameCard({ settings, onSave }: SubNameCardProps) {
  const [subName, setSubName] = React.useState(settings.subName ?? "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setSubName(settings.subName ?? "");
  }, [settings]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave({ subName: subName.trim() });
      toast.success("Sub-name saved");
    } catch (err: any) {
      toast.error(err?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Tag className="w-5 h-5 text-emerald-600" />
          Sub-Name
        </CardTitle>
        <CardDescription>
          Tagline/brand name shown on shop cards and receipts (e.g. &quot;Master
          Abdul Rasheed &amp; Sons&quot;)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subName" className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-emerald-600" />
              Sub-Name / Tagline
            </Label>
            <Input
              id="subName"
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              placeholder="e.g. Master Abdul Rasheed & Sons"
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to hide. Shown under the shop name on receipts and
              shop cards.
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving}
              className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px]"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Sub-Name
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 3. Logo card
// ============================================================
interface LogoCardProps {
  settings: Settings;
  onSave: (partial: Partial<Settings>) => Promise<Settings>;
}

function LogoCard({ settings, onSave }: LogoCardProps) {
  const [logo, setLogo] = React.useState<string | null>(settings.logo ?? null);
  // Staged new logo from a selected file (not yet saved)
  const [pendingLogo, setPendingLogo] = React.useState<string | null>(null);
  // True when user clicked "Remove Logo" (will save null)
  const [pendingRemoved, setPendingRemoved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setLogo(settings.logo ?? null);
    setPendingLogo(null);
    setPendingRemoved(false);
  }, [settings]);

  const preview = pendingLogo ?? (pendingRemoved ? null : logo);
  const dirty = pendingLogo !== null || pendingRemoved;

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    setProcessing(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 200);
      setPendingLogo(dataUrl);
      setPendingRemoved(false);
      toast.success("Image ready — click Save Logo to apply");
    } catch (err: any) {
      toast.error(err?.message || "Could not process image");
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !dirty) return;
    setSaving(true);
    try {
      let nextLogo: string | null;
      if (pendingLogo) nextLogo = pendingLogo;
      else if (pendingRemoved) nextLogo = null;
      else nextLogo = logo;
      await onSave({ logo: nextLogo });
      setPendingLogo(null);
      setPendingRemoved(false);
      toast.success("Logo saved");
    } catch (err: any) {
      toast.error(err?.message || "Could not save logo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-emerald-600" />
          Logo
        </CardTitle>
        <CardDescription>
          Upload your shop logo. It appears on receipts, shop cards, and
          barcodes. Image is automatically resized to 200×200 px.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-32 h-32 rounded-xl border-2 border-dashed border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/10 flex items-center justify-center overflow-hidden shrink-0">
              {preview ? (
                <img
                  src={preview}
                  alt="Logo preview"
                  className="w-full h-full object-contain"
                />
              ) : (
                <ImageIcon className="w-10 h-10 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex-1 space-y-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onFileChange}
                className="hidden"
                id="logo-upload"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => fileRef.current?.click()}
                  disabled={processing || saving}
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Choose Image
                    </>
                  )}
                </Button>
                {pendingLogo && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10"
                    onClick={() => setPendingLogo(null)}
                    disabled={saving}
                  >
                    <X className="w-4 h-4" />
                    Discard
                  </Button>
                )}
                {logo && !pendingLogo && !pendingRemoved && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setPendingRemoved(true)}
                    disabled={saving}
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove Logo
                  </Button>
                )}
                {pendingRemoved && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10"
                    onClick={() => setPendingRemoved(false)}
                    disabled={saving}
                  >
                    Undo Remove
                  </Button>
                )}
              </div>
              {pendingRemoved && (
                <p className="text-xs text-red-600">
                  Logo will be removed when you click Save Logo.
                </p>
              )}
              {pendingLogo && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  New logo staged. Click Save Logo to apply.
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={saving || !dirty}
              className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px]"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Logo
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 4. Printer Settings card
// ============================================================
interface PrinterSettingsCardProps {
  settings: Settings;
  onSave: (partial: Partial<Settings>) => Promise<Settings>;
}

function PrinterSettingsCard({ settings, onSave }: PrinterSettingsCardProps) {
  const [width, setWidth] = React.useState<number>(
    settings.printerWidth === 80 ? 80 : 58
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setWidth(settings.printerWidth === 80 ? 80 : 58);
  }, [settings]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave({ printerWidth: width });
      toast.success("Printer settings saved");
    } catch (err: any) {
      toast.error(err?.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Printer className="w-5 h-5 text-emerald-600" />
          Printer Settings
        </CardTitle>
        <CardDescription>
          Choose the thermal receipt paper width used by your printer
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <button
              type="button"
              onClick={() => setWidth(58)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 transition-colors ${
                width === 58
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                  : "border-border hover:border-emerald-300 hover:bg-emerald-50/30"
              }`}
            >
              <Printer className="w-7 h-7" />
              <span className="font-bold text-lg">58mm</span>
              <span className="text-xs text-muted-foreground">
                Small receipt
              </span>
            </button>
            <button
              type="button"
              onClick={() => setWidth(80)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 transition-colors ${
                width === 80
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                  : "border-border hover:border-emerald-300 hover:bg-emerald-50/30"
              }`}
            >
              <Printer className="w-7 h-7" />
              <span className="font-bold text-lg">80mm</span>
              <span className="text-xs text-muted-foreground">
                Wide receipt
              </span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Current: {width}mm thermal paper. This affects receipt layout
            width.
          </p>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving}
              className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white min-w-[200px]"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Printer Settings
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 5. Change Password card
// ============================================================
function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Security question management
  const [secQuestion, setSecQuestion] = React.useState("");
  const [secAnswer, setSecAnswer] = React.useState("");
  const [secSaving, setSecSaving] = React.useState(false);
  const [secLoading, setSecLoading] = React.useState(true);
  const [secCurrentQ, setSecCurrentQ] = React.useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/users/me/security-question");
        if (res.ok) {
          const data = await res.json();
          if (data.question) setSecCurrentQ(data.question);
          if (data.question) setSecQuestion(data.question);
        }
      } catch {}
      setSecLoading(false);
    })();
  }, []);

  const newPasswordError =
    newPassword.length > 0 && newPassword.length < 6
      ? "Password must be at least 6 characters"
      : "";
  const confirmError =
    confirmPassword.length > 0 && newPassword !== confirmPassword
      ? "Passwords do not match"
      : "";

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 6 &&
    confirmPassword === newPassword &&
    !saving;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Change failed");
      }
      toast.success("Password changed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err?.message || "Could not change password");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveSecurityQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!secQuestion || !secAnswer) {
      toast.error("Please fill both question and answer");
      return;
    }
    setSecSaving(true);
    try {
      const res = await fetch("/api/users/me/security-question", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ securityQuestion: secQuestion, securityAnswer: secAnswer }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Save failed");
      }
      toast.success("Security question saved! You can now reset your password from the login page.");
      setSecCurrentQ(secQuestion);
      setSecAnswer("");
    } catch (err: any) {
      toast.error(err?.message || "Could not save security question");
    } finally {
      setSecSaving(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Key className="w-5 h-5 text-emerald-600" />
          Change Password
        </CardTitle>
        <CardDescription>Change your account login password</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Change Password Form */}
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="curPwd" className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                Current Password
              </Label>
              <Input
                id="curPwd"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                dir="ltr"
                className="h-11"
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPwd" className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-emerald-600" />
                New Password
              </Label>
              <Input
                id="newPwd"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 chars"
                dir="ltr"
                className="h-11"
                autoComplete="new-password"
              />
              {newPasswordError && (
                <p className="text-xs text-red-600">{newPasswordError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confPwd" className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-emerald-600" />
                Confirm Password
              </Label>
              <Input
                id="confPwd"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
                dir="ltr"
                className="h-11"
                autoComplete="new-password"
              />
              {confirmError && (
                <p className="text-xs text-red-600">{confirmError}</p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!canSubmit}
              className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white min-w-[180px]"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Changing...
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  Change Password
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Separator */}
        <Separator />

        {/* Security Question Management */}
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-amber-600" />
            Security Question
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Set a security question to enable password reset from the login page if you forget your password.
            {secCurrentQ && (
              <span className="block mt-1 text-emerald-600 font-medium">
                Current question: &quot;{secCurrentQ}&quot;
              </span>
            )}
          </p>
          {secLoading ? (
            <Skeleton className="h-20 w-full rounded-lg" />
          ) : (
            <form onSubmit={onSaveSecurityQuestion} className="space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Security Question</Label>
                  <select
                    value={secQuestion}
                    onChange={(e) => setSecQuestion(e.target.value)}
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    dir="ltr"
                    required
                  >
                    <option value="">-- Select a question --</option>
                    {SECURITY_QUESTIONS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Your Answer</Label>
                  <Input
                    type="text"
                    value={secAnswer}
                    onChange={(e) => setSecAnswer(e.target.value)}
                    placeholder="Enter your answer"
                    dir="ltr"
                    className="h-11"
                    required
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="submit"
                    disabled={secSaving || !secQuestion || !secAnswer}
                    className="h-11 w-full bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {secSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        Save Security Question
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const SECURITY_QUESTIONS = [
  "What is your shop name?",
  "What is your pet's name?",
  "What city were you born in?",
  "What is your favorite color?",
  "What was your first school's name?",
  "What is your mother's name?",
  "What is your father's name?",
  "What is your favorite food?",
];

// ============================================================
// 6. Backup Password card
// ============================================================
interface BackupPasswordCardProps {
  settings: Settings;
  onSaved: () => Promise<void>;
}

function BackupPasswordCard({ settings, onSaved }: BackupPasswordCardProps) {
  const isSet = !!settings.backupPasswordHash;
  const [mode, setMode] = React.useState<"idle" | "set" | "update" | "generated">(
    "idle"
  );
  const [newPassword, setNewPassword] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [generated, setGenerated] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);

  // Reset (forgot-password) dialog state — uses admin login password.
  const [resetOpen, setResetOpen] = React.useState(false);
  const [resetLogin, setResetLogin] = React.useState("");
  const [resetNew, setResetNew] = React.useState("");
  const [resetConfirm, setResetConfirm] = React.useState("");
  const [resetting, setResetting] = React.useState(false);

  const resetNewError =
    resetNew.length > 0 && resetNew.length < 4
      ? "Password must be at least 4 characters"
      : "";
  const resetConfirmError =
    resetConfirm.length > 0 && resetNew !== resetConfirm
      ? "Passwords do not match"
      : "";
  const canReset =
    resetLogin.length > 0 &&
    resetNew.length >= 4 &&
    resetNew === resetConfirm &&
    !resetting;

  const newPasswordError =
    newPassword.length > 0 && newPassword.length < 4
      ? "Password must be at least 4 characters"
      : "";

  async function onSet(e: React.FormEvent) {
    e.preventDefault();
    if (saving || newPassword.length < 4) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/backup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", password: newPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed");
      }
      toast.success("Backup password set");
      setNewPassword("");
      setMode("idle");
      await onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Could not set password");
    } finally {
      setSaving(false);
    }
  }

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (saving || newPassword.length < 4) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/backup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          currentPassword,
          password: newPassword,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed");
      }
      toast.success("Backup password updated");
      setNewPassword("");
      setCurrentPassword("");
      setMode("idle");
      await onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Could not update password");
    } finally {
      setSaving(false);
    }
  }

  async function onGenerate() {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/settings/backup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed");
      }
      const data = await res.json();
      setGenerated(data.generated);
      setMode("generated");
      toast.success("Password generated");
      await onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Could not generate password");
    } finally {
      setGenerating(false);
    }
  }

  function copyGenerated() {
    if (!generated) return;
    navigator.clipboard
      .writeText(generated)
      .then(() => toast.success("Copied to clipboard"))
      .catch(() => toast.error("Copy failed"));
  }

  // Reset the backup password using the admin login password as auth.
  // Calls POST /api/settings/backup-password with action: "reset".
  async function onReset() {
    if (resetting || !canReset) return;
    setResetting(true);
    try {
      const res = await fetch("/api/settings/backup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          loginPassword: resetLogin,
          newPassword: resetNew,
          confirmPassword: resetConfirm,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Reset failed");
      }
      toast.success("Backup password reset successfully");
      setResetLogin("");
      setResetNew("");
      setResetConfirm("");
      setResetOpen(false);
      setMode("idle");
      await onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Could not reset password");
    } finally {
      setResetting(false);
    }
  }

  function closeResetDialog(open: boolean) {
    if (!open && !resetting) {
      setResetOpen(false);
      setResetLogin("");
      setResetNew("");
      setResetConfirm("");
    } else if (open) {
      setResetOpen(true);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600" />
              Backup Password
            </CardTitle>
            <CardDescription>
              This password protects backup/restore and data removal operations.
            </CardDescription>
          </div>
          {isSet ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              <ShieldCheck className="w-3 h-3" />
              Set
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-700 border-amber-300">
              Not Set
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Generated password alert */}
        {mode === "generated" && generated && (
          <Alert className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
            <KeyRound className="w-4 h-4 text-emerald-700" />
            <AlertTitle className="text-emerald-800 dark:text-emerald-300">
              Generated Backup Password
            </AlertTitle>
            <AlertDescription>
              <div className="flex items-center gap-2 mt-1">
                <code className="font-mono font-bold text-base tracking-wider bg-background px-2 py-1 rounded border">
                  {generated}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={copyGenerated}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs mt-2">
                Save this password somewhere safe. You will need it for backup,
                restore, and remove-data operations.
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 mt-2"
                onClick={() => setMode("idle")}
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* If not set: show set + generate options */}
        {!isSet && mode !== "generated" && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={mode === "set" ? "default" : "outline"}
                className={
                  mode === "set"
                    ? "h-10 bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "h-10 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                }
                onClick={() => setMode(mode === "set" ? "idle" : "set")}
              >
                <Key className="w-4 h-4" />
                Set Backup Password
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={onGenerate}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Generate Password
              </Button>
            </div>
            {mode === "set" && (
              <form onSubmit={onSet} className="space-y-3 pt-2 border-t">
                <div className="space-y-2">
                  <Label htmlFor="bpNew" className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-600" />
                    New Backup Password
                  </Label>
                  <Input
                    id="bpNew"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 4 characters"
                    dir="ltr"
                    className="h-11"
                    autoComplete="new-password"
                  />
                  {newPasswordError && (
                    <p className="text-xs text-red-600">{newPasswordError}</p>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={saving || newPassword.length < 4}
                    className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Set Password
                  </Button>
                </div>
              </form>
            )}
          </>
        )}

        {/* If set: show update option */}
        {isSet && mode === "idle" && (
          <>
            <p className="text-sm text-muted-foreground">
              A backup password is currently set. You can change it below —
              you&apos;ll need to provide the current one.
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-10 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              onClick={() => setMode("update")}
            >
              <Key className="w-4 h-4" />
              Change Backup Password
            </Button>
          </>
        )}

        {isSet && mode === "update" && (
          <form onSubmit={onUpdate} className="space-y-3 pt-2 border-t">
            <div className="space-y-2">
              <Label htmlFor="bpCur" className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                Current Backup Password
              </Label>
              <Input
                id="bpCur"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current backup password"
                dir="ltr"
                className="h-11"
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bpNewUpd" className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-emerald-600" />
                New Backup Password
              </Label>
              <Input
                id="bpNewUpd"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 4 characters"
                dir="ltr"
                className="h-11"
                autoComplete="new-password"
              />
              {newPasswordError && (
                <p className="text-xs text-red-600">{newPasswordError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-10"
                onClick={() => {
                  setMode("idle");
                  setNewPassword("");
                  setCurrentPassword("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || newPassword.length < 4}
                className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Update Password
              </Button>
            </div>
          </form>
        )}

        {/* Forgot backup password — reset using admin login password */}
        <Separator />
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 p-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Forgot your backup password?
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                You can reset it using your admin login password. This is useful
                if you have forgotten the current backup password and need to
                regain access to backup/restore operations.
              </p>
            </div>
          </div>
          <Dialog open={resetOpen} onOpenChange={closeResetDialog}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
              >
                <RefreshCw className="w-4 h-4" />
                Reset Backup Password
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset Backup Password</DialogTitle>
                <DialogDescription>
                  Enter your admin login password to verify your identity, then
                  set a new backup password. The login password is never stored
                  — it is only used to verify that you are the admin.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label
                    htmlFor="resetLogin"
                    className="flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5 text-emerald-600" />
                    Login Password
                  </Label>
                  <Input
                    id="resetLogin"
                    type="password"
                    value={resetLogin}
                    onChange={(e) => setResetLogin(e.target.value)}
                    placeholder="Enter your admin login password"
                    dir="ltr"
                    className="h-11"
                    autoComplete="current-password"
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label
                    htmlFor="resetNew"
                    className="flex items-center gap-1.5"
                  >
                    <Key className="w-3.5 h-3.5 text-emerald-600" />
                    New Backup Password
                  </Label>
                  <Input
                    id="resetNew"
                    type="password"
                    value={resetNew}
                    onChange={(e) => setResetNew(e.target.value)}
                    placeholder="At least 4 characters"
                    dir="ltr"
                    className="h-11"
                    autoComplete="new-password"
                  />
                  {resetNewError && (
                    <p className="text-xs text-red-600">{resetNewError}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="resetConfirm"
                    className="flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Confirm New Backup Password
                  </Label>
                  <Input
                    id="resetConfirm"
                    type="password"
                    value={resetConfirm}
                    onChange={(e) => setResetConfirm(e.target.value)}
                    placeholder="Re-type new backup password"
                    dir="ltr"
                    className="h-11"
                    autoComplete="new-password"
                  />
                  {resetConfirmError && (
                    <p className="text-xs text-red-600">{resetConfirmError}</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => closeResetDialog(false)}
                  disabled={resetting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={onReset}
                  disabled={!canReset}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {resetting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Reset Password
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 7. Backup & Restore card
// ============================================================
function BackupRestoreCard() {
  const [backups, setBackups] = React.useState<BackupFile[]>([]);
  const [loadingList, setLoadingList] = React.useState(true);
  const [creating, setCreating] = React.useState(false);

  // Remove Data dialog state
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [removePwd, setRemovePwd] = React.useState("");
  const [removing, setRemoving] = React.useState(false);

  // Restore Data dialog state
  const [restoreOpen, setRestoreOpen] = React.useState(false);
  const [restoreBackup, setRestoreBackup] = React.useState<string>("");
  const [restorePwd, setRestorePwd] = React.useState("");
  const [restoring, setRestoring] = React.useState(false);

  // Per-row Restore dialog state (data recovery)
  const [rowRestore, setRowRestore] = React.useState<BackupFile | null>(null);
  const [rowRestorePwd, setRowRestorePwd] = React.useState("");
  const [rowRestoring, setRowRestoring] = React.useState(false);

  const loadBackups = React.useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/backup", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setBackups(data.backups || []);
    } catch {
      toast.error("Could not load backups");
    } finally {
      setLoadingList(false);
    }
  }, []);

  React.useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  async function onCreate() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed");
      }
      const data = await res.json();
      toast.success(`Backup created: ${data.backup?.name || "OK"}`);
      await loadBackups();
    } catch (err: any) {
      toast.error(err?.message || "Could not create backup");
    } finally {
      setCreating(false);
    }
  }

  async function onRemoveData(e: React.MouseEvent) {
    // Prevent AlertDialog from auto-closing; we close manually on success.
    e.preventDefault();
    if (removing) return;
    if (!removePwd) {
      toast.error("Enter your backup password");
      return;
    }
    setRemoving(true);
    try {
      const res = await fetch("/api/backup/remove-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: removePwd }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed");
      }
      toast.success(
        "Transactional data removed. Products and cards preserved."
      );
      setRemoveOpen(false);
      setRemovePwd("");
    } catch (err: any) {
      toast.error(err?.message || "Could not remove data");
    } finally {
      setRemoving(false);
    }
  }

  async function callRestore(backupName: string, pwd: string) {
    const res = await fetch("/api/backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd, backupName }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || "Restore failed");
    }
    return res.json();
  }

  async function onRestoreData() {
    if (restoring) return;
    if (!restoreBackup) {
      toast.error("Select a backup");
      return;
    }
    if (!restorePwd) {
      toast.error("Enter your backup password");
      return;
    }
    setRestoring(true);
    try {
      await callRestore(restoreBackup, restorePwd);
      toast.success("Database restored. Please restart the app.");
      setRestoreOpen(false);
      setRestoreBackup("");
      setRestorePwd("");
    } catch (err: any) {
      toast.error(err?.message || "Could not restore");
    } finally {
      setRestoring(false);
    }
  }

  async function onRowRestore() {
    if (rowRestoring || !rowRestore) return;
    if (!rowRestorePwd) {
      toast.error("Enter your backup password");
      return;
    }
    setRowRestoring(true);
    try {
      await callRestore(rowRestore.name, rowRestorePwd);
      toast.success("Database restored. Please restart the app.");
      setRowRestore(null);
      setRowRestorePwd("");
    } catch (err: any) {
      toast.error(err?.message || "Could not restore");
    } finally {
      setRowRestoring(false);
    }
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-600" />
          Backup &amp; Restore
        </CardTitle>
        <CardDescription>
          Create database backups, restore from a previous backup, or remove
          transactional data. All operations require the backup password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={onCreate}
            disabled={creating}
            className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Create Backup Now
          </Button>

          {/* Restore Data dialog */}
          <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                disabled={backups.length === 0}
              >
                <Upload className="w-4 h-4" />
                Restore Data
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Restore Database</DialogTitle>
                <DialogDescription>
                  Select a backup to restore. The current database will be
                  replaced. A safety backup of the current DB is created
                  automatically before restore.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label
                    htmlFor="restoreSelect"
                    className="flex items-center gap-1.5"
                  >
                    <Database className="w-3.5 h-3.5 text-emerald-600" />
                    Backup File
                  </Label>
                  <select
                    id="restoreSelect"
                    value={restoreBackup}
                    onChange={(e) => setRestoreBackup(e.target.value)}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">— Select a backup —</option>
                    {backups.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name} ({formatBytes(b.size)}, {formatDate(b.mtime)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="restorePwd"
                    className="flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5 text-emerald-600" />
                    Backup Password
                  </Label>
                  <Input
                    id="restorePwd"
                    type="password"
                    value={restorePwd}
                    onChange={(e) => setRestorePwd(e.target.value)}
                    placeholder="Enter backup password"
                    dir="ltr"
                    className="h-11"
                    autoComplete="off"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRestoreOpen(false)}
                  disabled={restoring}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={onRestoreData}
                  disabled={restoring || !restoreBackup || !restorePwd}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {restoring ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  Restore
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Remove Data alert dialog */}
          <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10 text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
                Remove Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-red-700">
                  Remove all transactional data?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will DELETE all sales, transactions, and reports.
                  Products and customer cards will be KEPT. This action cannot
                  be undone. Enter your backup password to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label htmlFor="rmPwd" className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-red-600" />
                  Backup Password
                </Label>
                <Input
                  id="rmPwd"
                  type="password"
                  value={removePwd}
                  onChange={(e) => setRemovePwd(e.target.value)}
                  placeholder="Enter backup password"
                  dir="ltr"
                  className="h-11"
                  autoComplete="off"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={removing}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={onRemoveData}
                  disabled={removing || !removePwd}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {removing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Remove Data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Separator />

        {/* Backups list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              Existing Backups
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={loadBackups}
              disabled={loadingList}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loadingList ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
          {loadingList ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground rounded-lg border border-dashed">
              <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No backups yet. Click &quot;Create Backup Now&quot; to make one.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border divide-y">
              {backups.map((b) => (
                <div
                  key={b.name}
                  className="flex items-center gap-3 p-3 hover:bg-muted/40"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                    <Database className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate font-mono">
                      {b.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(b.size)} • {formatDate(b.mtime)}
                    </div>
                  </div>
                  {/* Per-row Restore — data recovery */}
                  <Dialog
                    open={rowRestore?.name === b.name}
                    onOpenChange={(open) => {
                      if (!open) {
                        setRowRestore(null);
                        setRowRestorePwd("");
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        onClick={() => {
                          setRowRestore(b);
                          setRowRestorePwd("");
                        }}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Restore
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Restore from {b.name}?</DialogTitle>
                        <DialogDescription>
                          The current database will be replaced with this
                          backup. A safety backup of the current DB is created
                          automatically before restore. Enter your backup
                          password to confirm.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-2">
                        <Label
                          htmlFor="rowRestorePwd"
                          className="flex items-center gap-1.5"
                        >
                          <Lock className="w-3.5 h-3.5 text-emerald-600" />
                          Backup Password
                        </Label>
                        <Input
                          id="rowRestorePwd"
                          type="password"
                          value={rowRestorePwd}
                          onChange={(e) => setRowRestorePwd(e.target.value)}
                          placeholder="Enter backup password"
                          dir="ltr"
                          className="h-11"
                          autoComplete="off"
                        />
                      </div>
                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setRowRestore(null);
                            setRowRestorePwd("");
                          }}
                          disabled={rowRestoring}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          onClick={onRowRestore}
                          disabled={rowRestoring || !rowRestorePwd}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          {rowRestoring ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          Restore
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 9. Barcode Scanner card
// ============================================================
function ScannerCard() {
  const setView = useAppStore((s) => s.setView);
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ScanBarcode className="w-5 h-5 text-emerald-600" />
          Barcode Scanner
        </CardTitle>
        <CardDescription>
          Open the camera barcode scanner. Scanned products are added to the
          cart automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
            Use this to scan product barcodes with your device camera, or enter
            them manually.
          </p>
          <Button
            type="button"
            onClick={() => setView("scanner")}
            className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <ScanBarcode className="w-4 h-4" />
            Open Scanner
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 8. Multi-Computer Sharing card
// ============================================================
interface MultiComputerSharingCardProps {
  settings: Settings;
  onSaved: () => Promise<void>;
}

/**
 * Multi-computer sharing card.
 *
 * Lets the user run the POS on multiple computers connected via WiFi/LAN
 * sharing the SAME SQLite database:
 *   - Host Mode   → this computer hosts the DB; share its data folder
 *   - Client Mode → connect to a host's shared DB over the network
 *   - Standalone  → use the local DB only (default)
 *
 * Settings (shareMode, dbNetworkPath) are persisted both in the Settings
 * table AND in ~/.shoppos-config.json — the Electron main process reads
 * the latter at startup to decide which DB file to bind to.
 */
function MultiComputerSharingCard({
  settings,
  onSaved,
}: MultiComputerSharingCardProps) {
  const [hostName, setHostName] = React.useState<string>("");
  const [localDbPath, setLocalDbPath] = React.useState<string | null>(null);
  const [clientPath, setClientPath] = React.useState<string>("");
  const [testing, setTesting] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [hosting, setHosting] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);

  const shareMode: string = settings.shareMode || "local";
  const dbNetworkPath: string | null = settings.dbNetworkPath ?? null;

  // Fetch the local hostname + local DB path so the UI can show the user
  // the expected network path they need to share with other computers and
  // let them reveal the data folder in the OS file explorer.
  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/settings/share", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        if (typeof data.hostname === "string") setHostName(data.hostname);
        if (typeof data.localDbPath === "string" && data.localDbPath) {
          setLocalDbPath(data.localDbPath);
        }
      } catch {
        // hostname is best-effort; ignore failures
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // When entering client mode for the first time, prefill the path field with
  // the saved network path (if any) so the user can re-test/re-connect.
  React.useEffect(() => {
    if (shareMode === "client" && dbNetworkPath && !clientPath) {
      setClientPath(dbNetworkPath);
    }
  }, [shareMode, dbNetworkPath, clientPath]);

  const expectedNetworkPath = hostName
    ? `\\\\${hostName}\\ShopPOS\\pos.db`
    : "\\\\<this-computer-name>\\ShopPOS\\pos.db";

  // The folder containing the local DB — revealed in the OS file explorer
  // when the user clicks "Open Data Folder" so they can share it on the LAN.
  const dataFolderPath = localDbPath || null;

  async function onEnableHost() {
    if (hosting) return;
    setHosting(true);
    try {
      const res = await fetch("/api/settings/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareMode: "host" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed");
      }
      toast.success("Host mode enabled");
      await onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Could not enable host mode");
    } finally {
      setHosting(false);
    }
  }

  async function onTestConnection() {
    if (testing) return;
    const p = clientPath.trim();
    if (!p) {
      toast.error("Enter a host computer path first");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const msg = data?.error || "Connection failed";
        toast.error(msg);
        return;
      }
      if (data.exists === false) {
        toast.success(
          "Reachable! The DB file does not exist yet — it will be created when the host shares it."
        );
      } else if (data.type === "dir") {
        toast.success(
          "Folder is reachable. Provide the full path to the .db file to connect."
        );
      } else {
        toast.success(
          `Connection OK — file is reachable${data.size != null ? ` (${data.size} bytes)` : ""}`
        );
      }
    } catch (err: any) {
      toast.error(err?.message || "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  async function onConnect() {
    if (connecting) return;
    const p = clientPath.trim();
    if (!p) {
      toast.error("Enter a host computer path first");
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch("/api/settings/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareMode: "client",
          dbNetworkPath: p,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed");
      }
      toast.success(
        "Connected to host. Please restart the app to switch to the shared database."
      );
      await onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Could not connect");
    } finally {
      setConnecting(false);
    }
  }

  async function onDisconnect() {
    if (disconnecting) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/settings/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareMode: "local" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed");
      }
      toast.success(
        "Disconnected. Please restart the app to use the local database again."
      );
      await onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Could not disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  async function onOpenDataFolder() {
    // Best effort — uses the Electron preload bridge if available.
    const electron = (window as Window).posElectron;
    if (!dataFolderPath) {
      toast.info(
        "Data folder path is not available. Run the app in desktop mode to open it."
      );
      return;
    }
    if (!electron?.openPath) {
      toast.info("Open the data folder manually: " + dataFolderPath);
      return;
    }
    try {
      const result = await electron.openPath(dataFolderPath);
      if (!result?.ok) {
        toast.error(result?.error || "Could not open folder");
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not open folder");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copied to clipboard"))
      .catch(() => toast.error("Copy failed"));
  }

  // Status badge (top-right)
  const statusBadge =
    shareMode === "host" ? (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <Server className="w-3 h-3 mr-1" />
        Host Mode Active
      </Badge>
    ) : shareMode === "client" ? (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <Link2 className="w-3 h-3 mr-1" />
        Client Mode Active
      </Badge>
    ) : (
      <Badge variant="outline" className="text-muted-foreground">
        <Monitor className="w-3 h-3 mr-1" />
        Standalone
      </Badge>
    );

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Network className="w-5 h-5 text-emerald-600" />
              Multi-Computer Sharing
            </CardTitle>
            <CardDescription>
              Use this POS on multiple computers over WiFi/LAN — share the same
              database across all of them.
            </CardDescription>
          </div>
          {statusBadge}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Current status summary */}
        <div className="rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/10 p-3 space-y-1.5">
          {shareMode === "host" ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Server className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium text-emerald-800 dark:text-emerald-300">
                  Host Mode Active
                </span>
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                Your database is shared. Other computers on your network can
                connect to it.
              </p>
              <div className="flex items-center gap-2 pl-6 pt-1">
                <code className="font-mono text-xs bg-background px-2 py-1 rounded border break-all">
                  {expectedNetworkPath}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => copyToClipboard(expectedNetworkPath)}
                >
                  Copy
                </Button>
              </div>
            </>
          ) : shareMode === "client" ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Link2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium text-emerald-800 dark:text-emerald-300">
                  Connected to:
                </span>
                <code className="font-mono text-xs bg-background px-2 py-1 rounded border break-all">
                  {dbNetworkPath || "(no path)"}
                </code>
              </div>
              <div className="pl-6 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={onDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Unlink className="w-3.5 h-3.5" />
                  )}
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <Monitor className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium">
                Standalone (local database)
              </span>
            </div>
          )}
        </div>

        <Separator />

        {/* Host mode section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
              <Server className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Host Mode</h3>
              <p className="text-xs text-muted-foreground">
                This computer hosts the shared database.
              </p>
            </div>
          </div>

          {shareMode === "host" ? (
            <div className="space-y-3 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-3">
              <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal pl-4">
                <li>
                  Your data folder is now shared. Other computers on your
                  network can connect.
                </li>
                <li>
                  Share the folder containing your data on your network:
                  Right-click the folder → <span className="font-medium">Properties → Sharing → Advanced Sharing</span>.
                </li>
                <li>
                  Give other computers the network path below to connect as
                  clients.
                </li>
              </ol>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Wifi className="w-3 h-3 text-emerald-600" />
                  Network path for clients
                </Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="font-mono text-xs bg-background px-2 py-1.5 rounded border break-all flex-1 min-w-[200px]">
                    {expectedNetworkPath}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => copyToClipboard(expectedNetworkPath)}
                  >
                    Copy
                  </Button>
                </div>
                {hostName && (
                  <p className="text-xs text-muted-foreground">
                    This computer&apos;s name: <span className="font-mono">{hostName}</span>
                  </p>
                )}
                {dataFolderPath && (
                  <p className="text-xs text-muted-foreground break-all">
                    Local data file:{" "}
                    <span className="font-mono">{dataFolderPath}</span>
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-9 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                onClick={onOpenDataFolder}
                disabled={!dataFolderPath}
              >
                <FolderOpen className="w-4 h-4" />
                Open Data Folder
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              onClick={onEnableHost}
              disabled={hosting || shareMode === "client"}
              className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {hosting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Server className="w-4 h-4" />
              )}
              Enable Host Mode
            </Button>
          )}
        </div>

        <Separator />

        {/* Client mode section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
              <Link2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Client Mode</h3>
              <p className="text-xs text-muted-foreground">
                Connect to a host computer&apos;s shared database.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dbNetworkPath" className="flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5 text-emerald-600" />
              Host computer path
            </Label>
            <Input
              id="dbNetworkPath"
              value={clientPath}
              onChange={(e) => setClientPath(e.target.value)}
              placeholder="\\DESKTOP-ABC\ShopPOS\pos.db"
              dir="ltr"
              className="h-11 font-mono text-sm"
              disabled={shareMode === "host"}
            />
            <p className="text-xs text-muted-foreground">
              Ask the host computer for this path. It points to the shared
              <span className="font-mono"> pos.db </span>file.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              onClick={onTestConnection}
              disabled={testing || !clientPath.trim() || shareMode === "host"}
            >
              {testing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wifi className="w-4 h-4" />
              )}
              Test Connection
            </Button>
            <Button
              type="button"
              onClick={onConnect}
              disabled={
                connecting ||
                !clientPath.trim() ||
                shareMode === "host"
              }
              className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {connecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4" />
              )}
              Connect
            </Button>
          </div>
        </div>

        {/* Warning alert */}
        <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="w-4 h-4 text-amber-700" />
          <AlertTitle className="text-amber-800 dark:text-amber-300">
            Important
          </AlertTitle>
          <AlertDescription className="text-xs">
            When using Client Mode, make sure the host computer is running and
            the folder is shared. The database will be read from the network
            path — if the host is offline, this computer will not be able to
            access its data. <span className="font-medium">Restart the app after switching modes for the change to take effect.</span>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 9. Software Updates card (in-app auto-update)
// ============================================================
type SoftwareUpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

function SoftwareUpdatesCard() {
  const [status, setStatus] = React.useState<SoftwareUpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = React.useState<UpdateInfo | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [errorMsg, setErrorMsg] = React.useState("");
  // Get current version — try multiple sources in priority order:
  // 1. NEXT_PUBLIC_APP_VERSION (build-time env, always available)
  // 2. Electron preload (window.posElectron.version)
  // 3. /api/version endpoint (server-side)
  // 4. Hardcoded fallback
  const [currentVersion, setCurrentVersion] = React.useState(
    process.env.NEXT_PUBLIC_APP_VERSION || ""
  );

  React.useEffect(() => {
    // If we already have the version from build-time env, use it
    if (process.env.NEXT_PUBLIC_APP_VERSION) {
      setCurrentVersion(process.env.NEXT_PUBLIC_APP_VERSION);
      return;
    }
    // Try Electron preload
    if (typeof window !== "undefined" && window.posElectron?.version) {
      setCurrentVersion(window.posElectron.version);
      return;
    }
    // Fallback: fetch from /api/version
    async function fetchVersion() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.version) {
            setCurrentVersion(data.version);
            return;
          }
        }
      } catch {}
      setCurrentVersion("2.7.60");
    }
    fetchVersion();
  }, []);

  // Listen for progress events from main process
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.posElectron?.updater) return;

    const remover = window.posElectron.updater.onProgress((pct: number) => {
      setProgress(Math.round(pct));
    });

    return () => {
      if (remover) remover();
    };
  }, []);

  const isElectronUpdater = typeof window !== "undefined" && !!window.posElectron?.updater;

  async function checkForUpdates() {
    setStatus("checking");
    setUpdateInfo(null);
    setErrorMsg("");

    try {
      // ─── ALWAYS try GitHub API directly first (most reliable) ───────
      // This bypasses electron-updater's internal logic which has been
      // unreliable. We fetch the latest release from GitHub API directly.
      const curVer = currentVersion || process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";
      console.log("[Update Check] Current version:", curVer);

      const githubRes = await fetch(
        "https://api.github.com/repos/mohsinrasheed-Baga1/shop-pos-system/releases/latest",
        { cache: "no-store", headers: { Accept: "application/vnd.github.v3+json" } }
      );

      if (!githubRes.ok) {
        throw new Error(`GitHub API returned ${githubRes.status}`);
      }

      const releaseData = await githubRes.json();
      const latestTag = releaseData?.tag_name || "";
      const latestVersion = latestTag.replace(/^v/, "");
      console.log("[Update Check] Latest version on GitHub:", latestVersion);

      // Find the .exe asset
      const exeAsset = (releaseData?.assets || []).find((a: any) => a.name.endsWith(".exe"));
      const downloadUrl = exeAsset?.browser_download_url || null;
      const downloadSize = exeAsset?.size || null;

      if (latestVersion && isNewerVersion(latestVersion, curVer)) {
        setUpdateInfo({
          version: latestVersion,
          releaseNotes: releaseData?.body || "",
          downloadUrl,
          downloadSize,
        });
        setStatus("available");
        toast.success(`Version v${latestVersion} is available! Click Download to update.`);
      } else {
        setStatus("up-to-date");
        toast.success(`You're on the latest version (v${curVer})`);
      }
    } catch (err: any) {
      console.error("[Update Check] Error:", err);
      setErrorMsg(err?.message || "Failed to check for updates. Make sure you're connected to the internet.");
      setStatus("error");
    }
  }

  async function downloadAndInstall() {
    setStatus("downloading");
    setProgress(0);
    setErrorMsg("");

    try {
      const downloadUrl = (updateInfo as any)?.downloadUrl;

      if (isElectronUpdater && downloadUrl) {
        // Use Electron's main process to download (handles HTTPS, redirects)
        await window.posElectron.updater.download(downloadUrl);
        setStatus("downloaded");
        toast.success("Update downloaded! Click Install to apply.");
      } else if (isElectronUpdater) {
        // No downloadUrl — use electron-updater's built-in download
        await window.posElectron.updater.download();
        setStatus("downloaded");
        toast.success("Update downloaded! Click Install to apply.");
      } else if (downloadUrl) {
        // Browser — open download URL directly
        window.open(downloadUrl, "_blank");
        setStatus("idle");
        toast.info("Downloading update in your browser...");
      } else {
        // Fallback — open GitHub releases page
        window.open("https://github.com/mohsinrasheed-Baga1/shop-pos-system/releases/latest", "_blank");
        setStatus("idle");
        toast.info("Opening GitHub releases page in your browser...");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Download failed");
      setStatus("error");
      toast.error(err?.message || "Download failed");
    }
  }

  async function installUpdate() {
    try {
      if (isElectronUpdater) {
        await window.posElectron.updater.install();
        // App will restart automatically
      }
    } catch (err: any) {
      toast.error(err?.message || "Install failed");
    }
  }

  function reset() {
    setStatus("idle");
    setUpdateInfo(null);
    setProgress(0);
    setErrorMsg("");
  }

  const displayVersion = currentVersion || process.env.NEXT_PUBLIC_APP_VERSION || "2.7.60";

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <DownloadCloud className="w-5 h-5 text-emerald-600" />
              Software Updates
            </CardTitle>
            <CardDescription>
              Check for new versions and download updates directly within the app.
              {isElectronUpdater && (
                <span className="block mt-0.5 text-xs text-emerald-600">
                  Delta updates enabled — only changed data is downloaded.
                </span>
              )}
            </CardDescription>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            <Package className="w-3 h-3 mr-1" />
            v{displayVersion}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Idle */}
        {status === "idle" && (
          <>
            <p className="text-sm text-muted-foreground">
              You are running{" "}
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                v{displayVersion}
              </span>
              . Click below to check for newer versions.
            </p>
            <Button
              type="button"
              onClick={checkForUpdates}
              className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <RefreshCw className="w-4 h-4" />
              Check for Updates
            </Button>
          </>
        )}

        {/* Checking */}
        {status === "checking" && (
          <Alert className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20">
            <Loader2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 animate-spin" />
            <AlertTitle className="text-emerald-800 dark:text-emerald-300">
              Checking for updates...
            </AlertTitle>
            <AlertDescription className="text-xs">
              Contacting the update server. This should only take a moment.
            </AlertDescription>
          </Alert>
        )}

        {/* Up-to-date */}
        {status === "up-to-date" && (
          <>
            <Alert className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <AlertTitle className="text-emerald-800 dark:text-emerald-300">
                You&apos;re running the latest version.
              </AlertTitle>
              <AlertDescription className="text-xs">
                Your current version (v{displayVersion}) is up to date. Check
                again later for new releases.
              </AlertDescription>
            </Alert>
            <Button
              type="button"
              variant="outline"
              onClick={checkForUpdates}
              className="h-10 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              <RefreshCw className="w-4 h-4" />
              Check Again
            </Button>
          </>
        )}

        {/* Available */}
        {status === "available" && updateInfo && (
          <>
            <Alert className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
              <DownloadCloud className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <AlertTitle className="text-emerald-800 dark:text-emerald-300">
                Version v{updateInfo.version} is available!
              </AlertTitle>
              <AlertDescription>
                <p className="text-xs mt-1">
                  A new version is ready to download and install.
                </p>
                {updateInfo.releaseNotes && (
                  <div className="mt-3 p-2 rounded bg-white/60 dark:bg-black/20 text-xs whitespace-pre-line max-h-48 overflow-y-auto">
                    {updateInfo.releaseNotes}
                  </div>
                )}
                {updateInfo.downloadSize && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Download size: ~{formatBytes(updateInfo.downloadSize)}
                  </p>
                )}
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={downloadAndInstall}
                className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white min-w-[220px]"
              >
                <DownloadCloud className="w-4 h-4" />
                Download &amp; Install Update
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                className="h-11 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                Cancel
              </Button>
            </div>
          </>
        )}

        {/* Downloading */}
        {status === "downloading" && (
          <div className="space-y-3">
            <Alert className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20">
              <DownloadCloud className="w-4 h-4 text-emerald-700 dark:text-emerald-400 animate-pulse" />
              <AlertTitle className="text-emerald-800 dark:text-emerald-300">
                Downloading update...
              </AlertTitle>
              <AlertDescription className="text-xs">
                Only the changed data is being downloaded (delta update). {progress}%
              </AlertDescription>
            </Alert>
            <div className="space-y-1.5">
              <Progress
                value={progress}
                className="h-3 bg-emerald-100 dark:bg-emerald-950/40"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Downloading update...</span>
                <span>{progress}%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The app will automatically install the update once downloaded. Please keep this window open.
            </p>
          </div>
        )}

        {/* Downloaded — ready to install */}
        {status === "downloaded" && (
          <div className="space-y-3">
            <Alert className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <AlertTitle className="text-emerald-800 dark:text-emerald-300">
                Update downloaded successfully!
              </AlertTitle>
              <AlertDescription className="text-xs">
                The update has been downloaded and is ready to install. The app
                will restart to apply the update. Your data will be preserved.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={installUpdate}
                className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white min-w-[180px]"
              >
                <Package className="w-4 h-4" />
                Install &amp; Restart
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                className="h-11 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                Later
              </Button>
            </div>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="space-y-3">
            <Alert className="border-red-300 bg-red-50 dark:bg-red-950/20">
              <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-400" />
              <AlertTitle className="text-red-800 dark:text-red-300">
                Update check failed
              </AlertTitle>
              <AlertDescription className="text-xs">
                {errorMsg || "Could not check for updates. Please try again later."}
              </AlertDescription>
            </Alert>
            <Button
              type="button"
              variant="outline"
              onClick={checkForUpdates}
              className="h-10 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Compare semantic versions. Returns true if remote > current. */
function isNewerVersion(remote: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .split(".")
      .map((x) => parseInt(x.replace(/\D/g, "") || "0", 10))
      .slice(0, 3);
  const r = parse(remote);
  const c = parse(current);
  for (let i = 0; i < 3; i++) {
    const ri = r[i] || 0;
    const ci = c[i] || 0;
    if (ri > ci) return true;
    if (ri < ci) return false;
  }
  return false;
}



// ============================================================
// 10. Cloud Backup (Google Drive) — Production Ready
// ============================================================
function CloudBackupCard() {
  const [status, setStatus] = React.useState<any>(null);
  const [backups, setBackups] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [action, setAction] = React.useState<string>("");
  const [restoreTarget, setRestoreTarget] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [gClientId, setGClientId] = React.useState("");
  const [gClientSecret, setGClientSecret] = React.useState("");
  const [showRestoreHelp, setShowRestoreHelp] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (typeof window === "undefined" || !window.posElectron?.googleDrive) return;
    try {
      const s = await window.posElectron.googleDrive.status();
      setStatus(s);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  const isElectron = typeof window !== "undefined" && window.posElectron?.googleDrive;
  const connected = status?.connected;
  const configured = status ? status.configured : null; // null = still loading

  async function handleConnect() {
    setError(null);
    setLoading(true);
    setAction("connect");
    try {
      const res = await window.posElectron.googleDrive.connect();
      if (res.ok) {
        toast.success("Google Drive connected!");
        refresh();
      } else {
        setError(res.error || "Connection failed");
        toast.error(res.error || "Connection failed");
      }
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
      setAction("");
    }
  }

  async function handleSaveConfig() {
    setError(null);
    setLoading(true);
    setAction("save-config");
    try {
      const res = await window.posElectron.googleDrive.saveConfig(gClientId, gClientSecret);
      if (res.ok) {
        toast.success("OAuth credentials saved! Connecting...");
        await refresh();
        // Now auto-connect
        await handleConnect();
      } else {
        setError(res.error || "Failed to save config");
        toast.error(res.error || "Failed to save config");
      }
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
      setAction("");
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    setAction("disconnect");
    try {
      await window.posElectron.googleDrive.disconnect();
      toast.success("Google Drive disconnected");
      setStatus(null);
      setBackups([]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
      setAction("");
    }
  }

  async function handleBackup() {
    setError(null);
    setLoading(true);
    setAction("backup");
    try {
      const res = await window.posElectron.googleDrive.backup();
      if (res.ok) {
        toast.success(`Backup uploaded to Google Drive (${Math.round((res.size || 0) / 1024)} KB)`);
        refresh();
      } else {
        setError(res.error || "Backup failed");
        toast.error(res.error || "Backup failed");
      }
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
      setAction("");
    }
  }

  async function handleListBackups() {
    setLoading(true);
    setAction("list");
    try {
      const res = await window.posElectron.googleDrive.listBackups();
      if (res.ok) {
        setBackups(res.backups || []);
      } else {
        toast.error(res.error || "Failed to list backups");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
      setAction("");
    }
  }

  async function handleRestore() {
    if (!restoreTarget) return;
    setLoading(true);
    setAction("restore");
    try {
      const res = await window.posElectron.googleDrive.restore(restoreTarget.id);
      if (res.ok) {
        toast.success("Database restored. Please restart the app.");
        setRestoreTarget(null);
      } else {
        toast.error(res.error || "Restore failed");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
      setAction("");
    }
  }

  if (!isElectron) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-emerald-600" />
            Cloud Backup (Google Drive)
          </CardTitle>
          <CardDescription>
            Automatic cloud backup to your Google Drive account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Cloud backup is available in the desktop application. Please use the Shop POS System desktop app to connect Google Drive.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="w-5 h-5 text-emerald-600" />
          Cloud Backup (Google Drive)
        </CardTitle>
        <CardDescription>
          Automatically backup your data to Google Drive. Your data stays in your own Google account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status row */}
        <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
          <div className="flex items-center gap-2">
            {connected ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <div>
                  <div className="font-medium text-sm">Google Drive Connected</div>
                  <div className="text-xs text-muted-foreground">
                    {status?.totalBackups || 0} backups stored
                  </div>
                </div>
              </>
            ) : (
              <>
                <CloudOff className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="font-medium text-sm">Not Connected</div>
                  <div className="text-xs text-muted-foreground">
                    {configured === null ? "Loading..." : "Enter credentials below to connect"}
                  </div>
                </div>
              </>
            )}
          </div>
          <Badge className={connected ? "bg-emerald-100 text-emerald-700" : "bg-muted"}>
            {connected ? "Connected" : "Disconnected"}
          </Badge>
        </div>

        {/* Last backup info */}
        {status?.lastBackup && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last Backup:</span>
            <span className="font-medium">
              {new Date(status.lastBackup.date).toLocaleString()}
            </span>
          </div>
        )}

        {error && (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {/* OAuth Setup Form - ALWAYS shown when not connected */}
        {!connected && (
          <div className="rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-emerald-600" />
              <Label className="font-bold text-emerald-800">Setup Google Drive Backup</Label>
            </div>
            {configured === false && (
              <Alert className="border-amber-200 bg-amber-50 py-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-xs">
                  Google Drive is not configured. Enter your OAuth credentials below to connect.
                </AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">
              To connect Google Drive, you need Google OAuth credentials. Follow these steps:
            </p>
            <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-1 pl-1">
              <li>Go to <span className="font-mono bg-muted px-1 rounded">console.cloud.google.com</span></li>
              <li>Create a new project (or select existing)</li>
              <li>Enable <strong>Google Drive API</strong></li>
              <li>Create <strong>OAuth 2.0 Client ID</strong> (Desktop App type)</li>
              <li>Copy <strong>Client ID</strong> and <strong>Client Secret</strong> below</li>
            </ol>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Google OAuth Client ID *</Label>
                <Input
                  type="text"
                  placeholder="xxxxx.apps.googleusercontent.com"
                  value={gClientId}
                  onChange={(e) => setGClientId(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Google OAuth Client Secret *</Label>
                <Input
                  type="password"
                  placeholder="GOCSPX-xxxxx"
                  value={gClientSecret}
                  onChange={(e) => setGClientSecret(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSaveConfig}
                disabled={loading || !gClientId.trim() || !gClientSecret.trim()}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {action === "save-config" ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving &amp; Connecting...</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" /> Save &amp; Connect Google Drive</>
                )}
              </Button>
            </div>
            {configured === true && (
              <p className="text-xs text-emerald-700">
                <CheckCircle2 className="w-3 h-3 inline mr-1" />
                Credentials already saved. Click &quot;Save &amp; Connect&quot; again or use the Connect button below.
              </p>
            )}
          </div>
        )}

        {/* Connect button - only when configured but not connected */}
        {!connected && configured === true && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleConnect}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {action === "connect" ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting...</>
              ) : (
                <><Cloud className="w-4 h-4 mr-2" /> Connect Google Drive</>
              )}
            </Button>
          </div>
        )}
        {connected && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleBackup}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {action === "backup" ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" /> Backup Now</>
              )}
            </Button>
            <Button
              onClick={handleListBackups}
              disabled={loading}
              variant="outline"
            >
              {action === "list" ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading...</>
              ) : (
                <><List className="w-4 h-4 mr-2" /> View &amp; Restore Backups</>
              )}
            </Button>
            <Button
              onClick={handleDisconnect}
              disabled={loading}
              variant="outline"
              className="text-red-600 hover:bg-red-50"
            >
              {action === "disconnect" ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /></>
              ) : (
                <><CloudOff className="w-4 h-4 mr-2" /> Disconnect</>
              )}
            </Button>
          </div>
        )}

        {/* Backup schedule info */}
        {connected && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-emerald-800">
              <Clock className="w-4 h-4" />
              Automatic Backup Schedule
            </div>
            <p className="text-xs text-emerald-700 mt-1">
              Backups auto-upload every 4 hours. Your data is compressed and encrypted before upload.
            </p>
          </div>
        )}

        {/* Restore dialog - backups list */}
        {backups.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Available Backups on Google Drive:</Label>
            <div className="max-h-60 overflow-y-auto rounded-lg border">
              {backups.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between p-2 border-b last:border-0 hover:bg-muted/50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{b.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(b.createdTime).toLocaleString()} &bull; {Math.round((Number(b.size) || 0) / 1024)} KB
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRestoreTarget(b)}
                  >
                    <Download className="w-3 h-3 mr-1" /> Restore
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Restore confirmation */}
        <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
              <AlertDialogDescription>
                This will replace your current database with the selected backup.
                A safety backup of your current data will be created first.
                You will need to restart the app after restoring.
                {restoreTarget && (
                  <span className="block mt-2 font-medium">
                    {restoreTarget.name} ({new Date(restoreTarget.createdTime).toLocaleString()})
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRestore}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {action === "restore" ? "Restoring..." : "Restore Now"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* How to restore after computer crash - FAQ */}
        <Collapsible open={showRestoreHelp} onOpenChange={setShowRestoreHelp}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium">Computer坏了之后如何恢复数据? (How to restore after computer crash?)</span>
              </span>
              {showRestoreHelp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 mt-2 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-blue-800">
                <RefreshCw className="w-4 h-4" />
                Computer crash ya format hone ke baad data recovery
              </div>
              <div className="text-xs text-muted-foreground space-y-2">
                <p>Agar aapka computer kharab ho jaye ya format ho jaye, aapka data Google Drive par safe hai. Naye computer par data wapas lane ke liye:</p>
                <ol className="list-decimal list-inside space-y-1 pl-2">
                  <li><strong>Software install karein</strong> — Naye computer par Shop POS System download aur install karein</li>
                  <li><strong>Settings &rarr; Google Drive</strong> jayein</li>
                  <li><strong>Client ID aur Client Secret</strong> daalein (jo pehle use kiya tha) &rarr; <strong>Save &amp; Connect</strong> dabayein</li>
                  <li><strong>Google sign-in</strong> &mdash; Google ka page khulega, <strong>usi Gmail</strong> se login karein jo pehle backup lene ke liye use ki thi</li>
                  <li><strong>Connected</strong> hone ke baad, <strong>&quot;View &amp; Restore Backups&quot;</strong> button dabayein</li>
                  <li><strong>Sab backups ki list</strong> aa jayegi Google Drive se &mdash; sabse naya (latest) backup select karein</li>
                  <li><strong>&quot;Restore&quot;</strong> dabayein &rarr; Confirm karein</li>
                  <li><strong>App restart karein</strong> &rarr; <span className="text-emerald-700 font-bold">Aapka sara data wapas aa jayega!</span></li>
                </ol>
                <div className="mt-2 p-2 bg-emerald-100 rounded border border-emerald-200 text-emerald-800">
                  <strong>Important:</strong> Aapko sirf Client ID aur Client Secret yaad rakhna hai. Ye Google Cloud Console se milta hai. Backup aapke Google Drive account mein store hota hai &mdash; computer se independent.
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Separator />
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
          <span>
            Your Google credentials are encrypted and stored securely on this computer.
            We only access files in the &quot;POS Backups&quot; folder. You can disconnect anytime.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Shortcuts page card
// ============================================================
function ShortcutsCard() {
  const shortcuts = [
    { key: "Ctrl + Shift + P", desc: "Jump to POS (Sell) from any page", section: "Global" },
    { key: "↑ ↓", desc: "Navigate products up/down in POS", section: "POS" },
    { key: "← →", desc: "Jump 4 products left/right in POS", section: "POS" },
    { key: "Enter", desc: "Add highlighted product to cart", section: "POS" },
    { key: "F2", desc: "Checkout (complete sale)", section: "POS" },
    { key: "F3", desc: "Return / Refund", section: "POS" },
    { key: "F4", desc: "Open Calculator", section: "POS" },
    { key: "F9", desc: "Toggle price: Regular → Wholesale → Shopkeeper", section: "POS" },
    { key: "F12", desc: "Clear cart", section: "POS" },
    { key: "Escape", desc: "Clear search + refocus", section: "POS" },
    { key: "Space", desc: "Scanner: same as Enter (next scan)", section: "Scanner" },
    { key: "0-9 + - * / Enter", desc: "Calculator keyboard input", section: "Calculator" },
    { key: "C", desc: "Calculator: clear", section: "Calculator" },
    { key: "Backspace", desc: "Calculator: delete last digit", section: "Calculator" },
  ];

  const sections = [...new Set(shortcuts.map((s) => s.section))];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Keyboard className="w-5 h-5 text-emerald-600" />
          Keyboard Shortcuts
        </CardTitle>
        <CardDescription>All keyboard shortcuts for faster operation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sections.map((section) => (
          <div key={section} className="space-y-2">
            <h4 className="text-sm font-bold text-emerald-700 border-b pb-1">{section}</h4>
            <div className="space-y-1">
              {shortcuts.filter((s) => s.section === section).map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1">
                  <span className="text-muted-foreground">{s.desc}</span>
                  <kbd className="px-2 py-1 rounded bg-muted border text-xs font-mono font-bold">{s.key}</kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">
          Tip: Use scanner + keyboard to sell without mouse. Scan product → Enter → F2 → Enter. Done!
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Data Migration (PC Transfer) card
// ============================================================
function DataMigrationCard() {
  const [importing, setImporting] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function handleExport() {
    try {
      toast.success("Preparing export...");
      const res = await fetch("/api/backup/export");
      if (!res.ok) { toast.error("Export failed"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shop-pos-backup-${new Date().toISOString().slice(0, 10)}.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Database exported! Save this file to transfer to a new PC.");
    } catch { toast.error("Export failed"); }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/backup/import", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) { toast.success("Data imported! Please restart the app."); setConfirmOpen(false); }
      else { toast.error(data.error || "Import failed"); }
    } catch { toast.error("Import failed"); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-600" />
          Data Migration (PC Transfer)
        </CardTitle>
        <CardDescription>Transfer your entire database to a new computer</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm">
          <p className="font-medium text-emerald-800 mb-1">How to transfer to a new PC:</p>
          <ol className="list-decimal list-inside space-y-1 text-emerald-700 text-xs">
            <li>Click Export Data — a backup file will download</li>
            <li>Copy the file to your new PC (USB, email, etc.)</li>
            <li>Install Shop POS System on the new PC</li>
            <li>Open Settings → Data Migration → Import Data</li>
            <li>Select the backup file → restart the app</li>
          </ol>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" /> Export Data
          </Button>
          <Button variant="outline" onClick={() => setConfirmOpen(true)} className="text-amber-700 border-amber-200 hover:bg-amber-50">
            <Upload className="w-4 h-4 mr-2" /> Import Data
          </Button>
        </div>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Import will REPLACE all data</AlertDialogTitle>
              <AlertDialogDescription>
                This will replace your current database with the imported file. Make sure you have exported a backup first. You will need to restart the app after importing.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); fileRef.current?.click(); }}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {importing ? "Importing..." : "Select File & Import"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <input ref={fileRef} type="file" accept=".db,.sqlite,.sqlite3" onChange={handleImport} className="hidden" />
      </CardContent>
    </Card>
  );
}
