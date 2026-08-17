"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, Users as UsersIcon, RefreshCw, ShieldCheck } from "lucide-react";

import type { User, Role } from "@/types";
import { toast } from "sonner";
import {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  getDefaultPermissions,
  type Permission,
} from "@/lib/user-permissions";

// Helper: get default permissions for a role (returns plain object)
function getDefaultPermissionsForRole(role: string): Record<string, boolean> {
  const perms = getDefaultPermissions(role);
  return Object.keys(perms).reduce((acc, k) => {
    acc[k] = (perms as any)[k];
    return acc;
  }, {} as Record<string, boolean>);
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* ---------- helpers ---------- */

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  CASHIER: "Cashier",
};

function roleBadgeClass(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800";
    case "MANAGER":
      return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800";
    case "CASHIER":
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800/60 dark:text-zinc-200 dark:border-zinc-700";
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return iso;
  }
}

/* ---------- form types ---------- */

interface UserFormState {
  name: string;
  email: string;
  phone: string;
  role: Role;
  password: string;
  active: boolean;
  // v2.10.6: granular permissions
  permissions: Record<string, boolean>;
}

const EMPTY_FORM: UserFormState = {
  name: "",
  email: "",
  phone: "",
  role: "CASHIER",
  password: "",
  active: true,
  permissions: {},
};

/* ---------- main view ---------- */

