"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { motion } from "framer-motion";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { StaggeredDropDown } from "@/components/ui/staggered-dropdown";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PaginationControls } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/usePagination";
import { ConfirmDeleteDialog } from "@/components/common/confirm-delete-dialog";
import { contactToasts } from "@/lib/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Settings, Trash2 } from "lucide-react";

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
} as const;

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

interface FieldState {
  value: string;
  touched: boolean;
  error?: string;
}

const createEmptyFieldState = (value: string = ""): FieldState => ({
  value,
  touched: false,
  error: undefined,
});

const ContactTableRow = React.memo(function ContactTableRow({
  contact,
  isAdmin,
  currentUserId,
  onEdit,
  onDelete,
}: {
  contact: ContactWithOwners;
  isAdmin: boolean;
  currentUserId: Id<"users">;
  onEdit: (contact: ContactWithOwners) => void;
  onDelete: (contact: ContactWithOwners) => void;
}) {
  return (
    <motion.tr
      variants={rowVariants}
      className="group h-11 cursor-pointer border-b border-[rgba(148,163,184,0.1)] transition-all duration-150 hover:bg-row-hover hover:shadow-[inset_3px_0_0_var(--primary)]"
    >
      <TableCell>
        <p className="font-medium">{contact.name}</p>
      </TableCell>
      <TableCell>{contact.phone}</TableCell>
      <TableCell>{contact.email || "-"}</TableCell>
      <TableCell>{contact.company || "-"}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {contact.ownerNames.slice(0, 2).map((ownerName: string, i: number) => (
            <Badge key={i} variant="secondary" className="text-xs">{ownerName}</Badge>
          ))}
          {contact.ownerNames.length > 2 && (
            <Badge variant="secondary" className="text-xs">+{contact.ownerNames.length - 2}</Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1.5">
          {contact.phone && (
            <Tooltip content="Call">
              <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()}>
                <Button variant="secondary" className="action-btn h-9 w-9 p-0 opacity-0 translate-x-3 scale-90 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-200 ease-out" style={{ transitionDelay: "0ms" }}>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" /></svg>
                </Button>
              </a>
            </Tooltip>
          )}
          {contact.email && (
            <Tooltip content="Email">
              <a href={`mailto:${contact.email}`} onClick={(e) => e.stopPropagation()}>
                <Button variant="secondary" className="action-btn h-9 w-9 p-0 opacity-0 translate-x-3 scale-90 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-200 ease-out" style={{ transitionDelay: "50ms" }}>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" /><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" /></svg>
                </Button>
              </a>
            </Tooltip>
          )}
          <Tooltip content="Edit">
            <Button variant="secondary" className="action-btn h-9 w-9 p-0 opacity-0 translate-x-3 scale-90 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-200 ease-out" style={{ transitionDelay: "100ms" }} onClick={() => onEdit(contact)}>
              <Settings className="h-4 w-4" />
            </Button>
          </Tooltip>
          {(isAdmin || contact.ownerUserIds.includes(currentUserId)) && (
            <Tooltip content="Delete">
              <Button variant="secondary" className="action-btn-danger h-9 w-9 p-0 text-red-500 opacity-0 translate-x-3 scale-90 group-hover:opacity-100 group-hover:translate-x-0 group-hover:scale-100 transition-all duration-200 ease-out" style={{ transitionDelay: "150ms" }} onClick={() => onDelete(contact)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}
        </div>
      </TableCell>
    </motion.tr>
  );
});

export default function ContactsPage() {
  const currentUser = useQuery(api.users.getMeRequired);
  const users = useQuery(api.users.listForAssignment);
  const pagination = usePagination(50);

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

  const contactsResult = useQuery(
    api.contacts.list,
    currentUser
      ? {
          q: debouncedSearch || undefined,
          ownerUserId: ownerFilter || undefined,
          page: pagination.page > 0 ? pagination.page : undefined,
          pageSize: pagination.pageSize !== 50 ? pagination.pageSize : undefined,
        }
      : "skip"
  );

  // Support both paginated {items, totalCount} and legacy array format
  const contacts: ContactWithOwners[] | undefined = React.useMemo(() => {
    if (!contactsResult) return undefined;
    return (contactsResult as any).items ?? (Array.isArray(contactsResult) ? contactsResult : []);
  }, [contactsResult]);
  const totalCount = (contactsResult as any)?.totalCount ?? contacts?.length ?? 0;
  const hasMore = (contactsResult as any)?.hasMore ?? false;

  // Mutations
  const createContact = useMutation(api.contacts.create);
  const updateContact = useMutation(api.contacts.update);
  const removeContact = useMutation(api.contacts.remove);

  // Modal state
  const [selectedContact, setSelectedContact] = React.useState<ContactWithOwners | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ContactWithOwners | null>(null);
  const [formError, setFormError] = React.useState("");

  // Form state with validation
  const [name, setName] = React.useState<FieldState>(createEmptyFieldState());
  const [phone, setPhone] = React.useState<FieldState>(createEmptyFieldState());
  const [email, setEmail] = React.useState<FieldState>(createEmptyFieldState());
  const [company, setCompany] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [ownerUserIds, setOwnerUserIds] = React.useState<Id<"users">[]>([]);

  const isAdmin = currentUser?.role === "admin";

  // Validation functions
  const validateName = (value: string): string | undefined => {
    if (!value.trim()) return "Name is required";
    if (value.trim().length < 2) return "Name must be at least 2 characters";
    return undefined;
  };

  const validatePhone = (value: string): string | undefined => {
    if (!value.trim()) return "Phone number is required";
    const digits = value.replace(/\D/g, "");
    if (digits.length < 7) return "Please enter a valid phone number";
    return undefined;
  };

  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) return undefined; // Email is optional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return "Please enter a valid email address";
    return undefined;
  };

  const handleFieldChange = (
    field: "name" | "phone" | "email",
    value: string,
    validator: (value: string) => string | undefined
  ) => {
    const setter = field === "name" ? setName : field === "phone" ? setPhone : setEmail;
    setter((prev) => ({
      value,
      touched: prev.touched,
      error: prev.touched ? validator(value) : undefined,
    }));
  };

  const handleFieldBlur = (
    field: "name" | "phone" | "email",
    validator: (value: string) => string | undefined
  ) => {
    const setter = field === "name" ? setName : field === "phone" ? setPhone : setEmail;
    const state = field === "name" ? name : field === "phone" ? phone : email;
    setter({
      ...state,
      touched: true,
      error: validator(state.value),
    });
  };

  // Initialize form when selecting a contact
  React.useEffect(() => {
    if (selectedContact) {
      setName(createEmptyFieldState(selectedContact.name));
      setPhone(createEmptyFieldState(selectedContact.phone));
      setEmail(createEmptyFieldState(selectedContact.email || ""));
      setCompany(selectedContact.company || "");
      setNotes(selectedContact.notes || "");
      setOwnerUserIds(selectedContact.ownerUserIds);
      setFormError("");
    }
  }, [selectedContact]);

  const resetForm = () => {
    setName(createEmptyFieldState());
    setPhone(createEmptyFieldState());
    setEmail(createEmptyFieldState());
    setCompany("");
    setNotes("");
    setOwnerUserIds([]);
    setFormError("");
  };

  const closeModal = () => {
    setSelectedContact(null);
    setIsCreating(false);
    resetForm();
  };

  const validateForm = (): boolean => {
    const nameError = validateName(name.value);
    const phoneError = validatePhone(phone.value);
    const emailError = validateEmail(email.value);

    setName((prev) => ({ ...prev, touched: true, error: nameError }));
    setPhone((prev) => ({ ...prev, touched: true, error: phoneError }));
    setEmail((prev) => ({ ...prev, touched: true, error: emailError }));

    return !nameError && !phoneError && !emailError;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    setFormError("");
    try {
      if (isCreating) {
        await createContact({
          name: name.value.trim(),
          phone: phone.value.trim(),
          email: email.value.trim() || undefined,
          company: company.trim() || undefined,
          notes: notes.trim() || undefined,
          ownerUserIds: ownerUserIds.length > 0 ? ownerUserIds : undefined,
        });
      } else if (selectedContact) {
        await updateContact({
          contactId: selectedContact._id,
          name: name.value.trim(),
          phone: phone.value.trim(),
          email: email.value.trim() || undefined,
          company: company.trim() || undefined,
          notes: notes.trim() || undefined,
          ownerUserIds: ownerUserIds.length > 0 ? ownerUserIds : undefined,
        });
      }
      if (isCreating) {
        contactToasts.created(name.value.trim());
      } else {
        contactToasts.updated(name.value.trim());
      }
      closeModal();
    } catch (error) {
      console.error("Failed to save contact:", error);
      const msg = error instanceof Error ? error.message : "Failed to save contact. Please try again.";
      setFormError(msg);
      contactToasts.saveFailed(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeContact({ contactId: deleteTarget._id });
      contactToasts.deleted(deleteTarget.name);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete contact:", error);
      contactToasts.deleteFailed(error instanceof Error ? error.message : undefined);
    }
  };

  const toggleOwner = (userId: Id<"users">) => {
    setOwnerUserIds((current) => {
      if (current.includes(userId)) {
        return current.filter((id) => id !== userId);
      } else {
        return [...current, userId];
      }
    });
  };

  const openCreateModal = () => {
    setSelectedContact(null);
    resetForm();
    if (!isAdmin && currentUser) {
      setOwnerUserIds([currentUser._id]);
    }
    setIsCreating(true);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Contacts</h2>
          <p className="text-sm text-text-muted">
            Contacts are the people you engage, separate from property-specific leads.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="group flex h-10 items-center gap-2 rounded-full bg-border pl-3 pr-4 transition-all duration-300 ease-in-out hover:bg-primary hover:pl-2 hover:text-white active:bg-primary-600"
        >
          <span className="flex items-center justify-center overflow-hidden rounded-full bg-primary p-1 text-white transition-all duration-300 group-hover:bg-white">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="h-0 w-0 transition-all duration-300 group-hover:h-4 group-hover:w-4 group-hover:text-primary"
            >
              <path
                d="M8 3v10M3 8h10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="text-sm font-medium">New Contact</span>
        </button>
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
              <StaggeredDropDown
                value={ownerFilter}
                onChange={(val) => setOwnerFilter(val as Id<"users"> | "")}
                options={[
                  { value: "", label: "All owners" },
                  ...users.map((user) => ({ value: user._id, label: user.name })),
                ]}
              />
            </div>
          )}
          <div className="flex items-end">
            <p className="text-sm text-text-muted">
              {contacts ? `${totalCount} contact${totalCount !== 1 ? "s" : ""}` : "Loading..."}
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
        {!contacts ? (
          <tbody>
            <TableRow>
              <TableCell colSpan={6} className="text-center text-text-muted">
                Loading contacts...
              </TableCell>
            </TableRow>
          </tbody>
        ) : contacts.length === 0 ? (
          <tbody>
            <TableRow>
              <TableCell colSpan={6} className="text-center text-text-muted">
                {debouncedSearch || ownerFilter
                  ? "No contacts match your filters"
                  : "No contacts yet. Create one to get started."}
              </TableCell>
            </TableRow>
          </tbody>
        ) : (
          <motion.tbody
            variants={listVariants}
            initial="hidden"
            animate="show"
            key="data"
          >
            {contacts.map((contact: ContactWithOwners) => (
              <ContactTableRow
                key={contact._id}
                contact={contact}
                isAdmin={isAdmin}
                currentUserId={currentUser._id}
                onEdit={setSelectedContact}
                onDelete={setDeleteTarget}
              />
            ))}
          </motion.tbody>
        )}
      </Table>

      <PaginationControls
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalCount={totalCount}
        hasMore={hasMore}
        onNextPage={pagination.nextPage}
        onPrevPage={pagination.prevPage}
      />

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
          {formError && (
            <div className="rounded-lg bg-danger/10 p-4 text-danger text-sm">
              {formError}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Name */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Name <span className="text-danger">*</span>
              </Label>
              {name.touched && name.error && (
                <p className="text-xs text-danger">{name.error}</p>
              )}
              <Input
                value={name.value}
                onChange={(e) => handleFieldChange("name", e.target.value, validateName)}
                onBlur={() => handleFieldBlur("name", validateName)}
                placeholder="John Doe"
                error={name.touched && !!name.error}
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                Phone <span className="text-danger">*</span>
              </Label>
              {phone.touched && phone.error && (
                <p className="text-xs text-danger">{phone.error}</p>
              )}
              <Input
                value={phone.value}
                onChange={(e) => handleFieldChange("phone", e.target.value, validatePhone)}
                onBlur={() => handleFieldBlur("phone", validatePhone)}
                placeholder="+263 77 123 4567"
                error={phone.touched && !!phone.error}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label>Email</Label>
              {email.touched && email.error && (
                <p className="text-xs text-danger">{email.error}</p>
              )}
              <Input
                type="email"
                value={email.value}
                onChange={(e) => handleFieldChange("email", e.target.value, validateEmail)}
                onBlur={() => handleFieldBlur("email", validateEmail)}
                placeholder="john@example.com"
                error={email.touched && !!email.error}
              />
            </div>

            {/* Company */}
            <div className="space-y-2">
              <Label>Company</Label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company name"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
                    const isSelected = ownerUserIds.includes(user._id);
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
                {ownerUserIds.length === 0 && (
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
                {selectedContact.ownerNames.map((ownerName, i) => (
                  <Badge key={i} variant="secondary">
                    {ownerName}
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
