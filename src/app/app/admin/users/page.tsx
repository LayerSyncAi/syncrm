"use client";

import { useState, useEffect } from "react";
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
import { animatedToast } from "@/components/ui/animated-toaster";
import { ESTATE_ROLES, ESTATE_ROLE_LABELS, type EstateRole } from "../../../../../convex/lib/modules";
import { getErrorMessage } from "@/lib/errors";

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

// ── Types ──────────────────────────────────────────────────

interface UserFormData {
  fullName: string;
  email: string;
  role: "admin" | "agent";
  isActive: boolean;
  estateRoles: EstateRole[];
  branchId: string;
}

const defaultFormData: UserFormData = {
  fullName: "",
  email: "",
  role: "agent",
  isActive: true,
  estateRoles: [],
  branchId: "",
};

/** A temporary password the email could not deliver, shown to the admin once. */
type UndeliveredPassword = { name: string; email: string; password: string };

type EditingUser = {
  _id: Id<"users">;
  fullName?: string;
  name?: string;
  email?: string;
  role: "admin" | "agent";
  isActive: boolean;
  timezone?: string;
  resetPasswordOnNextLogin?: boolean;
  estateRoles?: EstateRole[];
  branchId?: string;
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
  const setEstateRoles = useMutation(api.hub.adminSetEstateRoles);
  const setUserBranch = useMutation(api.users.adminSetUserBranch);
  const branches = useQuery(api.hub.listBranches);
  const branchName = (id?: string) => branches?.find((b) => b.id === id)?.name;

  // Create drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formData, setFormData] = useState<UserFormData>(defaultFormData);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit modal state
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  // SyncEstate roles being edited in the modal (saved with their own button)
  const [rolesDraft, setRolesDraft] = useState<EstateRole[]>([]);

  const [undelivered, setUndelivered] = useState<UndeliveredPassword | null>(null);

  // Row flash state: maps userId to "activate" | "deactivate"
  const [flashingRows, setFlashingRows] = useState<Map<string, "activate" | "deactivate">>(new Map());

  // Redirect non-admin users
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      router.replace("/app/hub");
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-ink" />
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

    const fullName = formData.fullName.trim();
    const email = formData.email.trim().toLowerCase();
    try {
      const result = await createUser({
        fullName,
        email,
        role: formData.role,
        isActive: formData.isActive,
        estateRoles: formData.role === "agent" ? formData.estateRoles : undefined,
        branchId: formData.branchId || undefined,
      });
      closeDrawer();
      if (result.tempPassword) {
        setUndelivered({ name: fullName, email, password: result.tempPassword });
      } else {
        animatedToast.success(`Invite emailed to ${fullName}`, {
          description: "They must choose their own password when they first sign in.",
        });
      }
    } catch (err) {
      setDrawerError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Edit modal handlers ────────────────────────────────

  const openEditModal = (u: EditingUser) => {
    setEditingUser({ ...u });
    setRolesDraft(u.estateRoles ?? []);
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

  const toggleDraftRole = (role: EstateRole) =>
    setRolesDraft((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  const toggleFormRole = (role: EstateRole) =>
    setFormData((prev) => ({
      ...prev,
      estateRoles: prev.estateRoles.includes(role)
        ? prev.estateRoles.filter((r) => r !== role)
        : [...prev.estateRoles, role],
    }));

  const handleBranchChange = async (branchId: string) => {
    if (!editingUser || (editingUser.branchId ?? "") === branchId) return;
    setIsSaving(true);
    const name = userName(editingUser);
    try {
      await setUserBranch({ userId: editingUser._id, branchId: branchId || undefined });
      setEditingUser((prev) => prev ? { ...prev, branchId: branchId || undefined } : prev);
      animatedToast.success(`Branch updated for ${name}`);
    } catch (err) {
      animatedToast.error(`Branch update failed for ${name}`, { description: getErrorMessage(err) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEstateRoles = async () => {
    if (!editingUser) return;
    setIsSaving(true);
    const name = userName(editingUser);
    try {
      await setEstateRoles({ userId: editingUser._id, roles: rolesDraft });
      setEditingUser((prev) => prev ? { ...prev, estateRoles: rolesDraft } : prev);
      animatedToast.success(`SyncEstate roles updated for ${name}`);
    } catch (err) {
      animatedToast.error(`Role update failed for ${name}`, {
        description: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const rolesDirty =
    !!editingUser &&
    (rolesDraft.length !== (editingUser.estateRoles ?? []).length ||
      rolesDraft.some((r) => !(editingUser.estateRoles ?? []).includes(r)));

  const renderEstateRoles = (u: { role: "admin" | "agent"; estateRoles?: EstateRole[] }) =>
    u.role === "admin" ? (
      <Badge variant="info">All modules</Badge>
    ) : (u.estateRoles ?? []).length === 0 ? (
      <span className="text-xs text-text-muted">No roles</span>
    ) : (
      (u.estateRoles ?? []).map((r) => (
        <Badge key={r} variant="secondary">{ESTATE_ROLE_LABELS[r]}</Badge>
      ))
    );

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
      const result = await resetUserPassword({ targetUserId: editingUser._id });
      setEditingUser((prev) => prev ? { ...prev, resetPasswordOnNextLogin: true } : prev);
      if (result.tempPassword) {
        setUndelivered({ name, email: editingUser.email ?? "", password: result.tempPassword });
      } else {
        animatedToast.success(`New temporary password emailed to ${name}`, {
          description: "They must change it when they next sign in.",
        });
      }
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

  // ── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-h1">Users</h1>
          <p className="text-sm text-text-muted">
            Invite staff, set their roles and branch, and switch access off.
          </p>
        </div>
        <Button onClick={openCreateDrawer} className="h-10 gap-2">
          <UserPlus className="h-4 w-4" />
          Invite user
        </Button>
      </div>

      {/* Table */}
      {users === undefined ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary-ink" />
        </div>
      ) : sortedUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12">
          <p className="text-sm text-text-muted mb-4">No users found</p>
          <Button onClick={openCreateDrawer}>
            <Plus className="mr-2 h-4 w-4" />
            Invite your first user
          </Button>
        </div>
      ) : (
        <div className="hidden md:block rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>SyncEstate roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-20" />
              </TableRow>
            </TableHeader>
            <motion.tbody variants={listVariants} initial="hidden" animate="show">
              {sortedUsers.map((u) => {
                const isCurrentUser = u._id === user._id;
                const flashType = flashingRows.get(u._id);
                const flashClass = flashType === "activate"
                  ? "row-flash-activate"
                  : flashType === "deactivate"
                    ? "row-flash-deactivate"
                    : "";
                return (
                  <motion.tr
                    key={u._id}
                    variants={rowVariants}
                    layout
                    className={`h-11 border-b border-[rgba(148,163,184,0.1)] transition-all duration-150 hover:bg-row-hover hover:shadow-[inset_3px_0_0_var(--primary)] ${flashClass}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-600/20 text-xs font-medium text-primary-ink">
                          {getInitials(u.fullName, u.name, u.email)}
                        </div>
                        <div>
                          <p className="font-medium">
                            {u.fullName || u.name || "Unknown"}
                            {isCurrentUser && (
                              <span className="ml-2 text-xs text-text-muted">(you)</span>
                            )}
                          </p>
                          <p className="text-xs text-text-muted">
                            <span className="capitalize">{u.role}</span>
                            {branchName(u.branchId) ? ` · ${branchName(u.branchId)}` : ""}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {u.email || "\u2014"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">{renderEstateRoles(u)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={u.isActive ? "active" : "inactive"}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                          >
                            <Badge variant={u.isActive ? "success" : "secondary"}>
                              {u.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </motion.div>
                        </AnimatePresence>
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
                  </motion.tr>
                );
              })}
            </motion.tbody>
          </Table>
        </div>
      )}

      {/* Mobile: stacked cards instead of a horizontally scrolling table */}
      {users !== undefined && sortedUsers.length > 0 && (
        <motion.div variants={listVariants} initial="hidden" animate="show" className="space-y-3 md:hidden">
          {sortedUsers.map((u) => {
            const isCurrentUser = u._id === user._id;
            return (
              <div key={u._id} className="rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-600/20 text-xs font-medium text-primary-ink">
                      {getInitials(u.fullName, u.name, u.email)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {u.fullName || u.name || "Unknown"}
                        {isCurrentUser && <span className="ml-2 text-xs text-text-muted">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-text-muted">
                        <span className="capitalize">{u.role}</span>
                        {branchName(u.branchId) ? ` · ${branchName(u.branchId)}` : ""}
                        {u.email ? ` · ${u.email}` : ""}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" aria-label="Edit user" onClick={() => openEditModal(u)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant={u.isActive ? "success" : "secondary"}>{u.isActive ? "Active" : "Inactive"}</Badge>
                  {u.resetPasswordOnNextLogin && <Badge variant="warning">Password reset pending</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">{renderEstateRoles(u)}</div>
              </div>
            );
          })}
        </motion.div>
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

            {/* SyncEstate roles */}
            <div className="space-y-2">
              <Label>SyncEstate roles</Label>
              {editingUser.role === "admin" ? (
                <p className="text-xs text-text-muted">Admins open every module and need no roles.</p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ESTATE_ROLES.map((r) => (
                      <label
                        key={r}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={rolesDraft.includes(r)}
                          onChange={() => toggleDraftRole(r)}
                          disabled={isSaving}
                          className="h-4 w-4 rounded border-border"
                        />
                        {ESTATE_ROLE_LABELS[r]}
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-text-muted">
                      Roles decide which modules an agent can open. Property manager and Accounts open SyncStay. Valuer, Signing valuer, Valuations admin and Accounts open SyncWorth. Admins open everything.
                    </p>
                    <Button size="sm" onClick={handleSaveEstateRoles} disabled={isSaving || !rolesDirty}>
                      Save roles
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Branch */}
            {branches && branches.length > 0 && (
              <div className="space-y-2">
                <Label>Branch</Label>
                <StaggeredDropDown
                  value={editingUser.branchId ?? ""}
                  onChange={(val) => handleBranchChange(val)}
                  disabled={isSaving}
                  options={[
                    { value: "", label: "No branch" },
                    ...branches.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                />
              </div>
            )}

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
                      ? "A temporary password is pending. Resetting again emails a new one and the old one stops working."
                      : "Emails them a new temporary password. They must change it when they next sign in."}
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
        title="Invite user"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDrawer}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send invite
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
            <Label className="flex items-center gap-1">Full Name <span className="text-danger">*</span></Label>
            <Input
              placeholder="John Doe"
              value={formData.fullName}
              onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1">Email <span className="text-danger">*</span></Label>
            <Input
              type="email"
              placeholder="john@agency.com"
              value={formData.email}
              onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
            />
            <p className="text-xs text-text-muted">
              They sign in with this email. We email them a temporary password, which they change on first sign-in.
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

          {formData.role === "agent" && (
            <div className="space-y-2">
              <Label>SyncEstate roles</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {ESTATE_ROLES.map((r) => (
                  <label
                    key={r}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={formData.estateRoles.includes(r)}
                      onChange={() => toggleFormRole(r)}
                      className="h-4 w-4 rounded border-border"
                    />
                    {ESTATE_ROLE_LABELS[r]}
                  </label>
                ))}
              </div>
              <p className="text-xs text-text-muted">Roles decide which modules they can open. You can change them later.</p>
            </div>
          )}

          {branches && branches.length > 0 && (
            <div className="space-y-2">
              <Label>Branch</Label>
              <StaggeredDropDown
                value={formData.branchId}
                onChange={(val) => setFormData((prev) => ({ ...prev, branchId: val }))}
                options={[
                  { value: "", label: "No branch" },
                  ...branches.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </div>
          )}

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

      {/* ── Undelivered temporary password ──────────────── */}
      <Modal
        open={!!undelivered}
        onClose={() => setUndelivered(null)}
        title="The email could not be sent"
        description={undelivered ? `Give ${undelivered.name} this temporary password yourself. It is shown only once.` : undefined}
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setUndelivered(null)}>Done</Button>
          </div>
        }
      >
        {undelivered && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-text-muted">Email</p>
              <p className="font-medium">{undelivered.email}</p>
              <p className="mt-2 text-xs text-text-muted">Temporary password</p>
              <p className="select-all font-mono text-base font-semibold">{undelivered.password}</p>
            </div>
            <p className="text-xs text-text-muted">They must choose their own password when they first sign in.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