export function UsersView() {
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reloadTick, setReloadTick] = React.useState(0);

  // dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<User | null>(null);

  // delete state
  const [deleteTarget, setDeleteTarget] = React.useState<User | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const reload = React.useCallback(() => setReloadTick((t) => t + 1), []);

  /* fetch list */
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/users", { cache: "no-store" });
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        if (!cancelled) setUsers(data.users ?? []);
      } catch (err) {
        if (!cancelled) {
          toast.error("Failed to load users list");
          setUsers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  /* handlers */
  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setDialogOpen(true);
  };

  const handleCreated = (u: User) => {
    setUsers((prev) => [u, ...prev]);
    setDialogOpen(false);
    toast.success("User created");
  };

  const handleUpdated = (u: User) => {
    setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));
    setDialogOpen(false);
    toast.success("User updated");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "delete failed");
      }
      setUsers((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      toast.success("User deleted");
      setDeleteTarget(null);
    } catch (e) {
      toast.error("Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };

  /* ---------- render ---------- */
  return (
    <div className="space-y-6 p-4 md:p-6" dir="ltr">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <UsersIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              User Management
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Add, edit, or remove system users.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={reload}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={openCreate}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600"
          >
            <Plus className="h-4 w-4" />
            New User
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Users" value={users.length} loading={loading} />
        <StatCard
          label="Admins"
          value={users.filter((u) => u.role === "ADMIN").length}
          loading={loading}
          accent="emerald"
        />
        <StatCard
          label="Managers"
          value={users.filter((u) => u.role === "MANAGER").length}
          loading={loading}
          accent="amber"
        />
        <StatCard
          label="Cashiers"
          value={users.filter((u) => u.role === "CASHIER").length}
          loading={loading}
          accent="zinc"
        />
      </div>

      {/* Table card */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-foreground">
              All Users
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {loading ? "Loading…" : `${users.length} user${users.length === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-left font-semibold">#</TableHead>
                <TableHead className="text-left font-semibold">Name</TableHead>
                <TableHead className="text-left font-semibold">Email</TableHead>
                <TableHead className="text-left font-semibold">Phone</TableHead>
                <TableHead className="text-left font-semibold">Role</TableHead>
                <TableHead className="text-left font-semibold">Status</TableHead>
                <TableHead className="text-left font-semibold">Created At</TableHead>
                <TableHead className="text-center font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell colSpan={8} className="py-3">
                      <Skeleton className="h-9 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <UsersIcon className="h-8 w-8 opacity-40" />
                      <p className="text-sm">No users found. Click the &quot;New User&quot; button above to create one.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u, idx) => (
                  <TableRow
                    key={u.id}
                    className="transition-colors hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20"
                  >
                    <TableCell className="text-muted-foreground text-xs">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {u.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.phone || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`gap-1 ${roleBadgeClass(u.role)}`}
                      >
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.active ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(u)}
                          className="h-8 w-8 p-0 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                          aria-label="Edit"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget(u)}
                          className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-100 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-950"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <UserDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
        editing={editing}
        onCreated={handleCreated}
        onUpdated={handleUpdated}
      />

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {deleteTarget?.name}
              </span>{" "}
              ({deleteTarget?.email})? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------- stat card ---------- */

function StatCard({
  label,
  value,
  loading,
  accent = "default",
}: {
  label: string;
  value: number;
  loading: boolean;
  accent?: "default" | "emerald" | "amber" | "zinc";
}) {
  const accentMap: Record<string, string> = {
    default: "text-foreground",
    emerald: "text-emerald-700 dark:text-emerald-300",
    amber: "text-amber-700 dark:text-amber-300",
    zinc: "text-zinc-700 dark:text-zinc-300",
  };
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        <p className={`mt-1 text-2xl font-bold ${accentMap[accent]}`}>{value}</p>
      )}
    </div>
  );
}

/* ---------- user create/edit dialog ---------- */

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: User | null;
  onCreated: (u: User) => void;
  onUpdated: (u: User) => void;
}

function UserDialog({
  open,
  onOpenChange,
  editing,
  onCreated,
  onUpdated,
}: UserDialogProps) {
  const isEdit = !!editing;
  const [form, setForm] = React.useState<UserFormState>(EMPTY_FORM);
  const [errors, setErrors] = React.useState<Partial<Record<keyof UserFormState, string>>>({});
  const [saving, setSaving] = React.useState(false);

  // sync form when dialog opens
  React.useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          name: editing.name,
          email: editing.email,
          phone: editing.phone || "",
          role: editing.role,
          password: "",
          active: editing.active,
          // Use stored permissions, or defaults if not set
          permissions: (editing as any).permissions || {},
        });
      } else {
        setForm({
          ...EMPTY_FORM,
          // Set default permissions for the default role (CASHIER)
          permissions: getDefaultPermissionsForRole("CASHIER"),
        });
      }
      setErrors({});
    }
  }, [open, editing]);

  // When role changes, update default permissions (only if user hasn't customized)
  const handleRoleChange = (newRole: Role) => {
    setForm((p) => ({
      ...p,
      role: newRole,
      permissions: getDefaultPermissionsForRole(newRole),
    }));
  };

  const togglePermission = (perm: string) => {
    setForm((p) => ({
      ...p,
      permissions: { ...p.permissions, [perm]: !p.permissions[perm] },
    }));
  };

  const update = <K extends keyof UserFormState>(key: K, value: UserFormState[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
    if (errors[key]) {
      setErrors((p) => ({ ...p, [key]: undefined }));
    }
  };

  const validate = (): boolean => {
    const errs: Partial<Record<keyof UserFormState, string>> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      errs.email = "Please enter a valid email";
    if (!isEdit && !form.password) errs.password = "Password is required (min 6 chars)";
    else if (form.password && form.password.length < 6)
      errs.password = "Password must be at least 6 characters";

    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Please fix the form errors");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      role: form.role,
      active: form.active,
      // v2.10.6: send granular permissions
      permissions: form.permissions,
    };
    if (form.password) payload.password = form.password;

    try {
      const url = isEdit ? `/api/users/${editing!.id}` : "/api/users";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "request failed");
      }

      const user = data.user as User;
      if (isEdit) onUpdated(user);
      else onCreated(user);
    } catch (err) {
      toast.error(
        isEdit ? "Failed to update user" : "Failed to create user"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]" dir="ltr">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <UsersIcon className="h-4 w-4" />
            </span>
            {isEdit ? "Edit User" : "Add User"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the user details. Leave the password blank to keep the existing one."
              : "Fill in all required fields to create a new user."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="u-name">
                Full Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="u-name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="e.g. John Doe"
                disabled={saving}
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <p className="text-xs text-rose-500">{errors.name}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="u-email">
                Email <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="u-email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder="example@pos.local"
                disabled={saving}
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <p className="text-xs text-rose-500">{errors.email}</p>
              )}
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="u-phone">Phone</Label>
              <Input
                id="u-phone"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                placeholder="0300-1234567"
                disabled={saving}
              />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <Label htmlFor="u-role">
                Role <span className="text-rose-500">*</span>
              </Label>
              <Select
                value={form.role}
                onValueChange={(v) => handleRoleChange(v as Role)}
                disabled={saving}
              >
                <SelectTrigger id="u-role" className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="CASHIER">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Password */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="u-pass">
                Password{" "}
                {isEdit ? (
                  <span className="text-xs text-muted-foreground">
                    (leave blank to keep the existing password)
                  </span>
                ) : (
                  <span className="text-rose-500">*</span>
                )}
              </Label>
              <Input
                id="u-pass"
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder={isEdit ? "New password (optional)" : "Min 6 characters"}
                disabled={saving}
                aria-invalid={!!errors.password}
              />
              {errors.password && (
                <p className="text-xs text-rose-500">{errors.password}</p>
              )}
            </div>

            {/* ─── Granular Permissions (v2.10.6) ───────────────────────── */}
            {form.role !== "ADMIN" && (
              <div className="sm:col-span-2 space-y-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <Label className="text-sm font-semibold">Permissions</Label>
                  <span className="text-xs text-muted-foreground">
                    (Admins get all permissions automatically)
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Customize what this user can access. Changing the role above
                  resets these to default for that role.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ALL_PERMISSIONS.map((perm: Permission) => {
                    const info = PERMISSION_LABELS[perm];
                    const value = form.permissions[perm] ?? false;
                    return (
                      <label
                        key={perm}
                        className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                          value
                            ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={() => togglePermission(perm)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{info.label}</div>
                          <div className="text-xs text-muted-foreground">{info.description}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active toggle */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 sm:col-span-2">
              <div>
                <Label htmlFor="u-active" className="cursor-pointer">
                  Active Status
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Inactive users cannot log in to the system.
                </p>
              </div>
              <Switch
                id="u-active"
                checked={form.active}
                onCheckedChange={(v) => update("active", v)}
                disabled={saving}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600"
            >
              {saving
                ? isEdit
                  ? "Saving…"
                  : "Creating…"
                : isEdit
                ? "Save Changes"
                : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default UsersView;
