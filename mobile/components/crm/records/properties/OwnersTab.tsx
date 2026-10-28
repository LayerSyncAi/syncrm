/**
 * The seller(s) or landlord(s) whose property this is (the client), port of
 * the web PropertyOwners panel. Agent ownership lives in AccessPanel.
 */
import { useState } from "react";
import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { OWNER_TYPE_OPTIONS, PROPERTY_OWNER_ROLE_OPTIONS, type OwnerType, type PropertyOwnerRole } from "@/lib/owner-types";
import { Badge, Body, Button, EmptyState, Field, ListItem, Loading, Notice, Row, SearchBar, Section, Select, Sheet } from "../../../ui";
import { confirm, useRun } from "../../../../lib/useRun";
import { space } from "../../../../lib/theme";
import { useDebounced } from "../../../../lib/crm/records/properties/hooks";

export function OwnersTab({ propertyId, listingType, canManage }: { propertyId: Id<"properties">; listingType: "rent" | "sale"; canManage: boolean }) {
  const router = useRouter();
  const owners = useQuery(api.owners.listForProperty, { propertyId });
  const unlink = useMutation(api.owners.unlinkFromProperty);
  const { run } = useRun();
  const [addOpen, setAddOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const rows = (owners ?? []).filter((o): o is NonNullable<typeof o> => !!o);

  return (
    <View style={{ gap: space.md }}>
      <Section title="Property owner">
        <Body small muted>The seller or landlord this listing belongs to. Separate from the agent who holds the record.</Body>
        {owners === undefined ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="key-outline"
            title="No owner linked"
            message={canManage ? "Add the seller or landlord so this listing shows who it belongs to." : "No seller or landlord has been linked yet."}
          />
        ) : (
          rows.map((o) => (
            <View key={o.linkId} style={{ gap: space.xs }}>
              <ListItem
                icon="person-outline"
                title={o.name}
                subtitle={[o.phone, o.email].filter(Boolean).join(" · ") || undefined}
                right={<Badge label={o.role === "landlord" ? "Landlord" : "Seller"} tone="info" />}
                onPress={() => router.push(`/crm/owners/${o.contactId}` as Href)}
              />
              {canManage && (
                <Button
                  small
                  variant="ghost"
                  icon="unlink-outline"
                  title={`Unlink ${o.name}`}
                  onPress={async () => {
                    if (await confirm("Unlink owner", `Remove ${o.name} from this property? The owner record stays.`, "Unlink", true)) {
                      await run(() => unlink({ linkId: o.linkId }));
                    }
                  }}
                />
              )}
            </View>
          ))
        )}
      </Section>
      {canManage && (
        <Row>
          <Button style={{ flex: 1 }} variant="secondary" icon="person-add-outline" title="New owner" onPress={() => setAddOpen(true)} />
          <Button style={{ flex: 1 }} variant="secondary" icon="link-outline" title="Link existing" onPress={() => setLinkOpen(true)} />
        </Row>
      )}
      <QuickAddSheet open={addOpen} onClose={() => setAddOpen(false)} propertyId={propertyId} listingType={listingType} />
      <LinkSheet open={linkOpen} onClose={() => setLinkOpen(false)} propertyId={propertyId} listingType={listingType} />
    </View>
  );
}

function QuickAddSheet({ open, onClose, propertyId, listingType }: { open: boolean; onClose: () => void; propertyId: Id<"properties">; listingType: "rent" | "sale" }) {
  const quickAdd = useMutation(api.owners.quickAddForProperty);
  const { busy, run } = useRun();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [ownerType, setOwnerType] = useState<OwnerType>(listingType === "rent" ? "landlord" : "seller");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setPhone("");
    setEmail("");
    setError(null);
  };

  const save = async () => {
    if (!name.trim()) return setError("Name is required.");
    if (!phone.trim() && !email.trim()) return setError("Add a phone number or an email so the owner can be reached.");
    setError(null);
    const ok = await run(async () => {
      await quickAdd({ propertyId, name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined, ownerType });
      return true;
    });
    if (ok) {
      reset();
      onClose();
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="New owner" footer={<Button title="Add owner" onPress={save} loading={busy} />}>
      <Body small muted>If the phone number is already on file, that contact is marked as an owner instead of being duplicated.</Body>
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Name *" value={name} onChangeText={setName} placeholder="Tendai Moyo" />
      <Select label="Type" value={ownerType} options={OWNER_TYPE_OPTIONS} onChange={setOwnerType} />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+263 77 123 4567" />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="owner@example.com" />
    </Sheet>
  );
}

function LinkSheet({ open, onClose, propertyId, listingType }: { open: boolean; onClose: () => void; propertyId: Id<"properties">; listingType: "rent" | "sale" }) {
  const link = useMutation(api.owners.linkToProperty);
  const { busy, run } = useRun();
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [picked, setPicked] = useState<Id<"contacts"> | null>(null);
  const [role, setRole] = useState<PropertyOwnerRole>(listingType === "rent" ? "landlord" : "seller");
  const found = useQuery(api.owners.list, open ? { q: q || undefined, pageSize: 25 } : "skip");

  const save = async () => {
    if (!picked) return;
    const ok = await run(async () => {
      await link({ propertyId, contactId: picked, role });
      return true;
    });
    if (ok) {
      setPicked(null);
      setSearch("");
      onClose();
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Link existing owner" footer={<Button title="Link owner" onPress={save} loading={busy} disabled={!picked} />}>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Name, phone or email" />
      {found === undefined ? (
        <Loading />
      ) : found.items.length === 0 ? (
        <Body small muted>No owners match. Use New owner to create one.</Body>
      ) : (
        found.items.map((o) => (
          <ListItem
            key={o._id}
            icon={picked === o._id ? "checkmark-circle" : "person-outline"}
            title={o.name}
            subtitle={o.phone ?? o.email ?? undefined}
            onPress={() => setPicked(o._id)}
          />
        ))
      )}
      <Select label="Role on this property" value={role} options={PROPERTY_OWNER_ROLE_OPTIONS} onChange={setRole} />
    </Sheet>
  );
}
