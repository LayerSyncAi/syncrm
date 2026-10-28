"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertTriangle, Mail, Phone, Receipt, Wrench } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyMap, NotAvailable, PageTitle, PortalLoading, Stat, usePortal } from "@/components/portal/common";
import { formatMoney } from "@/lib/currency";
import { formatDay } from "@/lib/stay-ops/labels";
import { Home } from "lucide-react";

function TenantHome({ orgPhone, orgEmail }: { orgPhone: string | null; orgEmail: string | null }) {
  const leases = useQuery(api.portal.tenant.home);
  if (leases === undefined) return <PortalLoading />;
  return (
    <>
      <PageTitle title="Home" />
      {leases.length === 0 ? (
        <EmptyState icon={Home} title="No lease yet" description="Your lease will appear here once the agency has set it up." />
      ) : (
        <div className="space-y-4">
          {leases.map((l) => {
            const credit = l.balance < 0;
            return (
              <Card key={l._id}>
                <CardContent className="space-y-3 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text">{l.propertyTitle}, {l.unitLabel}</p>
                      {l.propertyLocation && <p className="truncate text-xs text-text-muted">{l.propertyLocation}</p>}
                    </div>
                    {l.status !== "active" && <Badge variant="neutral">{l.status}</Badge>}
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Current balance</p>
                    <p className={`text-2xl font-semibold ${credit ? "text-[var(--status-success-fg)]" : "text-text"}`}>
                      {credit ? `In credit ${formatMoney(Math.abs(l.balance), l.currency)}` : formatMoney(l.balance, l.currency)}
                    </p>
                  </div>
                  {l.overdue && (
                    <p className="flex items-center gap-2 rounded-[10px] bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger-fg)]">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Rent is overdue. Please pay as soon as you can.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-text-muted">Rent</p>
                      <p className="text-text">{formatMoney(l.rentAmount, l.currency)}</p>
                    </div>
                    {l.nextDueDate && (
                      <div>
                        <p className="text-xs text-text-muted">Next due</p>
                        <p className="text-text">{formatDay(l.nextDueDate)}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link href="/portal/payments" className="flex min-h-14 items-center justify-center gap-2 rounded-[12px] border border-border bg-card-bg px-3 text-sm font-medium text-text">
          <Receipt className="h-5 w-5 text-primary-600" />
          Payments
        </Link>
        <Link href="/portal/maintenance" className="flex min-h-14 items-center justify-center gap-2 rounded-[12px] border border-border bg-card-bg px-3 text-sm font-medium text-text">
          <Wrench className="h-5 w-5 text-primary-600" />
          Report a repair
        </Link>
      </div>

      {(orgPhone || orgEmail) && (
        <Card className="mt-4">
          <CardContent className="space-y-1 pt-5 text-sm">
            <p className="font-medium text-text">Need help?</p>
            {orgPhone && (
              <a href={`tel:${orgPhone}`} className="flex min-h-10 items-center gap-2 text-primary-600">
                <Phone className="h-4 w-4" /> {orgPhone}
              </a>
            )}
            {orgEmail && (
              <a href={`mailto:${orgEmail}`} className="flex min-h-10 items-center gap-2 text-primary-600">
                <Mail className="h-4 w-4" /> {orgEmail}
              </a>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function LandlordHome() {
  const h = useQuery(api.portal.landlord.home);
  if (h === undefined) return <PortalLoading />;
  const hasArrears = Object.values(h.arrears).some((n) => n);
  return (
    <>
      <PageTitle title="Home" />
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Rent collected this month"><MoneyMap value={h.collected} /></Stat>
        <Stat label="Arrears" tone={hasArrears ? "danger" : undefined}><MoneyMap value={h.arrears} /></Stat>
        <Stat label="Occupancy">{h.occupied} of {h.units} units</Stat>
        <Stat label="Open repairs">{h.openRepairs}</Stat>
        <Stat label="Properties">{h.properties}</Stat>
      </div>
    </>
  );
}

export default function PortalHomePage() {
  const portal = usePortal();
  if (portal === undefined) return <PortalLoading />;
  if (!portal) return <NotAvailable />;
  return portal.kind === "tenant" ? (
    <TenantHome orgPhone={portal.orgPhone} orgEmail={portal.orgEmail} />
  ) : (
    <LandlordHome />
  );
}
