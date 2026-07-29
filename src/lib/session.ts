import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ensureSchema } from "@/lib/db";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: "ADMIN" | "MANAGER" | "CASHIER";
};

/**
 * Get the current authenticated user. CRITICAL: this also awaits
 * `ensureSchema()` before returning, so that any API route that uses
 * `getSessionUser()` is guaranteed to see a fully-upgraded database —
 * even the very first request after a fresh install or version upgrade.
 *
 * Without this await, the following race condition caused the Vendors,
 * LoadBill, and Cards pages to fail loading on v2.7.32:
 *   1. App launches → ensureSchema() starts running (async, fire-and-forget)
 *   2. First API request arrives immediately
 *   3. Prisma tries to query Vendor (with _count: products) but
 *      Product.vendorId column doesn't exist yet
 *   4. Request fails with "column main.Product.vendorId does not exist"
 *
 * Now, by awaiting ensureSchema() inside getSessionUser(), every API route
 * that calls getSessionUser() will block until the schema is fully upgraded.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  await ensureSchema();
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
