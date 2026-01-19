"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { contacts, currentUser, users } from "@/lib/mock-data";

const emptyContactDraft = {
  name: "",
  phone: "",
  email: "",
  ownerId: "",
};

type Contact = (typeof contacts)[number];

export default function ContactsPage() {
  const userMap = new Map(users.map((user) => [user.id, user]));
  const visibleContacts =
    currentUser.role === "admin"
      ? contacts
      : contacts.filter((contact) => contact.ownerId === currentUser.id);

  const [selectedContact, setSelectedContact] = React.useState<Contact | null>(
    null
  );
  const [contactDraft, setContactDraft] = React.useState(emptyContactDraft);
  const [isCreating, setIsCreating] = React.useState(false);

  React.useEffect(() => {
    if (selectedContact) {
      setContactDraft({
        name: selectedContact.name,
        phone: selectedContact.phone,
        email: selectedContact.email,
        ownerId: selectedContact.ownerId,
      });
    }
  }, [selectedContact]);

  const closeModal = () => {
    setSelectedContact(null);
    setIsCreating(false);
    setContactDraft(emptyContactDraft);
  };

  const handleSave = () => {
    closeModal();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Contacts</h2>
          <p className="text-sm text-text-muted">
            Contacts are the people you engage, separate from property-specific
            leads.
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedContact(null);
            setContactDraft(emptyContactDraft);
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
            <Input placeholder="Name, phone, email" />
          </div>
          <div className="space-y-2">
            <Label>Engagement</Label>
            <Select>
              <option>All contacts</option>
              <option>Active</option>
              <option>Inactive</option>
            </Select>
          </div>
          {currentUser.role === "admin" ? (
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select>
                <option>All owners</option>
                {users.map((user) => (
                  <option key={user.id}>{user.name}</option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
      </div>

      <Table>
        <thead>
          <tr>
            <TableHead>Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </tr>
        </thead>
        <tbody>
          {visibleContacts.map((contact) => (
            <TableRow key={contact.id} className="cursor-pointer">
              <TableCell>
                <p className="font-medium">{contact.name}</p>
              </TableCell>
              <TableCell>{contact.phone}</TableCell>
              <TableCell>{contact.email}</TableCell>
              <TableCell>{userMap.get(contact.ownerId)?.name ?? "Unassigned"}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="secondary"
                  className="h-9 px-3"
                  onClick={() => setSelectedContact(contact)}
                >
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>

      <Modal
        open={Boolean(selectedContact) || isCreating}
        title={
          selectedContact ? `Contact: ${selectedContact.name}` : "New Contact"
        }
        description={
          selectedContact
            ? "Review details and make edits before saving."
            : "Add details to create a new contact."
        }
        onClose={closeModal}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {selectedContact ? "Save changes" : "Save contact"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={contactDraft.name}
              onChange={(event) =>
                setContactDraft((prev) => ({
                  ...prev,
                  name: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input
              value={contactDraft.phone}
              onChange={(event) =>
                setContactDraft((prev) => ({
                  ...prev,
                  phone: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={contactDraft.email}
              onChange={(event) =>
                setContactDraft((prev) => ({
                  ...prev,
                  email: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Owner</Label>
            <Select
              value={contactDraft.ownerId}
              disabled={currentUser.role !== "admin"}
              onChange={(event) =>
                setContactDraft((prev) => ({
                  ...prev,
                  ownerId: event.target.value,
                }))
              }
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
