"use client";

import * as React from "react";
import { use } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Download, FileSignature, Pencil, Receipt, UsersRound } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { Facts, FormError, Section, StayPageHeader } from "@/components/stay/page-header";
import { LeaseStatusBadge } from "@/components/stay/badges";
import { StatementTable } from "@/components/stay/statement-table";
import { PersonFields, personArg, personFormFrom, type PersonForm } from "@/components/stay/person-fields";
import { useRecordPayment } from "@/components/stay/record-payment";
import { PortalAccess } from "@/components/stay/portal-access";
import { dateLabel, heldInLabel, money, todayLocal } from "@/lib/stay/format";
import { downloadTenantStatementPdf } from "@/lib/stay/tenant-statement-pdf";

export default function StayTenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const contactId = id as Id<"contacts">;
  const tenant = useQuery(api.stay.people.getTenant, { contactId });
  const org = useQuery(api.hub.getOrgSettings);
  const branding = useQuery(api.branding.get);
  const updatePerson = useMutation(api.stay.people.updatePerson);
  const { open: openPayment } = useRecordPayment();

  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState<PersonForm | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);

  if (tenant === undefined) return <ListSkeleton />;
  if (tenant === null) {
    return (
      <EmptyState
        icon={UsersRound}
        title="Tenant not found"
        description="They may not be on a lease you manage."
        action={
          <Link href="/app/stay/tenants">
            <Button variant="secondary">Back to tenants</Button>
          </Link>
        }
      />
    );
  }

  const openEdit = () => {
    setForm(personFormFrom(tenant));
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) return setError("Name is required.");
    setSaving(true);
    setError(null);
    try {
      await updatePerson({ contactId, person: personArg(form, false) });
      animatedToast.success("Tenant updated", { description: form.name.trim() });
      setEditing(false);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const downloadStatement = async () => {
    setDownloading(true);
    try {
      await downloadTenantStatementPdf(
        {
          agency: {
            name: org?.name ?? branding?.orgName ?? "",
            address: org?.address || undefined,
            phone: org?.phone || undefined,
            email: org?.email || undefined,
            vatNumber: org?.vatNumber || undefined,
          },
          tenant: { name: tenant.name, phone: tenant.phone, email: tenant.email, idNumber: tenant.idNumber },
          accounts: tenant.accounts.map((a) => ({
            label: a.label,
            status: a.status,
            startDate: a.startDate,
            endDate: a.endDate,
            currency: a.currency,
            balance: a.balance,
            lines: a.lines,
          })),
          asOf: todayLocal(),
        },
        branding?.logoUrl
      );
    } catch (e) {
      animatedToast.error("Could not create the statement", { description: getErrorMessage(e) });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <StayPageHeader
        back={{ href: "/app/stay/tenants", label: "Tenants" }}
        title={tenant.name}
        description={tenant.managerNames.length ? `Managed by ${tenant.managerNames.join(", ")}` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={downloadStatement} disabled={downloading}>
              <Download className="h-4 w-4" />
              {downloading ? "Preparing..." : "Download statement"}
            </Button>
            {tenant.canEdit && (
              <Button variant="secondary" onClick={openEdit}>
                <Pencil className="h-4 w-4" />
                Edit details
              </Button>
            )}
          </>
        }
      />

      <Section
        title="Details"
        actions={<PortalAccess contactId={contactId} kind="tenant" canManage={tenant.canEdit} />}
      >
        <Facts
          items={[
            { label: "Type", value: tenant.entityKind === "company" ? "Company" : "Individual" },
            { label: tenant.entityKind === "company" ? "Registration number" : "ID number", value: tenant.idNumber },
            { label: "Phone", value: tenant.phone ? <a href={`tel:${tenant.phone}`} className="hover:underline">{tenant.phone}</a> : "" },
            { label: "Email", value: tenant.email ? <a href={`mailto:${tenant.email}`} className="hover:underline">{tenant.email}</a> : "" },
          ]}
        />
      </Section>

      {tenant.accounts.length === 0 ? (
        <EmptyState icon={FileSignature} title="No leases" description="This person has no lease you can see." />
      ) : (
        tenant.accounts.map((a) => (
          <Section
            key={a.leaseId}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {a.label}
                <LeaseStatusBadge status={a.status} />
              </span>
            }
            actions={
              <>
                <Link href={`/app/stay/leases/${a.leaseId}`}>
                  <Button variant="secondary" size="sm">
                    Open lease
                  </Button>
                </Link>
                <Button size="sm" className="" onClick={() => openPayment(a.leaseId)}>
                  <Receipt className="h-4 w-4" />
                  Record payment
                </Button>
              </>
            }
          >
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure label="Rent" value={`${money(a.rentAmount, a.currency)} / month`} />
              <Figure
                label={a.balance < 0 ? "In credit" : "Balance"}
                value={money(Math.abs(a.balance), a.currency)}
                tone={a.balance < 0 ? "good" : undefined}
              />
              <Figure label="Overdue" value={money(a.overdue, a.currency)} tone={a.overdue > 0 ? "danger" : undefined} />
              <Figure
                label="Deposit held"
                value={a.deposit ? money(a.deposit.held, a.currency) : "None"}
                hint={a.deposit ? heldInLabel(a.deposit.heldIn) : undefined}
              />
            </div>
            <p className="mb-3 text-xs text-text-muted">
              {dateLabel(a.startDate)} to {dateLabel(a.endDate)}
              {a.credit > 0 ? `. Credit carried forward ${money(a.credit, a.currency)}.` : ""}
            </p>
            <StatementTable lines={a.lines} currency={a.currency} />
          </Section>
        ))
      )}

      <Modal
        open={editing}
        title={`Edit ${tenant.name}`}
        onClose={() => setEditing(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <FormError message={error} />
          {form && <PersonFields value={form} onChange={setForm} role="tenant" excludeId={contactId} />}
        </div>
      </Modal>
    </div>
  );
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "danger" }) {
  const color = tone === "danger" ? "text-danger" : tone === "good" ? "text-[var(--status-success-fg)]" : "";
  return (
    <div className="rounded-[10px] bg-surface-2 p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`mt-1 font-semibold ${color}`}>{value}</p>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
