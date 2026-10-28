"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Receipt, Wallet } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Section, StatTile, StayPageHeader } from "@/components/stay/page-header";
import { useRecordPayment } from "@/components/stay/record-payment";
import { HELD_IN_OPTIONS, formatTotals, heldInLabel, money } from "@/lib/stay/format";

type Status = "held" | "pending" | "settled" | "all";

const STATUS_LABEL: Record<string, string> = { held: "Held", pending: "Not yet received", settled: "Settled" };
const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = { held: "success", pending: "warning", settled: "neutral" };

export default function StayDepositsPage() {
  const { open: openPayment } = useRecordPayment();
  const [status, setStatus] = React.useState<Status>("held");
  const data = useQuery(api.stay.deposits.list, { status });

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Deposits"
        description="Deposits are held against the lease, apart from rent. Apply or refund them at move-out from the lease."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total held" value={data ? formatTotals(data.total) : "..."} tone="good" />
        {HELD_IN_OPTIONS.map((h) => (
          <StatTile key={h.value} label={h.label} value={data ? formatTotals(data.byHeldIn[h.value] ?? {}) : "..."} />
        ))}
      </div>

      <div className="rounded-[12px] border border-border-strong bg-card-bg p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Show</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="held">Held</option>
              <option value="pending">Not yet received</option>
              <option value="settled">Settled</option>
              <option value="all">All deposits</option>
            </Select>
          </div>
          <div className="flex items-end sm:col-span-2">
            <p className="text-sm text-text-muted">{data ? `${data.rows.length} deposit${data.rows.length === 1 ? "" : "s"}` : "Loading..."}</p>
          </div>
        </div>
      </div>

      {data === undefined ? (
        <ListSkeleton />
      ) : (
        <>
          {(data.byProperty.length > 0 || data.byLandlord.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Section title="Held by property">
                <ul className="divide-y divide-border text-sm">
                  {data.byProperty.map((p) => (
                    <li key={p.name} className="flex items-start justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block font-medium">{p.name}</span>
                        <span className="block text-xs text-text-muted">
                          {p.landlordName}, {p.count} deposit{p.count === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right font-medium">{formatTotals(p.totals)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="Held by landlord">
                <ul className="divide-y divide-border text-sm">
                  {data.byLandlord.map((l) => (
                    <li key={l.name} className="flex items-start justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block font-medium">{l.name}</span>
                        <span className="block text-xs text-text-muted">
                          {l.count} deposit{l.count === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right font-medium">{formatTotals(l.totals)}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          )}

          {data.rows.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={status === "held" ? "No deposits held" : "No deposits"}
              description="A deposit is set on the lease and receipted with Record payment."
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <thead>
                    <tr>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">Applied</TableHead>
                      <TableHead className="text-right">Refunded</TableHead>
                      <TableHead className="text-right">Held</TableHead>
                      <TableHead>Held in</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell>
                          <Link href={`/app/stay/leases/${r.leaseId}`} className="font-medium hover:underline">
                            {r.tenantName}
                          </Link>
                          <div className="mt-1 flex gap-1">
                            <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                            {r.leaseStatus === "ended" && <Badge variant="neutral">Lease ended</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.propertyName}, {r.unitLabel}
                          <div className="text-xs text-text-muted">{r.landlordName}</div>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{money(r.expected, r.currency)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{money(r.received, r.currency)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{r.applied ? money(r.applied, r.currency) : "-"}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{r.refunded ? money(r.refunded, r.currency) : "-"}</TableCell>
                        <TableCell className="text-right whitespace-nowrap font-semibold">{money(r.held, r.currency)}</TableCell>
                        <TableCell className="text-sm">{heldInLabel(r.heldIn)}</TableCell>
                        <TableCell className="text-right">
                          {r.received < r.expected && r.status !== "settled" ? (
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openPayment(r.leaseId)}>
                              <Receipt className="h-4 w-4" />
                              Record deposit
                            </Button>
                          ) : (
                            <Link href={`/app/stay/leases/${r.leaseId}`}>
                              <Button size="sm" variant="secondary">
                                Open lease
                              </Button>
                            </Link>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {data.rows.map((r) => (
                  <div key={r._id} className="rounded-[12px] border border-border-strong bg-card-bg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/app/stay/leases/${r.leaseId}`} className="font-medium">
                          {r.tenantName}
                        </Link>
                        <p className="truncate text-xs text-text-muted">
                          {r.propertyName}, {r.unitLabel}
                        </p>
                        <p className="text-xs text-text-muted">{heldInLabel(r.heldIn)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold">{money(r.held, r.currency)}</p>
                        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-text-muted">
                      Expected {money(r.expected, r.currency)}, received {money(r.received, r.currency)}
                      {r.applied ? `, applied ${money(r.applied, r.currency)}` : ""}
                      {r.refunded ? `, refunded ${money(r.refunded, r.currency)}` : ""}
                    </p>
                    {r.received < r.expected && r.status !== "settled" && (
                      <Button className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => openPayment(r.leaseId)}>
                        <Receipt className="h-4 w-4" />
                        Record deposit
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
