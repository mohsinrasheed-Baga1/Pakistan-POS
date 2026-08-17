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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  const role = body.role || "CASHIER";
  const data: any = {
    name: body.name,
    phone: body.phone || null,
    role,
    active: body.active !== false,
  };

  // Update permissions if provided
  if (body.permissions && typeof body.permissions === "object") {
    const perms: Permissions = { ...getDefaultPermissions(role), ...body.permissions };
    data.permissions = serializePermissions(perms);
  }

  if (body.password && body.password.length > 0) {
    data.password = await bcrypt.hash(body.password, 10);
  }

  const updated = await db.user.update({
    where: { id },
    data,
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
      ...updated,
      permissions: parsePermissions(updated.permissions, updated.role),
    },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id } = await params;
  if (id === user.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }
  await db.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
