"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { KeyRound, Link2, Plus, Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { ownerToasts } from "@/lib/toast";
import {
  OWNER_TYPE_OPTIONS,
  PROPERTY_OWNER_ROLE_OPTIONS,
  type OwnerType,
  type PropertyOwnerRole,
} from "@/lib/owner-types";

/**
 * The seller(s) or landlord(s) whose property this is — the client, not the
 * agent who owns the record. Agent ownership lives in <PropertyAccess />.
 */
export function PropertyOwners({
  propertyId,
  listingType,
  canManage,
}: {
  propertyId: Id<"properties">;
  listingType: "rent" | "sale";
  canManage: boolean;
}) {
  const owners = useQuery(api.owners.listForProperty, { propertyId });

  const [quickAddOpen, setQuickAddOpen] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const defaultType: OwnerType = listingType === "rent" ? "landlord" : "seller";
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [ownerType, setOwnerType] = React.useState<OwnerType>(defaultType);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [selectedExisting, setSelectedExisting] = React.useState("");
  const [linkRole, setLinkRole] = React.useState<PropertyOwnerRole>(
    listingType === "rent" ? "landlord" : "seller"
  );

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Only queried while the link dialog is open.
  const ownerSearch = useQuery(
    api.owners.list,
    linkOpen ? { q: debouncedSearch || undefined, pageSize: 25 } : "skip"
  );

  const quickAdd = useMutation(api.owners.quickAddForProperty);
  const linkExisting = useMutation(api.owners.linkToProperty);
  const unlink = useMutation(api.owners.unlinkFromProperty);

  const resetQuickAdd = () => {
    setName("");
    setPhone("");
    setEmail("");
    setOwnerType(defaultType);
    setError(null);
  };

  const handleQuickAdd = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setError("Add a phone number or an email so the owner can be reached.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await quickAdd({
        propertyId,
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        ownerType,
      });
      ownerToasts.linked(name.trim());
      setQuickAddOpen(false);
      resetQuickAdd();
    } catch (err) {
      const detail = err instanceof Error ? err.message : undefined;
      setError(detail ?? "Something went wrong.");
      ownerToasts.failed(detail);
    } finally {
      setSaving(false);
    }
  };

  const handleLink = async () => {
    if (!selectedExisting) {
      setError("Choose an owner to link.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await linkExisting({
        propertyId,
        contactId: selectedExisting as Id<"contacts">,
        role: linkRole,
      });
      const picked = ownerSearch?.items.find((o) => o._id === selectedExisting);
      ownerToasts.linked(picked?.name ?? "Owner");
      setLinkOpen(false);
      setSelectedExisting("");
      setSearch("");
    } catch (err) {
      const detail = err instanceof Error ? err.message : undefined;
      setError(detail ?? "Something went wrong.");
      ownerToasts.failed(detail);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async (linkId: Id<"propertyOwners">) => {
    try {
      await unlink({ linkId });
      ownerToasts.unlinked();
    } catch (err) {
      ownerToasts.failed(err instanceof Error ? err.message : undefined);
    }
  };

  const rows = owners ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Property owner
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            The seller or landlord this listing belongs to. Separate from the
            agent who owns the record.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="h-9 gap-2"
              onClick={() => {
                resetQuickAdd();
                setQuickAddOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New owner
            </Button>
            <Button
              variant="secondary"
              className="h-9 gap-2"
              onClick={() => {
                setError(null);
                setLinkOpen(true);
              }}
            >
              <Link2 className="h-4 w-4" />
              Link existing
            </Button>
          </div>
        )}
      </div>

      {owners === undefined ? (
        <div className="rounded-[10px] border border-border-strong p-6 text-center text-sm text-text-muted">
          Loading owners…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No owner linked"
          description={
            canManage
              ? "Add the seller or landlord so this listing shows who it belongs to."
              : "No seller or landlord has been linked to this property yet."
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row!.linkId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border-strong p-4"
            >
              <div>
                <Link
                  href={`/app/owners/${row!.contactId}`}
                  className="font-medium hover:text-primary-ink"
                >
                  {row!.name}
                </Link>
                <p className="text-sm text-text-muted">
                  {[row!.phone, row!.email].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="info">
                  {row!.role === "landlord" ? "Landlord" : "Seller"}
                </Badge>
                {canManage && (
                  <Tooltip content="Unlink from this property">
                    <Button
                      variant="secondary"
                      className="h-9 w-9 p-0"
                      aria-label={`Unlink ${row!.name}`}
                      onClick={() => handleUnlink(row!.linkId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Quick-add: create an owner and link it in one step */}
      <Modal
        open={quickAddOpen}
        title="New owner"
        description="Create the seller or landlord and link them to this property. If the phone number is already on file, that contact is marked as an owner instead of being duplicated."
        onClose={() => {
          setQuickAddOpen(false);
          resetQuickAdd();
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setQuickAddOpen(false);
                resetQuickAdd();
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleQuickAdd} disabled={saving}>
              {saving ? "Saving..." : "Add owner"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg bg-danger/10 p-4 text-sm text-danger">
              {error}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Name <span className="text-danger">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tendai Moyo"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <StaggeredDropDown
                value={ownerType}
                onChange={(val) => setOwnerType(val as OwnerType)}
                options={OWNER_TYPE_OPTIONS}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+263 77 123 4567"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@example.com"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Link an owner who already exists */}
      <Modal
        open={linkOpen}
        title="Link existing owner"
        description="Search the Owners list and link one to this property."
        onClose={() => {
          setLinkOpen(false);
          setSelectedExisting("");
          setSearch("");
          setError(null);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setLinkOpen(false);
                setSelectedExisting("");
                setSearch("");
                setError(null);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleLink} disabled={saving || !selectedExisting}>
              {saving ? "Linking..." : "Link owner"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg bg-danger/10 p-4 text-sm text-danger">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label>Search owners</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, phone, email"
            />
          </div>
          <div className="space-y-2">
            <Label>Owner</Label>
            <StaggeredDropDown
              value={selectedExisting}
              onChange={setSelectedExisting}
              searchable
              options={[
                { value: "", label: "Choose an owner…" },
                ...(ownerSearch?.items ?? []).map((o) => ({
                  value: o._id as string,
                  label: o.phone ? `${o.name} · ${o.phone}` : o.name,
                })),
              ]}
            />
            {ownerSearch && ownerSearch.items.length === 0 && (
              <p className="text-xs text-text-dim">
                No owners match. Use &ldquo;New owner&rdquo; to create one.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Role on this property</Label>
            <StaggeredDropDown
              value={linkRole}
              onChange={(val) => setLinkRole(val as PropertyOwnerRole)}
              options={PROPERTY_OWNER_ROLE_OPTIONS}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
