import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, ensureSchema } from "@/lib/db";
import { parsePermissions, type Permissions, type Permission } from "@/lib/user-permissions";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  permissions: Permissions;
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
  // v2.10.20: On Vercel, skip ensureSchema + FK pragma (no SQLite DB)
  if (process.env.VERCEL !== "1" && process.env.NEXT_PUBLIC_IS_VERCEL !== "true") {
    await ensureSchema();
    try {
      await db.$executeRawUnsafe(`PRAGMA foreign_keys = OFF;`);
      fkDisabledForThisProcess = true;
    } catch (e: any) {
      if (!fkDisabledForThisProcess) {
        console.warn("[session] Could not disable foreign_keys pragma:", e?.message || e);
      }
    }
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  // Load user's permissions from DB
  const userId = (session.user as any).id;
  const role = (session.user as any).role as string;
  let permissions: Permissions;
  try {
    const userRow = await db.user.findUnique({
      where: { id: userId },
      select: { permissions: true },
    });
    permissions = parsePermissions(userRow?.permissions, role);
  } catch {
    // If permissions column doesn't exist yet, use defaults
    permissions = parsePermissions(null, role);
  }

  return {
    id: userId,
    name: session.user.name,
    email: session.user.email,
    role: role as SessionUser["role"],
    permissions,
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

/** Check if current user has a specific permission. */
export async function checkPermission(permission: Permission): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  // Admin always has all permissions
  if (user.role === "ADMIN") return true;
  return user.permissions[permission] === true;
}

/** Require a specific permission — throws if user doesn't have it. */
export async function requirePermission(permission: Permission) {
  const has = await checkPermission(permission);
  if (!has) {
    throw new Error(`Unauthorized: missing permission ${permission}`);
  }
}
