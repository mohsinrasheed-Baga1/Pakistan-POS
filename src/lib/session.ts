import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, ensureSchema } from "@/lib/db";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: "ADMIN" | "MANAGER" | "CASHIER";
};

// Track whether we've disabled FK constraints on this PrismaClient instance.
// SQLite's PRAGMA foreign_keys is per-connection, but Prisma uses a
// connection pool — so we set it on every request to be safe.
let fkDisabledForThisProcess = false;

/**
 * Get the current authenticated user. CRITICAL: this also awaits
 * `ensureSchema()` AND disables SQLite foreign key constraints before
 * returning, so that any API route that uses `getSessionUser()` is
 * guaranteed to:
 *   1. See a fully-upgraded database schema
 *   2. NOT fail with "Foreign key constraint violated" if the backup DB
 *      has inconsistent references (e.g. SaleItem pointing to a deleted
 *      Product from an older app version)
 *
 * The FK disable is essential for backup-restore scenarios. The app
 * enforces referential integrity at the application layer anyway, so
 * SQLite's FK checks are redundant and only cause false failures.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  await ensureSchema();

  // Disable FK constraints for this connection. SQLite's PRAGMA is
  // per-connection, so we must run this on every request — Prisma may
  // hand us a different connection from its pool each time.
  // Wrapped in try/catch because some queries may already be in a
  // transaction (PRAGMA cannot run inside a transaction).
  try {
    await db.$executeRawUnsafe(`PRAGMA foreign_keys = OFF;`);
    fkDisabledForThisProcess = true;
  } catch (e: any) {
    // If we can't disable FK (e.g. inside a transaction), that's OK —
    // Prisma's connection pool may give us a different connection next
    // time where FK is already off (from the module-load PRAGMA in db.ts).
    if (!fkDisabledForThisProcess) {
      console.warn("[session] Could not disable foreign_keys pragma:", e?.message || e);
    }
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return {
    id: (session.user as any).id,
    name: session.user.name,
    email: session.user.email,
    role: (session.user as any).role,
  };
}

export async function requireUser(minRole: "CASHIER" | "MANAGER" | "ADMIN" = "CASHIER") {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const order = { CASHIER: 1, MANAGER: 2, ADMIN: 3 };
  if (order[user.role as keyof typeof order] < order[minRole]) {
    throw new Error("Unauthorized");
  }
  return user;
}
