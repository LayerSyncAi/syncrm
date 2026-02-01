"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";

type ContactWithOwners = {
  _id: Id<"contacts">;
  name: string;
  phone: string;
  normalizedPhone: string;
  email?: string;
  company?: string;
  notes?: string;
  ownerUserIds: Id<"users">[];
  ownerNames: string[];
  createdByUserId: Id<"users">;
  createdAt: number;
  updatedAt: number;
};

const emptyContactDraft = {
  name: "",
  phone: "",
  email: "",
  company: "",
  notes: "",
  ownerUserIds: [] as Id<"users">[],
};

export default function ContactsPage() {
  const currentUser = useQuery(api.users.getMeRequired);
  const users = useQuery(api.users.listForAssignment);

  // Search/filter state with debouncing
  const [searchInput, setSearchInput] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [ownerFilter, setOwnerFilter] = React.useState<Id<"users"> | "">("");

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const contacts = useQuery(
    api.contacts.list,
    currentUser
      ? {
          q: debouncedSearch || undefined,
          ownerUserId: ownerFilter || undefined,
        }
      : "skip"
  );

  // Mutations
  const createContact = useMutation(api.contacts.create);
  const updateContact = useMutation(api.contacts.update);
  const removeContact = useMutation(api.contacts.remove);

  // Modal state
  const [selectedContact, setSelectedContact] = React.useState<ContactWithOwners | null>(null);
  const [contactDraft, setContactDraft] = React.useState(emptyContactDraft);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ContactWithOwners | null>(null);

  // Validation state
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const isAdmin = currentUser?.role === "admin";

  // Initialize draft when selecting a contact
  React.useEffect(() => {
    if (selectedContact) {
      setContactDraft({
        name: selectedContact.name,
        phone: selectedContact.phone,
        email: selectedContact.email || "",
        company: selectedContact.company || "",
        notes: selectedContact.notes || "",
        ownerUserIds: selectedContact.ownerUserIds,
      });
      setErrors({});
    }
  }, [selectedContact]);

  const closeModal = () => {
    setSelectedContact(null);
    setIsCreating(false);
    setContactDraft(emptyContactDraft);
    setErrors({});
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!contactDraft.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!contactDraft.phone.trim()) {
      newErrors.phone = "Phone is required";
    }

    if (contactDraft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactDraft.email)) {
      newErrors.email = "Invalid email format";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      if (isCreating) {
        await createContact({
          name: contactDraft.name.trim(),
          phone: contactDraft.phone.trim(),
          email: contactDraft.email.trim() || undefined,
          company: contactDraft.company.trim() || undefined,
          notes: contactDraft.notes.trim() || undefined,
          ownerUserIds: contactDraft.ownerUserIds.length > 0 ? contactDraft.ownerUserIds : undefined,
        });
      } else if (selectedContact) {
        await updateContact({
          contactId: selectedContact._id,
          name: contactDraft.name.trim(),
          phone: contactDraft.phone.trim(),
          email: contactDraft.email.trim() || undefined,
          company: contactDraft.company.trim() || undefined,
          notes: contactDraft.notes.trim() || undefined,
          ownerUserIds: contactDraft.ownerUserIds.length > 0 ? contactDraft.ownerUserIds : undefined,
        });
      }
      closeModal();
    } catch (error) {
      console.error("Failed to save contact:", error);
      setErrors({ submit: "Failed to save contact. Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeContact({ contactId: deleteTarget._id });
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete contact:", error);
    }
  };

  const toggleOwner = (userId: Id<"users">) => {
    setContactDraft((prev) => {
      const current = prev.ownerUserIds;
      if (current.includes(userId)) {
        return { ...prev, ownerUserIds: current.filter((id) => id !== userId) };
      } else {
        return { ...prev, ownerUserIds: [...current, userId] };
      }
    });
  };

  // Loading state
  if (!currentUser || !users) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Contacts</h2>
            <p className="text-sm text-text-muted">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  const userMap = new Map(users.map((user) => [user._id, user]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Contacts</h2>
          <p className="text-sm text-text-muted">
            Contacts are the people you engage, separate from property-specific leads.
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedContact(null);
            setContactDraft({
              ...emptyContactDraft,
              ownerUserIds: isAdmin ? [] : [currentUser._id],
            });
            setIsCreating(true);
          }}
        >
          + New Contact
        </Button>
      </div>

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Search</Label>
            <Input
              placeholder="Name, phone, email, company"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          {isAdmin && (
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value as Id<"users"> | "")}
              >
                <option value="">All owners</option>
                {users.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex items-end">
            <p className="text-sm text-text-muted">
              {contacts ? `${contacts.length} contact${contacts.length !== 1 ? "s" : ""}` : "Loading..."}
            </p>
          </div>
        </div>
      </div>

      <Table>
        <thead>
          <tr>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Owners</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </tr>
        </thead>
        <tbody>
          {!contacts ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-text-muted">
                Loading contacts...
              </TableCell>
            </TableRow>
          ) : contacts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-text-muted">
                {debouncedSearch || ownerFilter
                  ? "No contacts match your filters"
                  : "No contacts yet. Create one to get started."}
              </TableCell>
            </TableRow>
          ) : (
            contacts.map((contact: ContactWithOwners) => (
              <TableRow key={contact._id} className="cursor-pointer">
                <TableCell>
                  <p className="font-medium">{contact.name}</p>
                </TableCell>
                <TableCell>{contact.phone}</TableCell>
                <TableCell>{contact.email || "-"}</TableCell>
                <TableCell>{contact.company || "-"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {contact.ownerNames.slice(0, 2).map((name: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {name}
                      </Badge>
                    ))}
                    {contact.ownerNames.length > 2 && (
                      <Badge variant="secondary" className="text-xs">
                        +{contact.ownerNames.length - 2}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      className="h-9 px-3"
                      onClick={() => setSelectedContact(contact)}
                    >
                      View
                    </Button>
                    {(isAdmin || contact.ownerUserIds.includes(currentUser._id)) && (
                      <Button
                        variant="secondary"
                        className="h-9 px-3 text-red-500 hover:text-red-600"
                        onClick={() => setDeleteTarget(contact)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </tbody>
      </Table>

      {/* Create/Edit Modal */}
      <Modal
        open={Boolean(selectedContact) || isCreating}
        title={selectedContact ? `Contact: ${selectedContact.name}` : "New Contact"}
        description={
          selectedContact
            ? "Review details and make edits before saving."
            : "Add details to create a new contact."
        }
        onClose={closeModal}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : selectedContact ? "Save changes" : "Save contact"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {errors.submit && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
              {errors.submit}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={contactDraft.name}
                onChange={(e) =>
                  setContactDraft((prev) => ({ ...prev, name: e.target.value }))
                }
                className={errors.name ? "border-red-500" : ""}
              />
              {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label>Phone *</Label>
              <Input
                value={contactDraft.phone}
                onChange={(e) =>
                  setContactDraft((prev) => ({ ...prev, phone: e.target.value }))
                }
                className={errors.phone ? "border-red-500" : ""}
              />
              {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={contactDraft.email}
                onChange={(e) =>
                  setContactDraft((prev) => ({ ...prev, email: e.target.value }))
                }
                className={errors.email ? "border-red-500" : ""}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Input
                value={contactDraft.company}
                onChange={(e) =>
                  setContactDraft((prev) => ({ ...prev, company: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={contactDraft.notes}
              onChange={(e) =>
                setContactDraft((prev) => ({ ...prev, notes: e.target.value }))
              }
              rows={3}
              placeholder="Add any notes about this contact..."
            />
          </div>

          {/* Multi-owner selection for admins */}
          {isAdmin && (
            <div className="space-y-2">
              <Label>Owners (select who can see this contact)</Label>
              <div className="rounded-md border border-border-strong p-3">
                <div className="flex flex-wrap gap-2">
                  {users.map((user) => {
                    const isSelected = contactDraft.ownerUserIds.includes(user._id);
                    return (
                      <button
                        key={user._id}
                        type="button"
                        onClick={() => toggleOwner(user._id)}
                        className={`rounded-full px-3 py-1 text-sm transition-colors ${
                          isSelected
                            ? "bg-primary text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {user.name}
                        {isSelected && " ✓"}
                      </button>
                    );
                  })}
                </div>
                {contactDraft.ownerUserIds.length === 0 && (
                  <p className="mt-2 text-xs text-text-muted">
                    No owners selected. You will be assigned as the owner.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Show owners for non-admins (read only) */}
          {!isAdmin && selectedContact && (
            <div className="space-y-2">
              <Label>Owners</Label>
              <div className="flex flex-wrap gap-1">
                {selectedContact.ownerNames.map((name, i) => (
                  <Badge key={i} variant="secondary">
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Delete Contact"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Type Delete to confirm.`}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
