"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { FileSpreadsheet } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { formatReceiptNumber } from "../../../../../convex/stay/ledger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { TIMEZONES } from "@/lib/timezones";
import { FormError, Section, StayPageHeader } from "@/components/stay/page-header";

type Form = {
  invoiceLeadDays: string;
  reminderDays: string;
  expiryAlertDays: string;
  receiptPrefix: string;
  timezone: string;
};

function parseDays(s: string): number[] | null {
  const parts = s.split(/[,\s]+/).filter(Boolean);
  const nums = parts.map((p) => Number(p));
  return nums.every((n) => Number.isInteger(n) && n > 0) ? nums : null;
}

export default function StaySettingsPage() {
  const settings = useQuery(api.stay.settings.get);
  const update = useMutation(api.stay.settings.update);
  const [form, setForm] = React.useState<Form | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
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

  if (settings === undefined || !form) return <ListSkeleton />;
  const canEdit = settings.canEdit;
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });

  async function save() {
    if (!form) return;
    const lead = Number(form.invoiceLeadDays);
    const reminderDays = parseDays(form.reminderDays);
    const expiryAlertDays = parseDays(form.expiryAlertDays);
    if (!Number.isInteger(lead)) return setError("Invoice lead days must be a whole number.");
    if (!reminderDays) return setError("Reminder days must be whole numbers separated by commas, for example 3, 7, 14.");
    if (!expiryAlertDays || !expiryAlertDays.length) return setError("Expiry alert days must be whole numbers separated by commas, for example 60, 30.");
    setSaving(true);
    setError(null);
    try {
      await update({
        invoiceLeadDays: lead,
        reminderDays,
        expiryAlertDays,
        receiptPrefix: form.receiptPrefix,
        timezone: form.timezone,
      });
      animatedToast.success("Settings saved");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const zones = TIMEZONES.some((z) => z.value === form.timezone)
    ? TIMEZONES
    : [{ value: form.timezone, label: form.timezone }, ...TIMEZONES];

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Stay settings"
        description={canEdit ? "How rent invoices, reminders, expiry alerts and receipts work for your agency." : "Only a director can change these settings."}
        actions={
          <Link href="/app/stay/import">
            <Button variant="secondary" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Import from Excel
            </Button>
          </Link>
        }
      />

      <FormError message={error} />

      <Section title="Rent invoices and reminders">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Invoice lead days</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={27}
              value={form.invoiceLeadDays}
              disabled={!canEdit}
              onChange={(e) => set({ invoiceLeadDays: e.target.value })}
            />
            <p className="text-xs text-text-muted">The rent charge is raised and the invoice emailed this many days before the due date.</p>
          </div>
          <div className="space-y-2">
            <Label>Reminder days after the due date</Label>
            <Input value={form.reminderDays} disabled={!canEdit} onChange={(e) => set({ reminderDays: e.target.value })} placeholder="3, 7, 14" />
            <p className="text-xs text-text-muted">Tenants who still owe get a reminder email on each of these days.</p>
          </div>
        </div>
      </Section>

      <Section title="Lease expiry alerts">
        <div className="space-y-2 md:max-w-md">
          <Label>Days before the end date</Label>
          <Input value={form.expiryAlertDays} disabled={!canEdit} onChange={(e) => set({ expiryAlertDays: e.target.value })} placeholder="60, 30" />
          <p className="text-xs text-text-muted">The property manager gets a notification and an email on each of these days.</p>
        </div>
      </Section>

      <Section title="Receipts and time">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Receipt prefix</Label>
            <Input value={form.receiptPrefix} maxLength={12} disabled={!canEdit} onChange={(e) => set({ receiptPrefix: e.target.value })} placeholder="RC-" />
            <p className="text-xs text-text-muted">
              Next receipt number: <span className="font-medium text-text">{formatReceiptNumber(form.receiptPrefix.trim(), settings.nextReceiptSeq)}</span>
            </p>
          </div>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select value={form.timezone} disabled={!canEdit} onChange={(e) => set({ timezone: e.target.value })}>
              {zones.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </Select>
            <p className="text-xs text-text-muted">Decides which day it is for due dates, arrears and the daily rent job.</p>
          </div>
        </div>
      </Section>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </Button>
        </div>
      )}
    </div>
  );
}
