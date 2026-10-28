/** How rent invoices, reminders, expiry alerts and receipts work for the agency. Directors edit. */
import { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatReceiptNumber } from "../../../convex/stay/ledger";
import { Body, Button, Field, Loading, Notice, Screen, Section, Select } from "../../components/ui";
import { useRun } from "../../lib/useRun";
import { TIMEZONES } from "@/lib/timezones";

type Form = { invoiceLeadDays: string; reminderDays: string; expiryAlertDays: string; receiptPrefix: string; timezone: string };

function parseDays(s: string): number[] | null {
  const nums = s
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((p) => Number(p));
  return nums.every((n) => Number.isInteger(n) && n > 0) ? nums : null;
}

export default function StaySettings() {
  const router = useRouter();
  const settings = useQuery(api.stay.settings.get);
  const update = useMutation(api.stay.settings.update);
  const { busy, run } = useRun();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings && !form) {
      setForm({
        invoiceLeadDays: String(settings.invoiceLeadDays),
        reminderDays: settings.reminderDays.join(", "),
        expiryAlertDays: settings.expiryAlertDays.join(", "),
        receiptPrefix: settings.receiptPrefix,
        timezone: settings.timezone,
      });
    }
  }, [settings, form]);

  if (settings === undefined || !form) return <Loading />;
  const canEdit = settings.canEdit;
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });

  const save = async () => {
    const lead = Number(form.invoiceLeadDays);
    const reminderDays = parseDays(form.reminderDays);
    const expiryAlertDays = parseDays(form.expiryAlertDays);
    if (!Number.isInteger(lead)) return setError("Invoice lead days must be a whole number.");
    if (!reminderDays) return setError("Reminder days must be whole numbers separated by commas, for example 3, 7, 14.");
    if (!expiryAlertDays || !expiryAlertDays.length) return setError("Expiry alert days must be whole numbers separated by commas, for example 60, 30.");
    setError(null);
    await run(
      async () => {
        await update({ invoiceLeadDays: lead, reminderDays, expiryAlertDays, receiptPrefix: form.receiptPrefix, timezone: form.timezone });
        return true;
      },
      { success: "Settings saved" },
    );
  };

  const zones: Array<{ value: string; label: string }> = TIMEZONES.some((z) => z.value === form.timezone)
    ? [...TIMEZONES]
    : [{ value: form.timezone, label: form.timezone }, ...TIMEZONES];

  return (
    <Screen>
      <Stack.Screen options={{ title: "Stay settings" }} />
      {!canEdit && <Notice>Only a director can change these settings.</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}

      <Section title="Rent invoices and reminders">
        <Field
          label="Invoice lead days"
          value={form.invoiceLeadDays}
          onChangeText={(invoiceLeadDays) => set({ invoiceLeadDays })}
          keyboardType="number-pad"
          editable={canEdit}
          hint="The rent charge is raised and the invoice emailed this many days before the due date."
        />
        <Field
          label="Reminder days after the due date"
          value={form.reminderDays}
          onChangeText={(reminderDays) => set({ reminderDays })}
          editable={canEdit}
          placeholder="3, 7, 14"
          keyboardType="numbers-and-punctuation"
          hint="Tenants who still owe get a reminder email on each of these days."
        />
      </Section>

      <Section title="Lease expiry alerts">
        <Field
          label="Days before the end date"
          value={form.expiryAlertDays}
          onChangeText={(expiryAlertDays) => set({ expiryAlertDays })}
          editable={canEdit}
          placeholder="60, 30"
          keyboardType="numbers-and-punctuation"
          hint="The property manager gets a notification and an email on each of these days."
        />
      </Section>

      <Section title="Receipts and time">
        <Field
          label="Receipt prefix"
          value={form.receiptPrefix}
          onChangeText={(receiptPrefix) => set({ receiptPrefix })}
          editable={canEdit}
          maxLength={12}
          autoCapitalize="characters"
          placeholder="RC-"
          hint={`Next receipt number: ${formatReceiptNumber(form.receiptPrefix.trim(), settings.nextReceiptSeq)}`}
        />
        {canEdit ? (
          <Select
            label="Timezone"
            value={form.timezone}
            onChange={(timezone) => set({ timezone })}
            options={zones}
            hint="Decides which day it is for due dates, arrears and the daily rent job."
          />
        ) : (
          <Body small muted>
            Timezone: {zones.find((z) => z.value === form.timezone)?.label ?? form.timezone}
          </Body>
        )}
      </Section>

      {canEdit && <Button title="Save settings" onPress={save} loading={busy} />}
      <Button variant="secondary" icon="cloud-upload-outline" title="Import from a spreadsheet" onPress={() => router.push("/stay/import")} />
    </Screen>
  );
}
