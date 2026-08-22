import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { LoginScreen } from "@/components/pos/login-screen";
import { AppShell } from "@/components/pos/app-shell";
import { seedIfNeeded } from "@/lib/seed";
import { getSessionUser } from "@/lib/session";
import LandingPage from "@/app/portal/page";

const isVercel = process.env.VERCEL === "1" || process.env.NEXT_PUBLIC_IS_VERCEL === "true";

export default async function Home() {
  // v2.10.20: On Vercel, show landing page with portal links
  if (isVercel) {
    return <LandingPage />;
  }

  // Desktop: normal POS flow
  await seedIfNeeded();

  const session = await getSessionUser();
  if (!session) {
    return <LoginScreen />;
  }

  let settings: any = null;
  try {
    settings = await db.settings.findUnique({ where: { id: "shop" } });
  } catch {}

  const user = {
    id: session.id,
    name: session.name,
    email: session.email,
    role: session.role,
    permissions: session.permissions,
  };

  return <AppShell user={user} settings={settings} />;
}
