"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { motion } from "framer-motion";
import { Eye, Mail, Phone, Plus, Settings, Trash2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { PaginationControls } from "@/components/ui/pagination";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";
import { usePagination } from "@/hooks/usePagination";
import { useRequireAuth } from "@/hooks/useAuth";
import { ownerToasts } from "@/lib/toast";
import {
  OWNER_TYPE_OPTIONS,
  ownerTypeLabel,
  type OwnerType,
} from "@/lib/owner-types";

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

type Owner = {
  _id: Id<"contacts">;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  notes?: string;
  ownerType?: OwnerType;
  ownerNames: string[];
  propertyCount: number;
  alsoBuyerTenant: boolean;
};

const EMPTY_FORM = {
  name: "",
  phone: "",
  email: "",
  company: "",
  notes: "",
  ownerType: "seller" as OwnerType,
};

export default function OwnersPage() {
  const router = useRouter();
  const { isLoading: authLoading } = useRequireAuth();
  const pagination = usePagination(25);

  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<OwnerType | "">("");

  const [isCreating, setIsCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Owner | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Owner | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      pagination.resetPage();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const result = useQuery(api.owners.list, {
    q: debouncedSearch || undefined,
    ownerType: typeFilter || undefined,
    page: pagination.page > 0 ? pagination.page : undefined,
    pageSize: pagination.pageSize !== 50 ? pagination.pageSize : undefined,
  });

  const createOwner = useMutation(api.owners.create);
  const updateOwner = useMutation(api.owners.update);
  const removeOwner = useMutation(api.owners.remove);

  const owners = (result?.items ?? []) as Owner[];
  const totalCount = result?.totalCount ?? 0;

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsCreating(true);
  };

  const openEdit = (owner: Owner) => {
    setForm({
      name: owner.name,
      phone: owner.phone ?? "",
      email: owner.email ?? "",
      company: owner.company ?? "",
      notes: owner.notes ?? "",
      ownerType: owner.ownerType ?? "seller",
    });
    setFormError(null);
    setEditing(owner);
  };

  const closeModal = () => {
    setIsCreating(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!form.phone.trim() && !form.email.trim()) {
      setFormError("Add a phone number or an email so the owner can be reached.");
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateOwner({
          ownerId: editing._id,
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          company: form.company.trim() || undefined,
          notes: form.notes.trim() || undefined,
          ownerType: form.ownerType,
        });
        ownerToasts.updated(form.name.trim());
      } else {
        const res = await createOwner({
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          company: form.company.trim() || undefined,
          notes: form.notes.trim() || undefined,
          ownerType: form.ownerType,
        });
        if (res.promotedExisting) ownerToasts.promoted(form.name.trim());
        else ownerToasts.created(form.name.trim());
      }
      closeModal();
    } catch (error) {
      const detail = error instanceof Error ? error.message : undefined;
      setFormError(detail ?? "Something went wrong.");
      ownerToasts.failed(detail);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await removeOwner({ ownerId: deleteTarget._id });
      ownerToasts.removed(deleteTarget.name, res.deletedContact);
    } catch (error) {
      ownerToasts.failed(error instanceof Error ? error.message : undefined);
    } finally {
      setDeleteTarget(null);
    }
  };

  if (authLoading) return <ListSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-h1">Owners</h1>
          <p className="text-sm text-text-muted">
            The sellers and landlords whose property you represent — the other
            side of the pipeline from Contacts.
          </p>
        </div>
        <Button onClick={openCreate} className="h-10 gap-2">
          <Plus className="h-4 w-4" />
          New Owner
        </Button>
      </div>

      <div className="rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Search</Label>
            <Input
              placeholder="Name, phone, email, company"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <StaggeredDropDown
              value={typeFilter}
              onChange={(val) => {
                setTypeFilter(val as OwnerType | "");
                pagination.resetPage();
              }}
              options={[{ value: "", label: "All types" }, ...OWNER_TYPE_OPTIONS]}
            />
          </div>
          <div className="flex items-end">
            <p className="text-sm text-text-muted">
              {result
                ? `${totalCount} owner${totalCount !== 1 ? "s" : ""}`
                : "Loading..."}
            </p>
          </div>
        </div>
      </div>

      {result === undefined ? (
        <ListSkeleton />
      ) : owners.length === 0 ? (
        <EmptyState
          icon={Plus}
          title={debouncedSearch || typeFilter ? "No matching owners" : "No owners yet"}
          description={
            debouncedSearch || typeFilter
              ? "Try a different search or clear the type filter."
              : "Add the sellers and landlords you work with, or create one directly from a property's Owner tab."
          }
          action={
            !debouncedSearch && !typeFilter ? (
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                New Owner
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <thead>
                <tr>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Properties</TableHead>
                  <TableHead>Assigned agent</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </tr>
              </thead>
              <tbody>
                {owners.map((owner) => (
                  <TableRow key={owner._id}>
                    <TableCell>
                      <div className="font-medium">{owner.name}</div>
                      {owner.alsoBuyerTenant && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          Also a buyer/tenant
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="info">{ownerTypeLabel(owner.ownerType)}</Badge>
                    </TableCell>
                    <TableCell>{owner.phone || "-"}</TableCell>
                    <TableCell>{owner.email || "-"}</TableCell>
                    <TableCell>{owner.propertyCount}</TableCell>
                    <TableCell className="text-sm text-text-muted">
                      {owner.ownerNames.join(", ") || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Tooltip content="View owner">
                          <Button
                            variant="secondary"
                            className="h-9 w-9 p-0"
                            aria-label={`View ${owner.name}`}
                            onClick={() => router.push(`/app/owners/${owner._id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Edit owner">
                          <Button
                            variant="secondary"
                            className="h-9 w-9 p-0"
                            aria-label={`Edit ${owner.name}`}
                            onClick={() => openEdit(owner)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Remove owner">
                          <Button
                            variant="secondary"
                            className="h-9 w-9 p-0"
                            aria-label={`Remove ${owner.name}`}
                            onClick={() => setDeleteTarget(owner)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>

          {/* Mobile cards */}
          <motion.div
            variants={listVariants}
            initial="hidden"
            animate="show"
            className="space-y-3 md:hidden"
          >
            {owners.map((owner) => (
              <motion.div
                key={owner._id}
                variants={rowVariants}
                className="rounded-[20px] border border-border bg-card-bg shadow-[var(--shadow-card)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{owner.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge variant="info">{ownerTypeLabel(owner.ownerType)}</Badge>
                      <span className="text-xs text-text-muted">
                        {owner.propertyCount} propert
                        {owner.propertyCount === 1 ? "y" : "ies"}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="secondary"
                      className="h-9 w-9 p-0"
                      aria-label={`View ${owner.name}`}
                      onClick={() => router.push(`/app/owners/${owner._id}`)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-9 w-9 p-0"
                      aria-label={`Edit ${owner.name}`}
                      onClick={() => openEdit(owner)}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-sm text-text-muted">
                  {owner.phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5" />
                      {owner.phone}
                    </p>
                  )}
                  {owner.email && (
                    <p className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5" />
                      {owner.email}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>

          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalCount={totalCount}
            hasMore={result?.hasMore ?? false}
            onNextPage={pagination.nextPage}
            onPrevPage={pagination.prevPage}
            onGoToPage={pagination.goToPage}
            onPageSizeChange={pagination.setPageSize}
          />
        </>
      )}

      <Modal
        open={isCreating || Boolean(editing)}
        title={editing ? `Owner: ${editing.name}` : "New Owner"}
        description={
          editing
            ? "Review details and make edits before saving."
            : "Add a seller or landlord. If the phone number already belongs to a contact, that person is marked as an owner instead of being duplicated."
        }
        onClose={closeModal}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : editing ? "Save changes" : "Save owner"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg bg-danger/10 p-4 text-sm text-danger">
              {formError}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Name <span className="text-danger">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Tendai Moyo"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <StaggeredDropDown
                value={form.ownerType}
                onChange={(val) => setForm({ ...form, ownerType: val as OwnerType })}
                options={OWNER_TYPE_OPTIONS}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+263 77 123 4567"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="owner@example.com"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Company</Label>
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="Optional — for corporate landlords"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Mandate terms, preferred contact times, anything worth remembering."
            />
          </div>

          {editing?.alsoBuyerTenant && (
            <p className="text-xs text-text-dim">
              This person is also a buyer/tenant, so they appear under Contacts
              as well. Removing the owner role here keeps their contact record
              and lead history.
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Remove Owner"
        description={
          deleteTarget?.alsoBuyerTenant
            ? `"${deleteTarget?.name}" is also a buyer/tenant, so their contact record and lead history are kept — only the owner role and property links are removed. Type Delete to confirm.`
            : `Are you sure you want to delete "${deleteTarget?.name}"? Their property links will be removed. Type Delete to confirm.`
        }
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
