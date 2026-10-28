/** Pieces of the New lead form: choosing or creating the contact, and picking properties. */
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Badge, Body, Button, Card, Chips, Field, Loading, Row, SearchBar, Sheet } from "../../ui";
import { getErrorMessage } from "@/lib/errors";
import { validateEmail, validateName, validatePhone } from "@/lib/validators";
import { areaMatchesLocation } from "../../../../convex/lib/locations";
import { parseMoney, priceLabel, type InterestType } from "../../../lib/crm/leads/helpers";
import { useDebounced } from "../../../lib/crm/leads/useRefresh";
import { CheckRow } from "./bits";
import { colors, font, radius, space } from "../../../lib/theme";

export type PickedContact = { _id: Id<"contacts">; name: string; phone?: string; email?: string };

/** Search existing contacts or add a new one. */
export function ContactPicker({ value, onChange, error }: { value: PickedContact | null; onChange: (c: PickedContact | null) => void; error?: string }) {
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [adding, setAdding] = useState(false);
  const results = useQuery(api.contacts.list, value ? "skip" : { q: q || undefined, pageSize: 20 });

  if (value) {
    return (
      <Card style={{ gap: 4 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={{ fontSize: font.xs, color: colors.muted, fontWeight: "600" }}>CONTACT</Text>
          <Button small variant="ghost" title="Change" onPress={() => onChange(null)} />
        </Row>
        <Text style={{ fontSize: font.md, fontWeight: "700", color: colors.text }}>{value.name}</Text>
        <Text style={{ fontSize: font.sm, color: colors.muted }}>{[value.phone, value.email].filter(Boolean).join(" · ") || "No phone or email yet"}</Text>
      </Card>
    );
  }
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ fontSize: font.sm, fontWeight: "600", color: colors.text }}>Contact</Text>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search contacts by name or phone" />
      {error ? <Text style={{ fontSize: font.xs, color: colors.danger }}>{error}</Text> : null}
      {results === undefined ? (
        <Loading />
      ) : (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card }}>
          {results.items.slice(0, 8).map((c) => (
            <Pressable
              key={c._id}
              onPress={() => onChange({ _id: c._id, name: c.name, phone: c.phone, email: c.email })}
              style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
            >
              <Text style={{ fontSize: font.md, color: colors.text, fontWeight: "600" }}>{c.name}</Text>
              <Text style={{ fontSize: font.sm, color: colors.muted }}>{[c.phone, c.email, c.company].filter(Boolean).join(" · ")}</Text>
            </Pressable>
          ))}
          {results.items.length === 0 && <Body muted style={{ padding: space.md }}>No contacts found.</Body>}
        </View>
      )}
      <Button small variant="secondary" icon="person-add-outline" title="New contact" onPress={() => setAdding(true)} />
      <NewContactSheet
        open={adding}
        onClose={() => setAdding(false)}
        initialName={search}
        onCreated={(c) => {
          setAdding(false);
          onChange(c);
        }}
      />
    </View>
  );
}

function NewContactSheet({ open, onClose, initialName, onCreated }: { open: boolean; onClose: () => void; initialName: string; onCreated: (c: PickedContact) => void }) {
  const create = useMutation(api.contacts.create);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  // Start from what was typed in the search: a number becomes the phone.
  useEffect(() => {
    if (!open) return;
    const isPhone = /\d/.test(initialName);
    setName(isPhone ? "" : initialName);
    setPhone(isPhone ? initialName : "");
    setEmail("");
    setCompany("");
    setTried(false);
  }, [open]);
  const errs = { name: validateName(name), phone: validatePhone(phone), email: validateEmail(email) };
  const save = async () => {
    setTried(true);
    if (errs.name || errs.phone || errs.email) return;
    setBusy(true);
    try {
      const id = await create({ name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined, company: company.trim() || undefined });
      onCreated({ _id: id, name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined });
    } catch (e) {
      Alert.alert("Could not create the contact", getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="New contact" footer={<Button title="Create contact" loading={busy} onPress={save} />}>
      <Body muted small>
        The contact is also added to your contacts list.
      </Body>
      <Field label="Name" value={name} onChangeText={setName} error={tried ? errs.name : undefined} />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+263 77 000 0000" error={tried ? errs.phone : undefined} />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={tried ? errs.email : undefined} />
      <Field label="Company" value={company} onChangeText={setCompany} />
    </Sheet>
  );
}

/**
 * Optional properties for the new lead. "Recommended" narrows to the listing
 * type, budget and areas entered above, with the same area matcher the server
 * uses for suggestions.
 */
export function PropertyPicker({
  value,
  onChange,
  interest,
  budgetMin,
  budgetMax,
  areas,
}: {
  value: Set<Id<"properties">>;
  onChange: (v: Set<Id<"properties">>) => void;
  interest: InterestType;
  budgetMin: string;
  budgetMax: string;
  areas: string[];
}) {
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [mode, setMode] = useState<"all" | "recommended">("all");
  const results = useQuery(api.properties.search, { q: q || undefined, limit: 100 });
  const shown = useMemo(() => {
    if (!results || mode === "all") return results ?? [];
    const listing = interest === "buy" ? "sale" : "rent";
    const min = parseMoney(budgetMin);
    const max = parseMoney(budgetMax);
    return results.filter(
      (p) =>
        p.listingType === listing &&
        (min === null || p.price >= min) &&
        (max === null || p.price <= max) &&
        (areas.length === 0 || areas.some((a) => areaMatchesLocation(a, p.location)))
    );
  }, [results, mode, interest, budgetMin, budgetMax, areas]);
  const toggle = (id: Id<"properties">) => {
    const n = new Set(value);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onChange(n);
  };
  return (
    <View style={{ gap: space.sm }}>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search by title or location" />
      <Chips
        options={[
          { value: "all" as const, label: "All available" },
          { value: "recommended" as const, label: "Recommended" },
        ]}
        value={mode}
        onChange={setMode}
      />
      {value.size > 0 && <Body small muted>{value.size} selected. Each extra property creates its own lead.</Body>}
      {results === undefined ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Body muted>{q ? "No properties match your search." : "No available properties found."}</Body>
      ) : (
        shown.map((p) => (
          <CheckRow
            key={p._id}
            on={value.has(p._id)}
            onPress={() => toggle(p._id)}
            title={p.title}
            subtitle={[priceLabel(p.price, p.currency), p.location, p.bedrooms !== undefined ? `${p.bedrooms} bed` : "", p.area ? `${p.area} m²` : ""].filter(Boolean).join(" · ")}
            right={<Badge label={p.status === "available" ? "Available" : "Under offer"} tone={p.status === "available" ? "success" : "warning"} />}
          />
        ))
      )}
    </View>
  );
}
