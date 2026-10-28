/**
 * Create or edit a contact (port of the website's contact modal): a Details
 * tab and a Preferences tab. Admins choose which agents can see the contact;
 * everyone else creates contacts for themselves.
 */
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Badge, Button, CheckList, Chips, Field, Notice, Row, Select, Sheet } from "../../../ui";
import { AreaPicker } from "./AreaPicker";
import { ContactDuplicates } from "./ContactDuplicates";
import { useRun } from "../../../../lib/useRun";
import { useSession } from "../../../../lib/session";
import {
  CURRENCY_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  amountOrUndefined,
  intOrUndefined,
  validateEmail,
  validateName,
  validatePhone,
  type InterestType,
  type PropertyType,
} from "../../../../lib/crm/records/contacts";
import { colors, font, space } from "../../../../lib/theme";

/** The fields the form edits, as contacts.list and contacts.getProfile return them. */
export type EditableContact = {
  _id: Id<"contacts">;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  notes?: string;
  preferredAreas?: string[];
  interestType?: InterestType;
  budgetCurrency?: string;
  budgetMin?: number;
  budgetMax?: number;
  preferredPropertyTypes?: PropertyType[];
  minBedrooms?: number;
  minBathrooms?: number;
  ownerUserIds: Id<"users">[];
  ownerNames?: string[];
};

type Tab = "details" | "preferences";

