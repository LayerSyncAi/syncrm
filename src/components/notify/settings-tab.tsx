"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { FormError, Section } from "@/components/stay/page-header";

type Form = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  preferredChannel: "email" | "sms";
  senderName: string;
  replyTo: string;
};

export function SettingsTab() {
  const settings = useQuery(api.notify.settings.get);
  if (settings === undefined) return <ListSkeleton />;
  return <SettingsForm settings={settings} />;
}

function SettingsForm({
  settings,
}: {
  settings: Form & { smsOwnAccount: boolean; smsFrom: string; canEdit: boolean; platformEmail: boolean; platformSms: boolean; canStoreSms: boolean };
}) {
  const update = useMutation(api.notify.settings.update);
  const sendTest = useMutation(api.notify.settings.sendTest);
  const canEdit = settings.canEdit;
  const [form, setForm] = React.useState<Form>({
    emailEnabled: settings.emailEnabled,
    smsEnabled: settings.smsEnabled,
    preferredChannel: settings.preferredChannel,
    senderName: settings.senderName,
    replyTo: settings.replyTo,
  });
  const [sms, setSms] = React.useState({ accountSid: "", authToken: "", from: "" });
  const [removeSms, setRemoveSms] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [test, setTest] = React.useState<{ channel: "email" | "sms"; to: string }>({ channel: "email", to: "" });
  const [testing, setTesting] = React.useState(false);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    const filled = [sms.accountSid, sms.authToken, sms.from].filter((x) => x.trim()).length;
    if (filled > 0 && filled < 3) return setError("Fill in the account SID, auth token and sender, or leave all three blank to keep the saved account.");
    setSaving(true);
    try {
      await update({
        ...form,
        sms: removeSms ? null : filled === 3 ? sms : undefined,
      });
      setSms({ accountSid: "", authToken: "", from: "" });
      setRemoveSms(false);
      animatedToast.success("Settings saved");
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    if (!test.to.trim()) return animatedToast.error(test.channel === "email" ? "Enter an email address" : "Enter a phone number");
    setTesting(true);
    try {
      await sendTest({ channel: test.channel, to: test.to.trim() });
      animatedToast.success("Test queued", { description: "Check the log for how it went." });
    } catch (e) {
      animatedToast.error("Test not sent", { description: getErrorMessage(e) });
    } finally {
      setTesting(false);
    }
  }

  const disabled = !canEdit;
  return (
    <div className="space-y-6">
      <p className="flex items-center gap-2 text-sm text-text-muted">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        Credentials are stored encrypted on the server and only directors can change them.
      </p>

      <Section title="Channels">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.emailEnabled} disabled={disabled} onChange={(e) => set({ emailEnabled: e.target.checked })} />
              Email on
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.smsEnabled} disabled={disabled} onChange={(e) => set({ smsEnabled: e.target.checked })} />
              SMS on
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="pref">Preferred channel</Label>
              <Select id="pref" value={form.preferredChannel} disabled={disabled} onChange={(e) => set({ preferredChannel: e.target.value as Form["preferredChannel"] })}>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </Select>
              <p className="text-xs text-text-muted">Used first when a message goes by the agency&apos;s preferred channel. The other is the fallback.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sender">Sender name</Label>
              <Input id="sender" value={form.senderName} disabled={disabled} onChange={(e) => set({ senderName: e.target.value })} placeholder="Your agency" />
              <p className="text-xs text-text-muted">Shown as the sender on emails.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="replyto">Reply-to email</Label>
              <Input id="replyto" type="email" value={form.replyTo} disabled={disabled} onChange={(e) => set({ replyTo: e.target.value })} placeholder="accounts@youragency.co.zw" />
              <p className="text-xs text-text-muted">Where replies to emails go.</p>
            </div>
          </div>
        </div>
      </Section>

      <Section title="SMS account (Twilio)">
        <div className="space-y-4 text-sm">
          {settings.smsOwnAccount && !removeSms ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 p-3">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[var(--status-success-fg)]" />
                Own account saved{settings.smsFrom ? `, sending as ${settings.smsFrom}` : ""}.
              </span>
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={() => setRemoveSms(true)}>
                  Remove
                </Button>
              )}
            </div>
          ) : removeSms ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--status-warning-bg)] p-3 text-[var(--status-warning-fg)]">
              <span>The saved account will be removed when you save.</span>
              <Button variant="ghost" size="sm" onClick={() => setRemoveSms(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <p className="text-text-muted">No own account saved.</p>
          )}
          <p className="text-text-muted">
            {settings.smsOwnAccount
              ? "To replace it, enter all three below. Leave them blank to keep the saved account."
              : "Enter your Twilio details to send SMS from your own account."}{" "}
            The auth token is never shown again once saved.
          </p>
          {!settings.canStoreSms && (
            <p className="text-text-muted">Saving your own SMS account is not available until LayerSync sets the encryption key on this deployment.</p>
          )}
          {canEdit && !removeSms && settings.canStoreSms && (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="sid">Account SID</Label>
                <Input id="sid" autoComplete="off" value={sms.accountSid} onChange={(e) => setSms({ ...sms, accountSid: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="token">Auth token</Label>
                <Input id="token" type="password" autoComplete="new-password" value={sms.authToken} onChange={(e) => setSms({ ...sms, authToken: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="from">Sender</Label>
                <Input id="from" autoComplete="off" value={sms.from} onChange={(e) => setSms({ ...sms, from: e.target.value })} placeholder="+263... or sender ID" />
              </div>
            </div>
          )}
          <div className="space-y-1 text-text-muted">
            <p>Platform email: {settings.platformEmail ? "available as a fallback." : "not set up. Emails are only logged until a provider is added."}</p>
            <p>
              Platform SMS:{" "}
              {settings.platformSms ? "available as a fallback when you have no own account." : "not set up. Add your own account above to send SMS."}
            </p>
          </div>
        </div>
      </Section>

      <FormError message={error} />
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </Button>
        </div>
      )}

      <Section title="Send a test">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[120px] space-y-2">
            <Label htmlFor="test-ch">Channel</Label>
            <Select id="test-ch" value={test.channel} onChange={(e) => setTest({ channel: e.target.value as "email" | "sms", to: "" })}>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </Select>
          </div>
          <div className="min-w-[240px] flex-1 space-y-2">
            <Label htmlFor="test-to">{test.channel === "email" ? "Email address" : "Phone number"}</Label>
            <Input
              id="test-to"
              type={test.channel === "email" ? "email" : "tel"}
              value={test.to}
              onChange={(e) => setTest({ ...test, to: e.target.value })}
              placeholder={test.channel === "email" ? "you@example.com" : "+263 77 123 4567"}
            />
          </div>
          <Button variant="secondary" onClick={runTest} disabled={testing}>
            {testing ? "Sending..." : "Send a test"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-text-muted">Uses the saved settings. Save any changes first.</p>
      </Section>
    </div>
  );
}
