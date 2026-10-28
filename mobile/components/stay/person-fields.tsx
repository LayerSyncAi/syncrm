/**
 * Name, contact, ID and (for landlords) bank fields, with a warning when the
 * phone or email already belongs to a contact. `onUseExisting` lets the form
 * link that contact instead of creating a duplicate.
 */
import { View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Body, Button, Card, Field, Section, Select } from "../ui";
import { colors, space } from "../../lib/theme";
import { useDebounced } from "../../lib/stay/hooks";
import type { PersonForm } from "../../lib/stay/person";

export function PersonFields({
  value,
  onChange,
  role,
  excludeId,
  onUseExisting,
}: {
  value: PersonForm;
  onChange: (v: PersonForm) => void;
  role: "landlord" | "tenant";
  excludeId?: Id<"contacts">;
  onUseExisting?: (c: { _id: Id<"contacts">; name: string }) => void;
}) {
  const phone = useDebounced(value.phone.trim(), 400);
  const email = useDebounced(value.email.trim(), 400);
  const dupes = useQuery(
    api.stay.people.findDuplicates,
    phone.replace(/\D/g, "").length >= 7 || email.includes("@") ? { phone: phone || undefined, email: email || undefined, excludeId } : "skip",
  );
  const set = (patch: Partial<PersonForm>) => onChange({ ...value, ...patch });
  const isCompany = value.entityKind === "company";

  return (
    <View style={{ gap: space.md }}>
      <Field label={isCompany ? "Company name" : "Full name"} value={value.name} onChangeText={(name) => set({ name })} autoComplete="off" />
      <Select
        label="Type"
        value={value.entityKind}
        options={[
          { value: "individual", label: "Individual" },
          { value: "company", label: "Company" },
        ]}
        onChange={(entityKind) => set({ entityKind })}
      />
      <Field label={isCompany ? "Company registration number" : "ID number"} value={value.idNumber} onChangeText={(idNumber) => set({ idNumber })} />
      <Field label="Phone" value={value.phone} onChangeText={(p) => set({ phone: p })} keyboardType="phone-pad" placeholder="+263 77 123 4567" />
      <Field label="Email" value={value.email} onChangeText={(e) => set({ email: e })} keyboardType="email-address" autoCapitalize="none" />

      {dupes && dupes.length > 0 && (
        <Card style={{ backgroundColor: colors.warningBg, borderColor: colors.warning + "55" }}>
          <Body style={{ color: colors.warning, fontWeight: "600" }}>This may already be on file</Body>
          {dupes.map((d) => (
            <View key={d._id} style={{ gap: space.xs }}>
              <Body small>
                {d.name}
                {[d.phone, d.email].filter(Boolean).length ? `, ${[d.phone, d.email].filter(Boolean).join(", ")}` : ""}
                {d.isLandlord ? " (landlord)" : ""}
                {d.isTenant ? " (tenant)" : ""}
              </Body>
              {onUseExisting && <Button small variant="secondary" title="Use this contact" onPress={() => onUseExisting(d)} style={{ alignSelf: "flex-start" }} />}
            </View>
          ))}
        </Card>
      )}

      {role === "landlord" && (
        <Section title="Bank details for payouts">
          <Field label="Bank" value={value.bankName} onChangeText={(bankName) => set({ bankName })} />
          <Field label="Branch" value={value.branch} onChangeText={(branch) => set({ branch })} />
          <Field label="Account name" value={value.accountName} onChangeText={(accountName) => set({ accountName })} />
          <Field label="Account number" value={value.accountNumber} onChangeText={(accountNumber) => set({ accountNumber })} keyboardType="number-pad" />
        </Section>
      )}
    </View>
  );
}
