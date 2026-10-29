"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { Ban, Building2, FileText, Pencil, Percent, Plus, Receipt, Send, Undo2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Section, StayPageHeader } from "@/components/stay/page-header";
import { dateLabel, money, type FinCurrency } from "@/lib/finance/format";
import { CancelSaleModal, DevelopmentModal, InterestModal, PlanModal, StandMoneyModal, r2 } from "./modals";
import { useSalesFinance, type Development, type SaleRow } from "./shared";

function statusBadge(s: SaleRow) {
  if (s.status === "cancelled") return <Badge variant="neutral">Cancelled</Badge>;
  if (s.status === "paid") return <Badge variant="success">Paid in full</Badge>;
  if (s.overdue > 0) return <Badge variant="danger">Overdue</Badge>;
  return <Badge variant="info">On track</Badge>;
}

/**
 * Buyers paying for stands on a plan. Shared by Sync Finance (Instalments)
 * and Sync Dev (Buyers); `basePath` is where each buyer's statement lives.
 * The caller makes sure the user may use sales before this renders.
 */
export function InstalmentsView({
  basePath,
  module,
  title,
  description,
  notice,
}: {
  basePath: string;
  module: "finance" | "dev";
  title: string;
  description: string;
  notice?: React.ReactNode;
}) {
  const router = useRouter();
  const summary = useQuery(api.dev.dashboard.summary);
  const role = summary?.role;
  const { hub, today, accountsFor, loading } = useSalesFinance(role?.financeOn);
  const devs = useQuery(api.dev.sales.listDevelopments);
  const stands = useQuery(api.dev.sales.listStands, {});
  const isDev = module === "dev";
  const people = isDev ? "Buyers" : "Clients";

  const [devFilter, setDevFilter] = React.useState("");
  const [overdueOnly, setOverdueOnly] = React.useState(false);
  const [showCancelled, setShowCancelled] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [devModal, setDevModal] = React.useState<Development | "new" | null>(null);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [interestOpen, setInterestOpen] = React.useState(false);
  const [receiving, setReceiving] = React.useState<SaleRow | null>(null);
  const [refunding, setRefunding] = React.useState<SaleRow | null>(null);
  const [cancelling, setCancelling] = React.useState<SaleRow | null>(null);

  const totals = React.useMemo(() => {
    const by = new Map<FinCurrency, { contracted: number; paid: number; outstanding: number; overdue: number; interest: number; clientsOverdue: number }>();
    for (const s of stands ?? []) {
      if (s.status === "cancelled") continue;
      const t = by.get(s.currency) ?? { contracted: 0, paid: 0, outstanding: 0, overdue: 0, interest: 0, clientsOverdue: 0 };
      t.contracted = r2(t.contracted + s.price);
      t.paid = r2(t.paid + s.paidToDate);
      t.outstanding = r2(t.outstanding + s.balance);
      t.overdue = r2(t.overdue + s.overdue);
      t.interest = r2(t.interest + s.interest);
      if (s.overdue > 0) t.clientsOverdue++;
      by.set(s.currency, t);
    }
    return (["USD", "ZiG"] as const).filter((c) => by.has(c)).map((c) => ({ currency: c, ...by.get(c)! }));
  }, [stands]);

  const shown = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (stands ?? []).filter(
      (s) =>
        (!devFilter || s.developmentId === devFilter) &&
        (!overdueOnly || s.overdue > 0) &&
        (showCancelled || s.status !== "cancelled") &&
        (!q || `${s.buyerName} ${s.standNumber} ${s.development} ${s.buyerPhone}`.toLowerCase().includes(q))
    );
  }, [stands, devFilter, overdueOnly, showCancelled, search]);

  if (summary === undefined || loading) return <ListSkeleton />;
  const canManage = summary.role.canManage;
  const financeOn = summary.role.financeOn;
  const interestDevs = (devs ?? []).filter((d) => (d.interestPctPerMonth ?? 0) > 0);
  // The column only earns its space once someone has been charged interest.
  const anyInterest = (shown ?? []).some((s) => s.interest > 0);

  const iconButton = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <Tooltip content={label}>
      <Button variant="secondary" className="h-9 w-9 p-0" aria-label={label} onClick={onClick}>
        {icon}
      </Button>
    </Tooltip>
  );

  const actions = (s: SaleRow) => (
    <div className="flex justify-end gap-1.5">
      {canManage && s.status === "active" && iconButton(`Receive payment from ${s.buyerName}`, <Receipt className="h-4 w-4" />, () => setReceiving(s))}
      <Tooltip content="Open statement">
        <Link href={`${basePath}/${s._id}`}>
          <Button variant="secondary" className="h-9 w-9 p-0" aria-label={`Statement for ${s.buyerName}`}>
            <FileText className="h-4 w-4" />
          </Button>
        </Link>
      </Tooltip>
      {canManage && s.status === "cancelled" && s.paidToDate > 0 && iconButton(`Refund ${s.buyerName}`, <Undo2 className="h-4 w-4" />, () => setRefunding(s))}
      {canManage && s.status !== "cancelled" && iconButton(`Cancel sale of stand ${s.standNumber}`, <Ban className="h-4 w-4" />, () => setCancelling(s))}
    </div>
  );

  return (
    <div className="space-y-6">
      <StayPageHeader
        title={title}
        description={description}
        actions={
          canManage && (
            <>
              {interestDevs.length > 0 && (
                <Button variant="secondary" className="gap-2" onClick={() => setInterestOpen(true)}>
                  <Percent className="h-4 w-4" />
                  Charge interest
                </Button>
              )}
              <Button className="h-11 gap-2 px-5" onClick={() => setPlanOpen(true)} disabled={!devs?.some((d) => d.isActive)}>
                <Plus className="h-4 w-4" />
                {isDev ? "New sale" : "New client plan"}
              </Button>
            </>
          )
        }
      />

      {notice}

      <Section
        title={isDev ? "Money with buyers" : "Money with clients"}
        actions={
          hub?.canNotify && (
            <Link href="/app/notify?audience=instalments&filter=overdue">
              <Button variant="secondary" className="h-9 gap-2">
                <Send className="h-4 w-4" />
                Send follow-ups
              </Button>
            </Link>
          )
        }
      >
        {stands === undefined ? (
          <ListSkeleton rows={2} />
        ) : totals.length === 0 ? (
          <p className="text-sm text-text-muted">No {people.toLowerCase()} on plans yet.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {totals.map((t) => (
              <dl key={t.currency} className="grid grid-cols-2 gap-3 rounded-[10px] border border-border p-3 text-sm sm:grid-cols-3">
                <div className="col-span-2 font-semibold sm:col-span-3">{t.currency}</div>
                <div>
                  <dt className="text-xs text-text-muted">Total contracted</dt>
                  <dd className="font-medium">{money(t.contracted, t.currency)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Paid to date</dt>
                  <dd className="font-medium text-[var(--status-success-fg)]">{money(t.paid, t.currency)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Owed</dt>
                  <dd className="font-medium">{money(t.outstanding, t.currency)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Overdue</dt>
                  <dd className={t.overdue > 0 ? "font-medium text-danger" : "font-medium"}>{money(t.overdue, t.currency)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">Interest charged</dt>
                  <dd className="font-medium">{money(t.interest, t.currency)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">{people} overdue</dt>
                  <dd className="font-medium">{t.clientsOverdue}</dd>
                </div>
              </dl>
            ))}
          </div>
        )}
      </Section>

      {!isDev && (
        <Section
          title="Developments"
          actions={
            canManage && (
              <Button variant="secondary" className="h-9 gap-2" onClick={() => setDevModal("new")}>
                <Plus className="h-4 w-4" />
                Add development
              </Button>
            )
          }
        >
          {devs === undefined ? (
            <ListSkeleton rows={2} />
          ) : devs.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No developments yet"
              description="Add the development first. It sets the currency, who holds the money and the commission."
              action={canManage ? <Button onClick={() => setDevModal("new")}>Add development</Button> : undefined}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {devs.map((d) => (
                <div key={d._id} className={`rounded-[10px] border border-border p-3 text-sm ${d.isActive ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{d.name}</p>
                      <p className="text-xs text-text-muted">
                        {d.developerName} · {d.currency} · money held by {d.moneyHeldBy === "developer" ? "the developer" : "us, in trust"}
                      </p>
                      <p className="text-xs text-text-muted">
                        Commission {d.commissionPct}% {d.commissionTiming === "each_payment" ? "on each payment" : "when fully paid"}
                        {d.interestPctPerMonth ? ` · interest ${d.interestPctPerMonth}% a month` : " · no interest"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!d.isActive && <Badge variant="neutral">Closed</Badge>}
                      {canManage && iconButton(`Edit ${d.name}`, <Pencil className="h-4 w-4" />, () => setDevModal(d))}
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-text-muted">Clients</dt>
                      <dd>{d.sold}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">Collected</dt>
                      <dd>{money(d.collected, d.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">Owed</dt>
                      <dd>{money(d.outstanding, d.currency)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">Overdue</dt>
                      <dd className={d.overdue > 0 ? "text-danger" : ""}>{money(d.overdue, d.currency)}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      <div className="space-y-3">
        {!isDev && <h2 className="text-base font-semibold">{people}</h2>}
        <div className="grid gap-3 rounded-[12px] border border-border-strong bg-card-bg p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto]">
          <div className="space-y-2">
            <Label>Search</Label>
            <Input placeholder="Buyer, stand or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Development</Label>
            <Select value={devFilter} onChange={(e) => setDevFilter(e.target.value)}>
              <option value="">All developments</option>
              {(devs ?? []).map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
            Overdue only
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            Show cancelled
          </label>
        </div>

        {stands === undefined ? (
          <ListSkeleton />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={`No ${people.toLowerCase()} to show`}
            description={isDev ? "Sell a stand from a development to start tracking the buyer's plan." : "Add a client plan to start tracking their instalments."}
            action={
              isDev && stands.length === 0 ? (
                <Link href="/app/dev/developments">
                  <Button variant="secondary">Go to developments</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <Table>
                <thead>
                  <tr>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Stand</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    {anyInterest && <TableHead className="text-right">Interest</TableHead>}
                    <TableHead>Next due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
                    <TableRow key={s._id} className={s.status === "cancelled" ? "opacity-60" : ""}>
                      <TableCell>
                        <Link href={`${basePath}/${s._id}`} className="whitespace-nowrap font-medium hover:underline">
                          {s.buyerName}
                        </Link>
                        {s.buyerPhone && <div className="whitespace-nowrap text-xs text-text-muted">{s.buyerPhone}</div>}
                      </TableCell>
                      <TableCell>
                        <div>{s.standNumber}</div>
                        <div className="text-xs text-text-muted">{s.development}</div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{money(s.price, s.currency)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{money(s.paidToDate, s.currency)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap font-medium">{money(s.balance, s.currency)}</TableCell>
                      <TableCell className={`text-right whitespace-nowrap ${s.overdue > 0 ? "text-danger" : ""}`}>{money(s.overdue, s.currency)}</TableCell>
                      {anyInterest && <TableCell className="text-right whitespace-nowrap">{s.interest > 0 ? money(s.interest, s.currency) : "-"}</TableCell>}
                      <TableCell className="whitespace-nowrap">
                        {s.nextDueDate ? (
                          <>
                            <div>{dateLabel(s.nextDueDate)}</div>
                            <div className="text-xs text-text-muted">{money(s.nextDueAmount, s.currency)}</div>
                          </>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(s)}</TableCell>
                      <TableCell className="text-right">{actions(s)}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </div>

            <div className="space-y-3 lg:hidden">
              {shown.map((s) => (
                <div key={s._id} className={`rounded-[12px] border border-border-strong bg-card-bg p-4 ${s.status === "cancelled" ? "opacity-70" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`${basePath}/${s._id}`} className="font-medium hover:underline">
                        {s.buyerName}
                      </Link>
                      <p className="text-xs text-text-muted">
                        Stand {s.standNumber}, {s.development}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{money(s.balance, s.currency)}</p>
                      {statusBadge(s)}
                    </div>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <dt className="text-text-muted">Paid to date</dt>
                    <dd className="text-right">{money(s.paidToDate, s.currency)}</dd>
                    {s.overdue > 0 && (
                      <>
                        <dt className="text-text-muted">Overdue</dt>
                        <dd className="text-right text-danger">{money(s.overdue, s.currency)}</dd>
                      </>
                    )}
                    {s.nextDueDate && (
                      <>
                        <dt className="text-text-muted">Next due</dt>
                        <dd className="text-right">
                          {money(s.nextDueAmount, s.currency)} on {dateLabel(s.nextDueDate)}
                        </dd>
                      </>
                    )}
                  </dl>
                  <div className="mt-3">{actions(s)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {devModal && <DevelopmentModal dev={devModal === "new" ? null : devModal} financeOn={financeOn} onClose={() => setDevModal(null)} />}
      {planOpen && devs && (
        <PlanModal
          devs={devs.filter((d) => d.isActive)}
          today={today}
          title={isDev ? "New sale" : "New client plan"}
          onClose={() => setPlanOpen(false)}
          onCreated={isDev ? (id) => router.push(`${basePath}/${id}`) : undefined}
        />
      )}
      {interestOpen && <InterestModal devs={interestDevs} today={today} onClose={() => setInterestOpen(false)} />}
      {receiving && (
        <StandMoneyModal
          mode="receive"
          sale={receiving}
          defaultAmount={receiving.overdue > 0 ? receiving.overdue : receiving.nextDueAmount ?? 0}
          today={today}
          accounts={accountsFor(receiving.currency)}
          onClose={() => setReceiving(null)}
        />
      )}
      {refunding && <StandMoneyModal mode="refund" sale={refunding} defaultAmount={0} today={today} accounts={accountsFor(refunding.currency)} onClose={() => setRefunding(null)} />}
      {cancelling && <CancelSaleModal sale={cancelling} onClose={() => setCancelling(null)} />}
    </div>
  );
}
