/** Agency details printed on receipts, statements and reports, and the agency branches. Admins edit; everyone else reads. */
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Body, Button, Card, Field, Loading, Row, Screen, Select } from "../../components/ui";
import { useRun } from "../../lib/useRun";
import { colors, font, space } from "../../lib/theme";

type Form = { name: string; defaultCurrency: "USD" | "ZiG"; address: string; phone: string; email: string; vatNumber: string };

export default function AgencySettings() {
  const settings = useQuery(api.hub.getOrgSettings);
  const hub = useQuery(api.hub.getContext);
  const update = useMutation(api.hub.updateOrgSettings);
  const branches = useQuery(api.hub.listBranches);
  const addBranch = useMutation(api.hub.addBranch);
  const removeBranch = useMutation(api.hub.removeBranch);
  const [newBranch, setNewBranch] = useState("");
  const { busy, run } = useRun();
  const [form, setForm] = useState<Form | null>(null);
  const canEdit = !!hub?.isAdmin;

  // Seed the form once the saved values arrive.
  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  if (settings === undefined || hub === undefined || !form) return <Loading />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => (p ? { ...p, [k]: v } : p));
  const save = () => {
    if (!form.name.trim()) return run(async () => { throw new Error("Agency name is required"); });
    return run(() => update(form), { success: "Agency settings saved" });
  };

  return (
    <Screen>
      <Body muted>These details appear on receipts, statements and reports.{!canEdit && " Only admins can change them."}</Body>
      <Card style={{ gap: space.md }}>
        <Field label="Agency name" value={form.name} editable={canEdit} onChangeText={(v) => set("name", v)} />
        {canEdit ? (
          <Select
            label="Default currency"
            value={form.defaultCurrency}
            options={[
              { value: "USD", label: "USD" },
              { value: "ZiG", label: "ZiG" },
            ]}
            onChange={(v) => set("defaultCurrency", v)}
          />
        ) : (
          <Field label="Default currency" value={form.defaultCurrency} editable={false} />
        )}
        <Field label="Address" value={form.address} editable={canEdit} onChangeText={(v) => set("address", v)} />
        <Field label="Phone" value={form.phone} editable={canEdit} onChangeText={(v) => set("phone", v)} keyboardType="phone-pad" />
        <Field label="Email" value={form.email} editable={canEdit} onChangeText={(v) => set("email", v)} keyboardType="email-address" autoCapitalize="none" />
        <Field label="VAT number" value={form.vatNumber} editable={canEdit} onChangeText={(v) => set("vatNumber", v)} />
        {canEdit && <Button title="Save settings" loading={busy} onPress={save} />}
      </Card>
      <Card style={{ gap: space.md }}>
        <Text style={{ fontSize: font.md, fontWeight: "600", color: colors.text }}>Branches</Text>
        {(branches ?? []).length === 0 ? <Body small muted>No branches yet.</Body> : null}
        {(branches ?? []).map((b) => (
          <Row key={b.id} style={{ justifyContent: "space-between" }}>
            <Body>{`${b.name} · ${b.userCount} ${b.userCount === 1 ? "staff member" : "staff members"}`}</Body>
            {canEdit && b.userCount === 0 ? (
              <Button title="Remove" small variant="secondary" disabled={busy} onPress={() => run(() => removeBranch({ id: b.id }), { success: "Branch removed" })} />
            ) : null}
          </Row>
        ))}
        {canEdit ? (
          <>
            <Field label="New branch" value={newBranch} onChangeText={setNewBranch} placeholder="e.g. Borrowdale" />
            <Button
              title="Add branch"
              small
              disabled={busy || !newBranch.trim()}
              onPress={async () => {
                if (await run(() => addBranch({ name: newBranch }), { success: "Branch added" })) setNewBranch("");
              }}
            />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
