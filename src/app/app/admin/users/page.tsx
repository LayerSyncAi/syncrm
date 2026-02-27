"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useAction } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RightDrawer } from "@/components/common/right-drawer";
import { Input } from "@/components/ui/input";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { DataTable, ColumnDef } from "@/components/ui/data-table";
import {
  Loader2,
  Plus,
  AlertTriangle,
  UserPlus,
  Pencil,
} from "lucide-react";
import { TIMEZONES } from "@/lib/timezones";
import { animatedToast } from "@/components/ui/animated-toaster";

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

  // Row flash state: maps userId to "activate" | "deactivate"
  const [flashingRows, setFlashingRows] = useState<Map<string, "activate" | "deactivate">>(new Map());

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
      animatedToast.success(`User created for ${formData.fullName.trim()}`, {
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
      animatedToast.success(`Role changed for ${name}`, {
        description: newRole === "admin" ? "Upgraded to Admin." : "Downgraded to Agent.",
      });
    } catch (err) {
      animatedToast.error(`Role change failed for ${name}`, {
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
      animatedToast.success(`Timezone updated for ${name}`);
    } catch (err) {
      animatedToast.error(`Timezone update failed for ${name}`, {
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
      // Trigger row flash
      const userId = editingUser._id;
      setFlashingRows((prev) => {
        const next = new Map(prev);
        next.set(userId, newActive ? "activate" : "deactivate");
        return next;
      });
      setTimeout(() => {
        setFlashingRows((prev) => {
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
      }, 1000);
      animatedToast.success(`${newActive ? "Activated" : "Deactivated"} ${name}`);
    } catch (err) {
      animatedToast.error(`Status change failed for ${name}`, {
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
      animatedToast.success(`Password reset for ${name}`, {
        description: "User must change password on next login.",
      });
    } catch (err) {
      animatedToast.error(`Password reset failed for ${name}`, {
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

  type UserRow = (typeof sortedUsers)[number];

  // eslint-disable-next-line react-hooks/exhaustive-deps -- user._id is stable for the session
  const usersColumns: ColumnDef<UserRow>[] = useMemo(
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
          );
        },
      },
      {
        id: "email",
        header: "Email",
        searchable: true,
        accessor: (u) => u.email || "",
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
          <div className="flex items-center gap-2">
            <AnimatePresence mode="wait">
              <motion.div
                key={u.isActive ? "active" : "inactive"}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <Badge variant={u.isActive ? "default" : "secondary"}>
                  {u.isActive ? "Active" : "Inactive"}
                </Badge>
              </motion.div>
            </AnimatePresence>
            {u.resetPasswordOnNextLogin && (
              <Badge variant="warning">Password reset pending</Badge>
            )}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        headerClassName: "text-right w-20",
        cellClassName: "text-right",
        cell: (u) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditModal(u)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [user._id],
  );

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
        <button
          onClick={openCreateDrawer}
          className="group flex h-10 items-center gap-2 rounded-full bg-border pl-3 pr-4 transition-all duration-300 ease-in-out hover:bg-primary hover:pl-2 hover:text-white active:bg-primary-600"
        >
          <span className="flex items-center justify-center overflow-hidden rounded-full bg-primary p-1 text-white transition-all duration-300 group-hover:bg-white">
            <UserPlus className="h-0 w-0 transition-all duration-300 group-hover:h-4 group-hover:w-4 group-hover:text-primary" />
          </span>
          <span className="text-sm font-medium">Create user</span>
        </button>
      </div>

      {/* Table */}
      <DataTable
        columns={usersColumns}
        data={sortedUsers.length > 0 ? sortedUsers : undefined}
        loading={users === undefined}
        keyAccessor={(u) => u._id}
        emptyMessage="No users found."
        emptyAction={
          <Button onClick={openCreateDrawer}>
            <Plus className="mr-2 h-4 w-4" />
            Create your first user
          </Button>
        }
        rowClassName={
          flashingRows.size > 0 ? undefined : undefined
        }
      />

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
              <StaggeredDropDown
                value={editingUser.role}
                onChange={(val) => handleRoleChange(val as "admin" | "agent")}
                disabled={isSaving}
                options={[
                  { value: "agent", label: "Agent" },
                  { value: "admin", label: "Admin" },
                ]}
              />
              <p className="text-xs text-text-muted">
                Admins can manage users, stages, and all settings.
              </p>
            </div>

            {/* Timezone */}
            <div className="space-y-2">
              <Label>Timezone</Label>
              <StaggeredDropDown
                value={editingUser.timezone || ""}
                onChange={(val) => handleTimezoneChange(val)}
                disabled={isSaving}
                placeholder="Not set"
                maxHeight={320}
                options={[
                  { value: "", label: "Not set" },
                  ...TIMEZONES.map((tz) => ({ value: tz.value, label: tz.label })),
                ]}
              />
            </div>

            {/* Active / Inactive with morph animation */}
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Account status</p>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={editingUser.isActive ? "active" : "inactive"}
                        initial={{ scale: 0.7, opacity: 0, y: 4 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.7, opacity: 0, y: -4 }}
                        transition={{ type: "spring", stiffness: 400, damping: 22 }}
                      >
                        <Badge variant={editingUser.isActive ? "success" : "danger"}>
                          {editingUser.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    {editingUser.isActive
                      ? "User can sign in and use the app."
                      : "User is blocked from signing in."}
                  </p>
                </div>
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
            <StaggeredDropDown
              value={formData.role}
              onChange={(val) =>
                setFormData((prev) => ({ ...prev, role: val as "admin" | "agent" }))
              }
              options={[
                { value: "agent", label: "Agent" },
                { value: "admin", label: "Admin" },
              ]}
            />
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
