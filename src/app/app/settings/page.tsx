"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";

type Form = {
  name: string;
  defaultCurrency: "USD" | "ZiG";
  address: string;
  phone: string;
  email: string;
  vatNumber: string;
};

/**
 * Agency details printed on receipts, statements and reports. Admins edit;
 * everyone else reads.
 */
export default function AgencySettingsPage() {
  const settings = useQuery(api.hub.getOrgSettings);
  const hubContext = useQuery(api.hub.getContext);
  const update = useMutation(api.hub.updateOrgSettings);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const canEdit = !!hubContext?.isAdmin;

  // Seed the form once the saved values arrive.
  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSave = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      animatedToast.error("Agency name is required");
      return;
    }
    setSaving(true);
    try {
      await update(form);
      animatedToast.success("Agency settings saved");
    } catch (err) {
      animatedToast.error("Could not save settings", { description: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  if (settings === undefined || hubContext === undefined || !form) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-h1">Agency settings</h1>
        <p className="text-sm text-text-muted">
          These details appear on receipts, statements and reports.
          {!canEdit && " Only admins can change them."}
        </p>
      </div>
      <Card className="max-w-2xl">
        <CardHeader>
          <h2 className="text-h3">Agency details</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agency-name">Agency name</Label>
            <Input id="agency-name" value={form.name} readOnly={!canEdit} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agency-currency">Default currency</Label>
            <Select
              id="agency-currency"
              value={form.defaultCurrency}
              disabled={!canEdit}
              onChange={(e) => set("defaultCurrency", e.target.value as "USD" | "ZiG")}
            >
              <option value="USD">USD</option>
              <option value="ZiG">ZiG</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agency-address">Address</Label>
            <Input id="agency-address" value={form.address} readOnly={!canEdit} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agency-phone">Phone</Label>
              <Input id="agency-phone" value={form.phone} readOnly={!canEdit} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agency-email">Email</Label>
              <Input id="agency-email" type="email" value={form.email} readOnly={!canEdit} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agency-vat">VAT number</Label>
            <Input id="agency-vat" value={form.vatNumber} readOnly={!canEdit} onChange={(e) => set("vatNumber", e.target.value)} />
          </div>
          {canEdit && (
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save settings"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
