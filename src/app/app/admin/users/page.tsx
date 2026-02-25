"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RightDrawer } from "@/components/common/right-drawer";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Plus,
  AlertTriangle,
  UserPlus,
  Shield,
  ShieldCheck,
  KeyRound,
  CheckCircle,
} from "lucide-react";
import { TIMEZONES } from "@/lib/timezones";

interface UserFormData {
  fullName: string;
  email: string;
  role: "admin" | "agent";
  isActive: boolean;
}

const defaultFormData: UserFormData = {
  fullName: "",
  email: "",
  role: "agent",
  isActive: true,
};

export default function UsersPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // Convex queries and mutations
  const users = useQuery(api.users.adminListUsers);
  const createUser = useAction(api.users.adminCreateUser);
  const setUserActive = useMutation(api.users.adminSetUserActive);
  const setUserRole = useMutation(api.users.adminSetUserRole);
  const setUserTimezone = useMutation(api.users.adminUpdateUserTimezone);
  const resetUserPassword = useAction(api.users.adminResetUserPassword);

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formData, setFormData] = useState<UserFormData>(defaultFormData);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<Id<"users"> | null>(null);
  const [resetConfirmUserId, setResetConfirmUserId] = useState<Id<"users"> | null>(null);
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<Id<"users"> | null>(null);

  // Redirect non-admin users
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      router.replace("/app/dashboard");
    }
  }, [authLoading, user, router]);

  // Auto-clear success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  // Access denied for non-admins
  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-text-muted">Access denied. Admins only.</p>
      </div>
    );
  }

  const openCreateDrawer = () => {
    setFormData(defaultFormData);
    setError(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setFormData(defaultFormData);
    setError(null);
  };

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleSubmit = async () => {
    if (!formData.fullName.trim()) {
      setError("Full name is required");
      return;
    }

    if (!formData.email.trim()) {
      setError("Email is required");
      return;
    }

    if (!validateEmail(formData.email.trim())) {
      setError("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createUser({
        fullName: formData.fullName.trim(),
        email: formData.email.trim().toLowerCase(),
        role: formData.role,
        isActive: formData.isActive,
      });
      closeDrawer();
      setSuccessMessage("User created. They must change their password on first login.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (userId: Id<"users">, currentlyActive: boolean) => {
    setUpdatingUserId(userId);
    setError(null);

    try {
      await setUserActive({
        userId,
        isActive: !currentlyActive,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user status");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleRoleChange = async (userId: Id<"users">, newRole: "admin" | "agent") => {
    setUpdatingUserId(userId);
    setError(null);

    try {
      await setUserRole({
        userId,
        role: newRole,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user role");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleTimezoneChange = async (userId: Id<"users">, timezone: string) => {
    setUpdatingUserId(userId);
    setError(null);

    try {
      await setUserTimezone({ userId, timezone });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update timezone");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleResetPassword = async (userId: Id<"users">) => {
    setResettingPasswordUserId(userId);
    setError(null);
    setResetConfirmUserId(null);

    try {
      await resetUserPassword({ targetUserId: userId });
      setSuccessMessage("Password reset. User must change password on next login.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setResettingPasswordUserId(null);
    }
  };

  const getInitials = (fullName?: string, name?: string, email?: string) => {
    const displayName = fullName || name || email || "U";
    return displayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const sortedUsers = users
    ? [...users].sort((a, b) => {
        // Sort admins first, then by name
        if (a.role !== b.role) {
          return a.role === "admin" ? -1 : 1;
        }
        const nameA = a.fullName || a.name || a.email || "";
        const nameB = b.fullName || b.name || b.email || "";
        return nameA.localeCompare(nameB);
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm text-text-muted">
            Manage user accounts, roles, and access.
          </p>
        </div>
        <Button onClick={openCreateDrawer}>
          <UserPlus className="mr-2 h-4 w-4" />
          Create user
        </Button>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="h-4 w-4" />
          {successMessage}
          <button
            onClick={() => setSuccessMessage(null)}
            className="ml-auto text-green-400 hover:text-green-600"
          >
            &times;
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertTriangle className="h-4 w-4" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            &times;
          </button>
        </div>
      )}

      {users === undefined ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      ) : sortedUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12">
          <p className="text-sm text-text-muted mb-4">No users found</p>
          <Button onClick={openCreateDrawer}>
            <Plus className="mr-2 h-4 w-4" />
            Create your first user
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.map((u) => {
                const isCurrentUser = u._id === user._id;
                const isUpdating = updatingUserId === u._id;
                const isResetting = resettingPasswordUserId === u._id;

                return (
                  <TableRow key={u._id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-600/20 text-xs font-medium text-primary-600">
                          {getInitials(u.fullName, u.name, u.email)}
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
                          {u.resetPasswordOnNextLogin && (
                            <span className="text-xs text-amber-600">
                              Pending password change
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {u.email || "\u2014"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {u.role === "admin" ? (
                          <ShieldCheck className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Shield className="h-4 w-4 text-text-muted" />
                        )}
                        <Select
                          value={u.role}
                          onChange={(e) =>
                            handleRoleChange(
                              u._id,
                              e.target.value as "admin" | "agent"
                            )
                          }
                          disabled={isUpdating}
                          className="w-24"
                        >
                          <option value="agent">Agent</option>
                          <option value="admin">Admin</option>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.timezone || ""}
                        onChange={(e) =>
                          handleTimezoneChange(u._id, e.target.value)
                        }
                        disabled={isUpdating}
                        className="w-44 text-xs"
                      >
                        <option value="">Not set</option>
                        {TIMEZONES.map((tz) => (
                          <option key={tz.value} value={tz.value}>
                            {tz.label}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? "default" : "secondary"}>
                        {u.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setResetConfirmUserId(u._id)}
                            disabled={isResetting || isUpdating}
                            title="Reset password"
                          >
                            {isResetting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <KeyRound className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant={u.isActive ? "ghost" : "secondary"}
                          size="sm"
                          onClick={() => handleToggleActive(u._id, u.isActive)}
                          disabled={isUpdating}
                        >
                          {isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : u.isActive ? (
                            "Disable"
                          ) : (
                            "Enable"
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Reset Password Confirmation Dialog */}
      {resetConfirmUserId && (
        <ResetPasswordConfirmDialog
          userName={
            (() => {
              const u = sortedUsers.find((u) => u._id === resetConfirmUserId);
              return u?.fullName || u?.name || u?.email || "this user";
            })()
          }
          onConfirm={() => handleResetPassword(resetConfirmUserId)}
          onCancel={() => setResetConfirmUserId(null)}
        />
      )}

      {/* Create User Drawer */}
      <RightDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title="Create User"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDrawer}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Create User
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && drawerOpen && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label>Full Name *</Label>
            <Input
              placeholder="John Doe"
              value={formData.fullName}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, fullName: e.target.value }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Email *</Label>
            <Input
              type="email"
              placeholder="john@agency.com"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
            />
            <p className="text-xs text-text-muted">
              This email will be used for login. A temporary password will be assigned.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={formData.role}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  role: e.target.value as "admin" | "agent",
                }))
              }
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </Select>
            <p className="text-xs text-text-muted">
              Admins can manage users, stages, and all settings
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border p-4">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  isActive: e.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-border"
            />
            <div>
              <Label htmlFor="isActive" className="cursor-pointer">
                Active
              </Label>
              <p className="text-xs text-text-muted">
                Inactive users cannot log in
              </p>
            </div>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}

function ResetPasswordConfirmDialog({
  userName,
  onConfirm,
  onCancel,
}: {
  userName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
        role="presentation"
      />
      <div className="relative z-10 w-full max-w-md rounded-[12px] border border-border-strong bg-card-bg p-5 shadow-[0_10px_28px_rgba(0,0,0,0.32)]">
        <div className="space-y-2">
          <h3 className="text-base font-semibold">Reset Password</h3>
          <p className="text-sm text-text-muted">
            Reset the password for <strong>{userName}</strong>? Their password
            will be set to a temporary value and they will be required to change
            it on their next login.
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            Reset Password
          </Button>
        </div>
      </div>
    </div>
  );
}
