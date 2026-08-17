import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import bcrypt from "bcryptjs";
import {
  getDefaultPermissions,
  parsePermissions,
  serializePermissions,
  type Permissions,
} from "@/lib/user-permissions";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      active: true,
      permissions: true,
      createdAt: true,
    },
  });
  // Parse permissions for each user (so frontend gets object, not JSON string)
  const usersWithParsedPermissions = users.map((u) => ({
    ...u,
    permissions: parsePermissions(u.permissions, u.role),
  }));
  return NextResponse.json({ users: usersWithParsedPermissions });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = await req.json();
  const email = body.email?.toLowerCase().trim();
  if (!email || !body.name || !body.password) {
    return NextResponse.json({ error: "Fill all required fields" }, { status: 400 });
  }
  const dup = await db.user.findUnique({ where: { email } });
  if (dup) {
    return NextResponse.json({ error: "Email already exists" }, { status: 400 });
  }
  const hash = await bcrypt.hash(body.password, 10);
  const role = body.role || "CASHIER";

  // Get permissions from request body, or use defaults for the role
  let permissions: Permissions;
  if (body.permissions && typeof body.permissions === "object") {
    permissions = { ...getDefaultPermissions(role), ...body.permissions };
  } else {
    permissions = getDefaultPermissions(role);
  }

  const created = await db.user.create({
    data: {
      email,
      name: body.name,
      password: hash,
      phone: body.phone || null,
      role,
      active: body.active !== false,
      permissions: serializePermissions(permissions),
    },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      active: true,
      permissions: true,
      createdAt: true,
    },
  });
  return NextResponse.json({
    user: {
      ...created,
      permissions: parsePermissions(created.permissions, created.role),
    },
  });
}
