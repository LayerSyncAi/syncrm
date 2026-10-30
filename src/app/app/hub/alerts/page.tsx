"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import type { NotificationModule } from "../../../../../convex/lib/modules";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { animatedToast } from "@/components/ui/animated-toaster";
import { notificationModuleName } from "@/components/hub/format";
import { getErrorMessage } from "@/lib/errors";

/**
 * HB-61: each user chooses which modules' alerts also arrive by email. The
 * notification centre always shows every alert; this only adds the email.
 */
export default function EmailAlertsPage() {
  const prefs = useQuery(api.notifications.myEmailAlerts);
  const save = useMutation(api.notifications.setMyEmailAlerts);
  const [draft, setDraft] = useState<NotificationModule[] | null>(null);
  const [saving, setSaving] = useState(false);

  // Seed the form once the saved values arrive.
  useEffect(() => {
    if (prefs && !draft) setDraft(prefs.selected);
  }, [prefs, draft]);

  if (prefs === undefined || !draft) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  const toggle = (m: NotificationModule) =>
    setDraft((prev) => (prev ? (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]) : prev));

  const dirty =
    draft.length !== prefs.selected.length || draft.some((m) => !prefs.selected.includes(m));

  const handleSave = async () => {
    setSaving(true);
    try {
      await save({ modules: draft });
      animatedToast.success("Email alerts saved");
    } catch (err) {
      animatedToast.error("Could not save email alerts", { description: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-h1">Email alerts</h1>
        <p className="text-sm text-text-muted">
          Every alert appears in the notification centre. Choose which ones should also be emailed to you
          {prefs.email ? <> at <span className="text-text">{prefs.email}</span></> : null}.
        </p>
      </div>
      <Card className="max-w-2xl">
        <CardHeader>
          <h2 className="text-h3">Also send by email</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          {!prefs.email && (
            <p className="text-sm text-warning">Your account has no email address, so no alert emails can be sent.</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {prefs.choices.map((m) => (
              <label
                key={m}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={draft.includes(m)}
                  onChange={() => toggle(m)}
                  disabled={saving}
                  className="h-4 w-4 rounded border-border"
                />
                {notificationModuleName(m)} alerts
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || !dirty}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
