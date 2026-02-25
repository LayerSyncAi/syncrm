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
import { Modal } from "@/components/ui/modal";
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
  Pencil,
} from "lucide-react";
import { TIMEZONES } from "@/lib/timezones";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────

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

type EditingUser = {
  _id: Id<"users">;
  fullName?: string;
  name?: string;
  email?: string;
  role: "admin" | "agent";
  isActive: boolean;
  timezone?: string;
  resetPasswordOnNextLogin?: boolean;
};

// ── Page ───────────────────────────────────────────────────

export default function UsersPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // Convex
  const users = useQuery(api.users.adminListUsers);
  const createUser = useAction(api.users.adminCreateUser);
  const setUserActive = useMutation(api.users.adminSetUserActive);
  const setUserRole = useMutation(api.users.adminSetUserRole);
  const setUserTimezone = useMutation(api.users.adminUpdateUserTimezone);
  const resetUserPassword = useAction(api.users.adminResetUserPassword);

  // Create drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formData, setFormData] = useState<UserFormData>(defaultFormData);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit modal state
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Redirect non-admin users
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      router.replace("/app/dashboard");
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-text-muted">Access denied. Admins only.</p>
      </div>
    );
  }

  // ── Create user drawer ─────────────────────────────────

  const openCreateDrawer = () => {
    setFormData(defaultFormData);
    setDrawerError(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setFormData(defaultFormData);
    setDrawerError(null);
  };

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleCreate = async () => {
    if (!formData.fullName.trim()) { setDrawerError("Full name is required"); return; }
    if (!formData.email.trim()) { setDrawerError("Email is required"); return; }
    if (!validateEmail(formData.email.trim())) { setDrawerError("Please enter a valid email address"); return; }

    setIsSubmitting(true);
    setDrawerError(null);

    try {
      await createUser({
        fullName: formData.fullName.trim(),
        email: formData.email.trim().toLowerCase(),
        role: formData.role,
        isActive: formData.isActive,
      });
      closeDrawer();
      toast.success(`User created for ${formData.fullName.trim()}`, {
        description: "They must change their password on first login.",
      });
    } catch (err) {
      setDrawerError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Edit modal handlers ────────────────────────────────

  const openEditModal = (u: EditingUser) => {
    setEditingUser({ ...u });
    setResetConfirmOpen(false);
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setResetConfirmOpen(false);
  };

  const userName = (u: EditingUser) => u.fullName || u.name || u.email || "Unknown";

  const handleRoleChange = async (newRole: "admin" | "agent") => {
    if (!editingUser || editingUser.role === newRole) return;
    setIsSaving(true);
    const name = userName(editingUser);
    try {
      await setUserRole({ userId: editingUser._id, role: newRole });
      setEditingUser((prev) => prev ? { ...prev, role: newRole } : prev);
      toast.success(`Role changed for ${name}`, {
        description: newRole === "admin" ? "Upgraded to Admin." : "Downgraded to Agent.",
      });
    } catch (err) {
      toast.error(`Role change failed for ${name}`, {
        description: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTimezoneChange = async (timezone: string) => {
    if (!editingUser) return;
    setIsSaving(true);
    const name = userName(editingUser);
    try {
      await setUserTimezone({ userId: editingUser._id, timezone });
      setEditingUser((prev) => prev ? { ...prev, timezone } : prev);
      toast.success(`Timezone updated for ${name}`);
    } catch (err) {
      toast.error(`Timezone update failed for ${name}`, {
        description: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!editingUser) return;
    setIsSaving(true);
    const name = userName(editingUser);
    const newActive = !editingUser.isActive;
    try {
      await setUserActive({ userId: editingUser._id, isActive: newActive });
      setEditingUser((prev) => prev ? { ...prev, isActive: newActive } : prev);
      toast.success(`${newActive ? "Activated" : "Deactivated"} ${name}`);
    } catch (err) {
      toast.error(`Status change failed for ${name}`, {
        description: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!editingUser) return;
    setIsSaving(true);
    setResetConfirmOpen(false);
    const name = userName(editingUser);
    try {
      await resetUserPassword({ targetUserId: editingUser._id });
      setEditingUser((prev) => prev ? { ...prev, resetPasswordOnNextLogin: true } : prev);
      toast.success(`Password reset for ${name}`, {
        description: "User must change password on next login.",
      });
    } catch (err) {
      toast.error(`Password reset failed for ${name}`, {
        description: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────

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
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
        const nameA = a.fullName || a.name || a.email || "";
        const nameB = b.fullName || b.name || b.email || "";
        return nameA.localeCompare(nameB);
      })
    : [];

  // ── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
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

      {/* Table */}
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
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedUsers.map((u) => {
                const isCurrentUser = u._id === user._id;
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
                              <span className="ml-2 text-xs text-text-muted">(you)</span>
                            )}
                          </p>
                          <p className="text-xs text-text-muted capitalize">{u.role}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {u.email || "\u2014"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={u.isActive ? "default" : "secondary"}>
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {u.resetPasswordOnNextLogin && (
                          <Badge variant="warning">Password reset pending</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditModal(u)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Edit User Modal ─────────────────────────────── */}
      <Modal
        open={!!editingUser}
        onClose={closeEditModal}
        title={editingUser ? `Edit ${userName(editingUser)}` : "Edit User"}
        description={editingUser?.email || undefined}
      >
        {editingUser && (
          <div className="space-y-6">
            {/* Role */}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={editingUser.role}
                onChange={(e) => handleRoleChange(e.target.value as "admin" | "agent")}
                disabled={isSaving}
              >
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </Select>
              <p className="text-xs text-text-muted">
                Admins can manage users, stages, and all settings.
              </p>
            </div>

            {/* Timezone */}
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select
                value={editingUser.timezone || ""}
                onChange={(e) => handleTimezoneChange(e.target.value)}
                disabled={isSaving}
              >
                <option value="">Not set</option>
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </Select>
            </div>

            {/* Active / Inactive */}
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <p className="text-sm font-medium">Account status</p>
                <p className="text-xs text-text-muted">
                  {editingUser.isActive
                    ? "User can sign in and use the app."
                    : "User is blocked from signing in."}
                </p>
              </div>
              <Button
                variant={editingUser.isActive ? "destructive" : "primary"}
                size="sm"
                onClick={handleToggleActive}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingUser.isActive ? (
                  "Deactivate"
                ) : (
                  "Activate"
                )}
              </Button>
            </div>

            {/* Reset password */}
            {editingUser._id !== user._id && (
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Reset password</p>
                  <p className="text-xs text-text-muted">
                    {editingUser.resetPasswordOnNextLogin
                      ? "Password reset is already pending."
                      : "Set a temporary password. User must change it on next login."}
                  </p>
                </div>
                {resetConfirmOpen ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setResetConfirmOpen(false)}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleResetPassword}
                      disabled={isSaving}
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setResetConfirmOpen(true)}
                    disabled={isSaving}
                  >
                    Reset Password
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Create User Drawer ──────────────────────────── */}
      <RightDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title="Create User"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDrawer}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create User
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {drawerError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              {drawerError}
            </div>
          )}

          <div className="space-y-2">
            <Label>Full Name *</Label>
            <Input
              placeholder="John Doe"
              value={formData.fullName}
              onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Email *</Label>
            <Input
              type="email"
              placeholder="john@agency.com"
              value={formData.email}
              onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
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
                setFormData((prev) => ({ ...prev, role: e.target.value as "admin" | "agent" }))
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
              onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-border"
            />
            <div>
              <Label htmlFor="isActive" className="cursor-pointer">Active</Label>
              <p className="text-xs text-text-muted">Inactive users cannot log in</p>
            </div>
          </div>
        </div>
      </RightDrawer>
    </div>
  );
}
