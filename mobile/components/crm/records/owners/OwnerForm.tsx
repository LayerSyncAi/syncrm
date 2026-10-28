/**
 * Create or edit an owner (seller or landlord), as on the website's Owners
 * page. A new owner whose phone already belongs to a contact is added to that
 * contact instead of creating a second record.
 */
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Body, Button, Field, Notice, Row, Select, Sheet } from "../../../ui";
import { OWNER_TYPE_OPTIONS, type OwnerType } from "../../../../lib/crm/records/contacts";
import { useRun } from "../../../../lib/useRun";

export type EditableOwner = {
  _id: Id<"contacts">;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  notes?: string;
  ownerType?: OwnerType;
  alsoBuyerTenant: boolean;
};

export function OwnerForm({ open, onClose, owner, onSaved }: { open: boolean; onClose: () => void; owner?: EditableOwner | null; onSaved?: (id: Id<"contacts">) => void }) {
  const create = useMutation(api.owners.create);
  const update = useMutation(api.owners.update);
  const { busy, run } = useRun();
  const [name, setName] = useState("");
  const [type, setType] = useState<OwnerType>("seller");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(owner?.name ?? "");
    setType(owner?.ownerType ?? "seller");
    setPhone(owner?.phone ?? "");
    setEmail(owner?.email ?? "");
    setCompany(owner?.company ?? "");
    setNotes(owner?.notes ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, owner?._id]);

  const save = async () => {
    if (!name.trim()) return setError("Name is required.");
    if (!phone.trim() && !email.trim()) return setError("Add a phone number or an email so the owner can be reached.");
    setError(null);
    const fields = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      company: company.trim() || undefined,
      notes: notes.trim() || undefined,
      ownerType: type,
    };
    if (owner) {
      const ok = await run(() => update({ ownerId: owner._id, ...fields }), { success: "Owner updated" });
      if (ok !== undefined) {
        onClose();
        onSaved?.(owner._id);
      }
      return;
    }
    const res = await run(() => create(fields));
    if (res) {
      Alert.alert(res.promotedExisting ? "That person was already a contact, so they are now marked as an owner" : "Owner created");
      onClose();
      onSaved?.(res.contactId);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={owner ? "Edit owner" : "New owner"}
      footer={
        <Row>
          <Button variant="secondary" title="Cancel" onPress={onClose} disabled={busy} style={{ flex: 1 }} />
          <Button title={owner ? "Save changes" : "Save owner"} onPress={save} loading={busy} style={{ flex: 1 }} />
        </Row>
      }
    >
      {!owner && <Body muted small>If the phone number already belongs to a contact, that person is marked as an owner instead of being added twice.</Body>}
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Name *" value={name} onChangeText={setName} placeholder="Tendai Moyo" />
      <Select<OwnerType> label="Type" value={type} onChange={setType} options={OWNER_TYPE_OPTIONS} />
      <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+263 77 123 4567" keyboardType="phone-pad" />
      <Field label="Email" value={email} onChangeText={setEmail} placeholder="owner@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      <Field label="Company" value={company} onChangeText={setCompany} placeholder="Optional, for corporate landlords" />
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Mandate terms, preferred contact times, anything worth remembering" />
      {owner?.alsoBuyerTenant && (
        <Body muted small>This person is also a buyer or tenant, so they appear under Contacts too. Removing the owner role keeps their contact record and lead history.</Body>
      )}
    </Sheet>
  );
}
