import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { LoginScreen } from "@/components/pos/login-screen";
import { AppShell } from "@/components/pos/app-shell";
import { seedIfNeeded } from "@/lib/seed";
import { getSessionUser } from "@/lib/session";

export default async function Home() {
  // ensure admin + settings exist
  await seedIfNeeded();

  const session = await getSessionUser();
  if (!session) {
    return <LoginScreen />;
  }

  const settings = await db.settings.findUnique({ where: { id: "shop" } });
  const user = {
    id: session.id,
    name: session.name,
    email: session.email,
    role: session.role,
    permissions: session.permissions,
  };

  return <AppShell user={user} settings={settings} />;
}
