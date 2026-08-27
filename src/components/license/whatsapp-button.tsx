"use client";

import { Button } from "@/components/ui/button";
import { LICENSE_CONFIG } from "@/lib/license/config";
import { MessageCircle } from "lucide-react";

type Props = {
  /** Optional custom message — defaults to a generic license inquiry. */
  message?: string;
  /** Visual variant. */
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  /** Show full label or just icon. */
  showLabel?: boolean;
  /** Optional context that gets appended to the message (e.g. "trial expired"). */
  context?: "trial_expired" | "license_expired" | "license_revoked" | "new_license" | "general";
};

const CONTEXT_MESSAGES: Record<NonNullable<Props["context"]>, string> = {
  trial_expired:
    "Mera 3-day free trial complete ho gaya hai. Mujhe paid license chahiye.",
  license_expired:
    "Mera license expire ho gaya hai. Mujhe renewal chahiye.",
  license_revoked:
    "Mera license revoke ho gaya hai. Mujhe iska reason aur solution chahiye.",
  new_license:
    "Mujhe Pakistan POS ka naya license chahiye. Price aur details batayein.",
  general: "Assalam o Alaikum, mujhe Pakistan POS ke baray mein maloomat chahiye.",
};

export function WhatsAppButton({
  message,
  variant = "default",
  size = "default",
  className = "",
  showLabel = true,
  context = "general",
}: Props) {
  const finalMessage = message || CONTEXT_MESSAGES[context];
  const encodedMessage = encodeURIComponent(finalMessage);
  const waLink = `https://wa.me/${LICENSE_CONFIG.developer.whatsappNumber}?text=${encodedMessage}`;

  return (
    <Button
      asChild
      variant={variant}
      size={size}
      className={`bg-emerald-600 hover:bg-emerald-700 text-white ${className}`}
    >
      <a href={waLink} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="w-4 h-4 mr-2" />
        {showLabel ? "WhatsApp" : ""}
      </a>
    </Button>
  );
}
