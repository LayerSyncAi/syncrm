"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { AlertTriangle } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export type PersonForm = {
  name: string;
  phone: string;
  email: string;
  entityKind: "individual" | "company";
  idNumber: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string;
};

export const EMPTY_PERSON: PersonForm = {
  name: "",
  phone: "",
  email: "",
  entityKind: "individual",
  idNumber: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  branch: "",
};

/** The person shape the Stay mutations take. */
export function personArg(f: PersonForm, withBank: boolean) {
  const t = (s: string) => s.trim() || undefined;
  return {
    name: f.name.trim(),
    phone: t(f.phone),
    email: t(f.email),
    entityKind: f.entityKind,
    idNumber: t(f.idNumber),
    ...(withBank
      ? {
          bankDetails: {
            bankName: t(f.bankName),
            accountName: t(f.accountName),
            accountNumber: t(f.accountNumber),
            branch: t(f.branch),
          },
        }
      : {}),
  };
}

export function personFormFrom(p: {
  name: string;
  phone?: string;
  email?: string;
  entityKind?: string;
  idNumber?: string;
  bankDetails?: { bankName?: string; accountName?: string; accountNumber?: string; branch?: string };
}): PersonForm {
  return {
    name: p.name,
    phone: p.phone ?? "",
    email: p.email ?? "",
    entityKind: p.entityKind === "company" ? "company" : "individual",
    idNumber: p.idNumber ?? "",
    bankName: p.bankDetails?.bankName ?? "",
    accountName: p.bankDetails?.accountName ?? "",
    accountNumber: p.bankDetails?.accountNumber ?? "",
    branch: p.bankDetails?.branch ?? "",
  };
}

function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Name, contact, ID and (for landlords) bank fields, with a warning when the
 * phone or email already belongs to a contact. `onUseExisting` lets the form
 * link that contact instead of creating a duplicate.
 */
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
  const phone = useDebounced(value.phone.trim());
  const email = useDebounced(value.email.trim());
  const dupes = useQuery(
    api.stay.people.findDuplicates,
    phone.replace(/\D/g, "").length >= 7 || email.includes("@")
      ? { phone: phone || undefined, email: email || undefined, excludeId }
      : "skip"
  );
  const set = (patch: Partial<PersonForm>) => onChange({ ...value, ...patch });
  const isCompany = value.entityKind === "company";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>
            {isCompany ? "Company name" : "Full name"} <span className="text-danger">*</span>
          </Label>
          <Input value={value.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" />
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={value.entityKind} onChange={(e) => set({ entityKind: e.target.value as PersonForm["entityKind"] })}>
            <option value="individual">Individual</option>
            <option value="company">Company</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{isCompany ? "Company registration number" : "ID number"}</Label>
          <Input value={value.idNumber} onChange={(e) => set({ idNumber: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input type="tel" inputMode="tel" value={value.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+263 77 123 4567" />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input type="email" inputMode="email" value={value.email} onChange={(e) => set({ email: e.target.value })} />
        </div>
      </div>

      {dupes && dupes.length > 0 && (
        <div className="space-y-2 rounded-lg border border-[var(--status-warning-fg)]/30 bg-[var(--status-warning-bg)] p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-[var(--status-warning-fg)]">
            <AlertTriangle className="h-4 w-4" />
            This may already be on file
          </p>
          {dupes.map((d) => (
            <div key={d._id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {d.name}
                <span className="text-text-muted"> {[d.phone, d.email].filter(Boolean).join(", ")}</span>
                {d.isLandlord && <span className="text-text-muted"> (landlord)</span>}
                {d.isTenant && <span className="text-text-muted"> (tenant)</span>}
              </span>
              {onUseExisting && (
                <Button size="sm" variant="secondary" type="button" onClick={() => onUseExisting(d)}>
                  Use this contact
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {role === "landlord" && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Bank details for payouts</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Bank</Label>
              <Input value={value.bankName} onChange={(e) => set({ bankName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Input value={value.branch} onChange={(e) => set({ branch: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Account name</Label>
              <Input value={value.accountName} onChange={(e) => set({ accountName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Account number</Label>
              <Input value={value.accountNumber} onChange={(e) => set({ accountNumber: e.target.value })} inputMode="numeric" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
