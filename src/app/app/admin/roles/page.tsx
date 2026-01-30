"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Shield, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";

export default function AdminRolesPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const users = useQuery(api.users.adminListUsers);
  const adminCount = useQuery(api.users.getAdminCount);
  const setUserRole = useMutation(api.users.adminSetUserRole);

  const [updatingUserId, setUpdatingUserId] = useState<Id<"users"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if user is admin
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    router.push("/app/dashboard");
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
    try {
      await setUserRole({ userId, role: newRole });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
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
          {users === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">
              No users found
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isCurrentUser = u._id === user._id;
                  const cannotDemote = isLastAdmin(u._id, u.role);

                  return (
                    <TableRow key={u._id}>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="text-text-muted">
                        {u.email || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={u.isActive ? "default" : "secondary"}
                        >
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="text-right">
                        {u.role === "agent" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRoleChange(u._id, "admin")}
                            disabled={updatingUserId === u._id}
                          >
                            {updatingUserId === u._id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Promote to Admin"
                            )}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRoleChange(u._id, "agent")}
                            disabled={updatingUserId === u._id || cannotDemote}
                            title={
                              cannotDemote
                                ? "Cannot demote the last admin"
                                : undefined
                            }
                          >
                            {updatingUserId === u._id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Demote to Agent"
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
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
