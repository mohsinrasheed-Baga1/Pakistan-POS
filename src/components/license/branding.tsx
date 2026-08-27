import { LICENSE_CONFIG } from "@/lib/license/config";

type Props = {
  /** Where to show this — full footer or compact inline. */
  variant?: "footer" | "inline" | "compact";
};

/**
 * Developer branding shown on license-related screens.
 *
 * - "footer": full-width footer with name + phone
 * - "inline": single line — name • phone
 * - "compact": just © Developer Name
 */
export function Branding({ variant = "inline" }: Props) {
  const { developer } = LICENSE_CONFIG;

  if (variant === "compact") {
    return (
      <p className="text-xs text-muted-foreground">
        © Developed by {developer.name}
      </p>
    );
  }

  if (variant === "footer") {
    return (
      <footer className="border-t bg-muted/30 mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-2 text-sm">
          <div className="text-muted-foreground">
            © {new Date().getFullYear()} Pakistan POS · Developed by{" "}
            <span className="font-semibold text-foreground">{developer.name}</span>
          </div>
          <a
            href={`tel:${developer.phone}`}
            className="text-primary font-medium hover:underline"
          >
            📞 {developer.phone}
          </a>
        </div>
      </footer>
    );
  }

  // inline
  return (
    <p className="text-xs text-muted-foreground text-center">
      Developed by{" "}
      <span className="font-semibold text-foreground">{developer.name}</span>{" "}
      ·{" "}
      <a
        href={`tel:${developer.phone}`}
        className="text-primary hover:underline"
      >
        {developer.phone}
      </a>
    </p>
  );
}