export function ContactForm({
  open,
  onClose,
  contact,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Edit this contact; omit to create a new one. */
  contact?: EditableContact | null;
  onSaved?: (id: Id<"contacts">) => void;
}) {
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const users = useQuery(api.users.listForAssignment, open && isAdmin ? {} : "skip");
  const create = useMutation(api.contacts.create);
  const update = useMutation(api.contacts.update);
  const { busy, run } = useRun();

  const [tab, setTab] = useState<Tab>("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [owners, setOwners] = useState<string[]>([]);
  const [interest, setInterest] = useState<InterestType | "">("");
  const [currency, setCurrency] = useState("USD");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [types, setTypes] = useState<PropertyType[]>([]);
  const [beds, setBeds] = useState("");
  const [baths, setBaths] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);

  // Load the contact (or a blank form) each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    const c = contact;
    setTab("details");
    setTouched(false);
    setName(c?.name ?? "");
    setPhone(c?.phone ?? "");
    setEmail(c?.email ?? "");
    setCompany(c?.company ?? "");
    setNotes(c?.notes ?? "");
    setOwners(c ? c.ownerUserIds.map(String) : []);
    setInterest(c?.interestType ?? "");
    setCurrency(c?.budgetCurrency || "USD");
    setBudgetMin(c?.budgetMin ? String(c.budgetMin) : "");
    setBudgetMax(c?.budgetMax ? String(c.budgetMax) : "");
    setTypes(c?.preferredPropertyTypes ?? []);
    setBeds(c?.minBedrooms ? String(c.minBedrooms) : "");
    setBaths(c?.minBathrooms ? String(c.minBathrooms) : "");
    setAreas(c?.preferredAreas ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact?._id]);

  const errors = { name: validateName(name), phone: validatePhone(phone), email: validateEmail(email) };
  const invalid = !!(errors.name || errors.phone || errors.email);

  const save = async () => {
    setTouched(true);
    if (invalid) {
      setTab("details");
      return;
    }
    // Same payload as the website; unset preferences are left out.
    const prefs: Record<string, unknown> = {
      interestType: interest || undefined,
      budgetCurrency: currency || undefined,
      budgetMin: amountOrUndefined(budgetMin),
      budgetMax: amountOrUndefined(budgetMax),
      preferredPropertyTypes: types.length ? types : undefined,
      minBedrooms: intOrUndefined(beds),
      minBathrooms: intOrUndefined(baths),
    };
    for (const k of Object.keys(prefs)) if (prefs[k] === undefined) delete prefs[k];
    const base = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      company: company.trim() || undefined,
      notes: notes.trim() || undefined,
      preferredAreas: areas.length ? areas : undefined,
      ownerUserIds: owners.length ? (owners as Id<"users">[]) : undefined,
      ...prefs,
    };
    const id = await run(
      async () => {
        if (contact) {
          await update({ contactId: contact._id, ...base } as Parameters<typeof update>[0]);
          return contact._id;
        }
        return await create(base as Parameters<typeof create>[0]);
      },
      { success: contact ? "Contact updated" : "Contact created" }
    );
    if (id) {
      onClose();
      onSaved?.(id);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={contact ? "Edit contact" : "New contact"}
      footer={
        <Row>
          <Button variant="secondary" title="Cancel" onPress={onClose} style={{ flex: 1 }} disabled={busy} />
          <Button title={contact ? "Save changes" : "Save contact"} onPress={save} loading={busy} style={{ flex: 1 }} />
        </Row>
      }
    >
      <Chips<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "details", label: "Details" },
          { value: "preferences", label: "Preferences" },
        ]}
      />
      {touched && invalid && tab === "preferences" && <Notice tone="danger">Check the details tab before saving.</Notice>}

      {tab === "details" ? (
        <>
          <Field label="Name *" value={name} onChangeText={setName} placeholder="John Doe" error={touched ? errors.name : null} />
          <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="+263 77 123 4567" keyboardType="phone-pad" error={touched || phone ? errors.phone : null} />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="john@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={touched || email ? errors.email : null}
          />
          {!contact && <ContactDuplicates phone={phone} email={email} onOpen={onClose} />}
          <Field label="Company" value={company} onChangeText={setCompany} placeholder="Company name" />
          <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Add any notes about this contact" />
          {isAdmin ? (
            <View style={{ gap: space.sm }}>
              <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Assigned agents (who can see this contact)</Text>
              <CheckList options={(users ?? []).map((u) => ({ value: u._id as string, label: u.name }))} value={owners} onChange={setOwners} />
              {owners.length === 0 && <Text style={{ fontSize: font.xs, color: colors.muted }}>None selected. You will be assigned.</Text>}
            </View>
          ) : contact?.ownerNames?.length ? (
            <View style={{ gap: space.sm }}>
              <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Assigned agents</Text>
              <Row style={{ flexWrap: "wrap" }}>
                {contact.ownerNames.map((n, i) => (
                  <Badge key={i} label={n} />
                ))}
              </Row>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Text style={{ fontSize: font.xs, color: colors.muted }}>Preferences stay with the contact even when their leads are closed or lost.</Text>
          <Select<InterestType | "none">
            label="Interest"
            value={interest || "none"}
            onChange={(v) => setInterest(v === "none" ? "" : v)}
            options={[
              { value: "none", label: "Not set" },
              { value: "rent", label: "Rent" },
              { value: "buy", label: "Buy" },
            ]}
          />
          <Select label="Budget currency" value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />
          <Row>
            <View style={{ flex: 1 }}>
              <Field label="Min budget" value={budgetMin} onChangeText={setBudgetMin} keyboardType="decimal-pad" placeholder="Any" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Max budget" value={budgetMax} onChangeText={setBudgetMax} keyboardType="decimal-pad" placeholder="Any" />
            </View>
          </Row>
          <Row>
            <View style={{ flex: 1 }}>
              <Field label="Min bedrooms" value={beds} onChangeText={setBeds} keyboardType="number-pad" placeholder="Any" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Min bathrooms" value={baths} onChangeText={setBaths} keyboardType="number-pad" placeholder="Any" />
            </View>
          </Row>
          <View style={{ gap: space.sm }}>
            <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Property types</Text>
            <CheckList options={PROPERTY_TYPE_OPTIONS} value={types} onChange={setTypes} />
          </View>
          <AreaPicker value={areas} onChange={setAreas} />
        </>
      )}
    </Sheet>
  );
}
