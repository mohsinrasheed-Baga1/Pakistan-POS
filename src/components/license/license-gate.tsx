"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivationScreen } from "./activation-screen";
import { LockoutScreen } from "./lockout-screen";
import { LicenseBanner } from "./license-banner";
import { ensureSystemId, getStoredLicense, saveLicense, clearLicense, isExpired, needsReverification, isClockRolledBack } from "@/lib/license/storage";
import { verifyLicense } from "@/lib/license/client";

type Props = {
  /** Children = the actual POS app. Only shown when license is valid. */
  children: React.ReactNode;
  /** If true, show the small license banner at top of POS app (default: true). */
  showBanner?: boolean;
};

type Status =
  | { kind: "loading" }
  | { kind: "needs_activation"; systemId: string; systemInfo: unknown }
  | { kind: "active"; systemId: string }
  | {
      kind: "locked";
      reason: "revoked" | "expired" | "trial_expired" | "verification_failed";
      systemId: string;
      systemInfo: unknown;
      message?: string;
      oldLicenseKey?: string;
    };

export function LicenseGate({ children, showBanner = true }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { systemId, systemInfo } = await ensureSystemId();
        const stored = getStoredLicense();

        // No stored license → show activation screen
        if (!stored) {
          if (mounted) {
            setStatus({ kind: "needs_activation", systemId, systemInfo });
          }
          return;
        }

        // ANTI-DATE-CHANGE CHECK:
        // If user has rolled back their PC clock to extend trial/license,
        // detect it and lock the app immediately.
        if (isClockRolledBack()) {
          clearLicense();
          if (mounted) {
            setStatus({
              kind: "locked",
              reason: "verification_failed",
              systemId,
              systemInfo,
              message:
                "System clock tampering detected. Please set the correct date and time, then try again.",
              oldLicenseKey: stored.licenseKey,
            });
          }
          return;
        }

        // Stored license exists → check if expired locally first
        // (using server-provided expiresAt, not local time manipulation)
        if (isExpired(stored)) {
          clearLicense();
          if (mounted) {
            setStatus({
              kind: "locked",
              reason: stored.licenseType === "trial" ? "trial_expired" : "expired",
              systemId,
              systemInfo,
              oldLicenseKey: stored.licenseKey,
            });
          }
          return;
        }

        // Re-verify with server on EVERY startup (always returns true now)
        // This ensures trial/license expiry is checked against server-side NOW(),
        // which cannot be manipulated by changing PC clock.
        if (needsReverification(stored)) {
          try {
            const result = await verifyLicense({
              licenseKey: stored.licenseKey,
              systemId,
            });

            if (result.success && result.valid) {
              // Update stored license with fresh data
              const updated = {
                ...stored,
                lastVerifiedAt: new Date().toISOString(),
                ...(result.license?.expiresAt
                  ? { expiresAt: result.license.expiresAt }
                  : {}),
              };
              saveLicense(updated);
              if (mounted) setStatus({ kind: "active", systemId });
            } else {
              // Locked
              clearLicense();
              const reason =
                result.reason === "license_revoked"
                  ? "revoked"
                  : result.reason === "license_expired"
                    ? "expired"
                    : "verification_failed";
              if (mounted) {
                setStatus({
                  kind: "locked",
                  reason,
                  systemId,
                  systemInfo,
                  message: result.message,
                  oldLicenseKey: stored.licenseKey,
                });
              }
            }
          } catch {
            // Network error during verification.
            // Allow offline use if license is still locally valid (within 7-day grace).
            const offlineGraceMs = 7 * 24 * 60 * 60 * 1000; // 7 days
            const lastVerified = new Date(stored.lastVerifiedAt).getTime();
            if (Date.now() - lastVerified < offlineGraceMs) {
              if (mounted) setStatus({ kind: "active", systemId });
            } else {
              if (mounted) {
                setStatus({
                  kind: "locked",
                  reason: "verification_failed",
                  systemId,
                  systemInfo,
                  message:
                    "Couldn't verify your license for over 7 days. Please connect to internet and try again.",
                  oldLicenseKey: stored.licenseKey,
                });
              }
            }
          }
        } else {
          // Recent verification — trust local state
          if (mounted) setStatus({ kind: "active", systemId });
        }
      } catch (err) {
        console.error("License gate error:", err);
        if (mounted) {
          // Fail closed — show activation screen
          setStatus({
            kind: "needs_activation",
            systemId: "ERROR-LOADING",
            systemInfo: null,
          });
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (status.kind === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-3 w-64">
          <Skeleton className="h-12 w-12 rounded-full mx-auto" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <p className="text-center text-xs text-muted-foreground mt-3">
            Checking license…
          </p>
        </div>
      </div>
    );
  }

  if (status.kind === "needs_activation") {
    return (
      <ActivationScreen
        systemId={status.systemId}
        systemInfo={status.systemInfo}
        onLicenseActivated={() => setStatus({ kind: "active", systemId: status.systemId })}
      />
    );
  }

  if (status.kind === "locked") {
    return (
      <LockoutScreen
        reason={status.reason}
        systemId={status.systemId}
        systemInfo={status.systemInfo}
        message={status.message}
        oldLicenseKey={status.oldLicenseKey}
        onReactivated={() => setStatus({ kind: "active", systemId: status.systemId })}
      />
    );
  }

  // Active — show the actual POS app
  return (
    <>
      {showBanner && (
        <div className="p-2 max-w-7xl mx-auto w-full">
          <LicenseBanner license={getStoredLicense()!} />
        </div>
      )}
      {children}
    </>
  );
}
