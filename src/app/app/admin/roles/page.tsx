"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, ColumnDef } from "@/components/ui/data-table";
import { Loader2, Shield, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import { roleToasts } from "@/lib/toast";

/* ── Spring-animated role toggle switch ───────────────── */
function RoleToggleSwitch({
  isAdmin,
  onToggle,
  disabled,
}: {
  isAdmin: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isAdmin}
      onClick={onToggle}
      disabled={disabled}
      className="relative inline-flex h-7 w-[52px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      style={{ backgroundColor: isAdmin ? "#16a34a" : "#94a3b8" }}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md"
        style={{ marginLeft: isAdmin ? 26 : 4 }}
      />
      {disabled && (
        <Loader2 className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/70" />
      )}
    </button>
  );
}

/** Element type from the adminListUsers query (extracted via api type) */
type UserRow = (typeof api.users.adminListUsers) extends { _returnType: infer R }
  ? NonNullable<R> extends (infer U)[] ? U : never
  : never;

export default function AdminRolesPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const users = useQuery(api.users.adminListUsers);
  const adminCount = useQuery(api.users.getAdminCount);
  const setUserRole = useMutation(api.users.adminSetUserRole);

  const [updatingUserId, setUpdatingUserId] = useState<Id<"users"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect non-admin users - must be in useEffect to avoid setState during render
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      router.replace("/app/dashboard");
    }
  }, [authLoading, user, router]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  // Show loading while redirect is in progress for non-admin users
  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-text-muted">Access denied. Admins only.</p>
      </div>
    );
  }

  const handleRoleChange = async (
    userId: Id<"users">,
    newRole: "admin" | "agent"
  ) => {
    setError(null);
    setUpdatingUserId(userId);
    const userName = users?.find((u) => u._id === userId)?.fullName || users?.find((u) => u._id === userId)?.name || "User";
    try {
      await setUserRole({ userId, role: newRole });
      if (newRole === "admin") {
        roleToasts.promoted(userName);
      } else {
        roleToasts.demoted(userName);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update role";
      setError(msg);
      roleToasts.changeFailed(msg);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const isLastAdmin = (userId: Id<"users">, currentRole: string) => {
    return (
      currentRole === "admin" &&
      adminCount === 1 &&
      userId === user._id
    );
  };

  const rolesColumns: ColumnDef<UserRow>[] = useMemo(
    () => [
      {
        id: "user",
        header: "User",
        searchable: true,
        accessor: (u) => u.fullName || u.name || "",
        cell: (u) => {
          const isCurrentUser = u._id === user._id;
          return (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600/20 text-xs font-medium text-primary-600">
                {(u.fullName || u.name || u.email || "U")
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </div>
              <div>
                <p className="font-medium">
                  {u.fullName || u.name || "Unknown"}
                  {isCurrentUser && (
                    <span className="ml-2 text-xs text-text-muted">
                      (you)
                    </span>
                  )}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        id: "email",
        header: "Email",
        searchable: true,
        accessor: (u) => u.email,
        cell: (u) => (
          <span className="text-text-muted">{u.email || "\u2014"}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        searchable: true,
        accessor: (u) => (u.isActive ? "Active" : "Inactive"),
        cell: (u) => (
          <Badge variant={u.isActive ? "default" : "secondary"}>
            {u.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        id: "role",
        header: "Role",
        searchable: true,
        accessor: (u) => u.role,
        cell: (u) => (
          <div className="flex items-center gap-2">
            {u.role === "admin" ? (
              <ShieldCheck className="h-4 w-4 text-amber-500" />
            ) : (
              <Shield className="h-4 w-4 text-text-muted" />
            )}
            <span
              className={
                u.role === "admin"
                  ? "font-medium text-amber-600"
                  : "text-text-muted"
              }
            >
              {u.role === "admin" ? "Admin" : "Agent"}
            </span>
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        headerClassName: "text-right",
        cellClassName: "text-right",
        cell: (u) => {
          const cannotDemote = isLastAdmin(u._id, u.role);
          return (
            <div className="flex items-center justify-end gap-3">
              <AnimatePresence mode="wait">
                <motion.span
                  key={u.role}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className={`text-xs font-medium ${u.role === "admin" ? "text-green-600" : "text-slate-400"}`}
                >
                  {u.role === "admin" ? "Admin" : "Agent"}
                </motion.span>
              </AnimatePresence>
              <RoleToggleSwitch
                isAdmin={u.role === "admin"}
                onToggle={() =>
                  handleRoleChange(
                    u._id,
                    u.role === "admin" ? "agent" : "admin"
                  )
                }
                disabled={updatingUserId === u._id || cannotDemote}
              />
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user._id, updatingUserId, adminCount]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">User Roles</h2>
          <p className="text-sm text-text-muted">
            Manage user roles and permissions
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Shield className="h-4 w-4" />
          <span>{adminCount || 0} admin{adminCount !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <p className="text-sm font-medium">All Users</p>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={rolesColumns}
            data={users ?? undefined}
            keyAccessor={(u) => u._id}
            emptyMessage="No users found."
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-500 mt-0.5" />
            <div className="text-sm text-text-muted">
              <p className="font-medium text-text mb-1">Role Permissions</p>
              <ul className="space-y-1">
                <li>
                  <strong>Admin:</strong> Full access to all features, can
                  manage users and roles
                </li>
                <li>
                  <strong>Agent:</strong> Access to leads, contacts, properties,
                  and tasks
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
