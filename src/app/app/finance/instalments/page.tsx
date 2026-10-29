"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Ban, Building2, FileText, Lock, Pencil, Percent, Plus, Receipt, Send, Trash2, Undo2 } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { buildPlan } from "../../../../../convex/finance/lib";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Tooltip } from "@/components/ui/tooltip";
import { Table, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { FormError, Section, StayPageHeader } from "@/components/stay/page-header";
import {
  CURRENCY_OPTIONS,
  METHOD_OPTIONS,
  addMonths,
  dateLabel,
  money,
  parseAmount,
  periodLabel,
  type FinCurrency,
} from "@/lib/finance/format";

type Method = (typeof METHOD_OPTIONS)[number]["value"];
type Account = { _id: Id<"finAccounts">; name: string; currency: FinCurrency; type: string };

type StandRow = {
  _id: Id<"finStands">;
  developmentId: Id<"finDevelopments">;
  development: string;
  standNumber: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  currency: FinCurrency;
  price: number;
  interest: number;
  paidToDate: number;
  balance: number;
  overdue: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  status: "active" | "paid" | "cancelled";
};

type Development = {
  _id: Id<"finDevelopments">;
  name: string;
  developerName: string;
  developerEmail?: string;
  moneyHeldBy: "developer" | "agency_trust";
  commissionPct: number;
  commissionTiming: "each_payment" | "fully_paid";
  interestPctPerMonth?: number;
  currency: FinCurrency;
  isActive: boolean;
  stands: number;
  contracted: number;
  collected: number;
  outstanding: number;
  overdue: number;
};

const HELD_BY_LABELS = { developer: "The developer (our client)", agency_trust: "Us, in trust, for the developer" } as const;
const TIMING_LABELS = { each_payment: "On each payment received", fully_paid: "When the stand is fully paid" } as const;

const r2 = (n: number) => Math.round(n * 100) / 100;

function statusBadge(s: StandRow) {
  if (s.status === "cancelled") return <Badge variant="neutral">Cancelled</Badge>;
  if (s.status === "paid") return <Badge variant="success">Paid in full</Badge>;
  if (s.overdue > 0) return <Badge variant="danger">Overdue</Badge>;
  return <Badge variant="info">On track</Badge>;
}

export default function FinanceInstalmentsPage() {
  const fin = useQuery(api.finance.settings.get);
  const staff = !!fin?.role.isStaff;
  const devs = useQuery(api.finance.stands.listDevelopments, staff ? {} : "skip") as Development[] | undefined;
  const stands = useQuery(api.finance.stands.listStands, staff ? {} : "skip") as StandRow[] | undefined;

  const [devFilter, setDevFilter] = React.useState("");
  const [overdueOnly, setOverdueOnly] = React.useState(false);
  const [showCancelled, setShowCancelled] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [devModal, setDevModal] = React.useState<Development | "new" | null>(null);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [interestOpen, setInterestOpen] = React.useState(false);
  const [receiving, setReceiving] = React.useState<StandRow | null>(null);
  const [refunding, setRefunding] = React.useState<StandRow | null>(null);
  const [cancelling, setCancelling] = React.useState<StandRow | null>(null);

  const summary = React.useMemo(() => {
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

  if (fin === undefined) return <ListSkeleton />;
  if (!staff) {
    return <EmptyState icon={Lock} title="Instalments are for directors and accounts staff" description="Ask your director if you need access." />;
  }

  const accounts: Account[] = fin.accounts.filter((a) => a.isActive).map((a) => ({ _id: a._id, name: a.name, currency: a.currency, type: a.type }));

  const iconButton = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <Tooltip content={label}>
      <Button variant="secondary" className="h-9 w-9 p-0" aria-label={label} onClick={onClick}>
        {icon}
      </Button>
    </Tooltip>
  );

  const actions = (s: StandRow) => (
    <div className="flex justify-end gap-1.5">
      {s.status === "active" && iconButton(`Receive payment from ${s.buyerName}`, <Receipt className="h-4 w-4" />, () => setReceiving(s))}
      <Tooltip content="Open statement">
        <Link href={`/app/finance/instalments/${s._id}`}>
          <Button variant="secondary" className="h-9 w-9 p-0" aria-label={`Statement for ${s.buyerName}`}>
            <FileText className="h-4 w-4" />
          </Button>
        </Link>
      </Tooltip>
      {s.status === "cancelled" && s.paidToDate > 0 && iconButton(`Refund ${s.buyerName}`, <Undo2 className="h-4 w-4" />, () => setRefunding(s))}
      {s.status !== "cancelled" && iconButton(`Cancel sale of stand ${s.standNumber}`, <Ban className="h-4 w-4" />, () => setCancelling(s))}
    </div>
  );

  return (
    <div className="space-y-6">
      <StayPageHeader
        title="Instalments"
        description="Clients paying for stands, or anything else sold on a monthly plan."
        actions={
          <>
            <Button variant="secondary" className="gap-2" onClick={() => setInterestOpen(true)}>
              <Percent className="h-4 w-4" />
              Charge interest
            </Button>
            <Button className="h-11 gap-2 px-5" onClick={() => setPlanOpen(true)} disabled={!devs?.some((d) => d.isActive)}>
              <Plus className="h-4 w-4" />
              New client plan
            </Button>
          </>
        }
      />

      <Section
        title="Money with clients"
        actions={
          <Link href="/app/notify?audience=instalments&filter=overdue">
            <Button variant="secondary" className="h-9 gap-2">
              <Send className="h-4 w-4" />
              Send follow-ups
            </Button>
          </Link>
        }
      >
        {stands === undefined ? (
          <ListSkeleton rows={2} />
        ) : summary.length === 0 ? (
          <p className="text-sm text-text-muted">No client plans yet.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {summary.map((t) => (
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
                  <dt className="text-xs text-text-muted">Outstanding</dt>
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
                  <dt className="text-xs text-text-muted">Clients overdue</dt>
                  <dd className="font-medium">{t.clientsOverdue}</dd>
                </div>
              </dl>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Developments"
        actions={
          <Button variant="secondary" className="h-9 gap-2" onClick={() => setDevModal("new")}>
            <Plus className="h-4 w-4" />
            Add development
          </Button>
        }
      >
        {devs === undefined ? (
          <ListSkeleton rows={2} />
        ) : devs.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No developments yet"
            description="Add the development first. It sets the currency, who holds the money and the commission."
            action={<Button onClick={() => setDevModal("new")}>Add development</Button>}
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
                    {iconButton(`Edit ${d.name}`, <Pencil className="h-4 w-4" />, () => setDevModal(d))}
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-text-muted">Clients</dt>
                    <dd>{d.stands}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Collected</dt>
                    <dd>{money(d.collected, d.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">Outstanding</dt>
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

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Clients</h2>
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
          <EmptyState icon={Receipt} title="No clients to show" description="Add a client plan to start tracking their instalments." />
        ) : (
          <>
            <div className="hidden lg:block">
              <Table>
                <thead>
                  <tr>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Stand</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Paid to date</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead className="text-right">Interest</TableHead>
                    <TableHead>Next due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
                    <TableRow key={s._id} className={s.status === "cancelled" ? "opacity-60" : ""}>
                      <TableCell>
                        <Link href={`/app/finance/instalments/${s._id}`} className="font-medium hover:underline">
                          {s.buyerName}
                        </Link>
                        {s.buyerPhone && <div className="text-xs text-text-muted">{s.buyerPhone}</div>}
                      </TableCell>
                      <TableCell>
                        <div>{s.standNumber}</div>
                        <div className="text-xs text-text-muted">{s.development}</div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{money(s.price, s.currency)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{money(s.paidToDate, s.currency)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap font-medium">{money(s.balance, s.currency)}</TableCell>
                      <TableCell className={`text-right whitespace-nowrap ${s.overdue > 0 ? "text-danger" : ""}`}>{money(s.overdue, s.currency)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{s.interest > 0 ? money(s.interest, s.currency) : "-"}</TableCell>
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
                      <Link href={`/app/finance/instalments/${s._id}`} className="font-medium hover:underline">
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

      {devModal && <DevelopmentModal dev={devModal === "new" ? null : devModal} onClose={() => setDevModal(null)} />}
      {planOpen && devs && <PlanModal devs={devs.filter((d) => d.isActive)} today={fin.today} onClose={() => setPlanOpen(false)} />}
      {interestOpen && devs && <InterestModal devs={devs.filter((d) => (d.interestPctPerMonth ?? 0) > 0)} today={fin.today} onClose={() => setInterestOpen(false)} />}
      {receiving && (
        <StandMoneyModal mode="receive" stand={receiving} today={fin.today} accounts={accounts.filter((a) => a.currency === receiving.currency)} onClose={() => setReceiving(null)} />
      )}
      {refunding && (
        <StandMoneyModal mode="refund" stand={refunding} today={fin.today} accounts={accounts.filter((a) => a.currency === refunding.currency)} onClose={() => setRefunding(null)} />
      )}
      {cancelling && <CancelSaleModal stand={cancelling} onClose={() => setCancelling(null)} />}
    </div>
  );
}

function ModalFooter({ busy, onClose, onSubmit, label }: { busy: boolean; onClose: () => void; onSubmit: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button onClick={onSubmit} disabled={busy}>
        {busy ? "Saving..." : label}
      </Button>
    </div>
  );
}

function DevelopmentModal({ dev, onClose }: { dev: Development | null; onClose: () => void }) {
  const create = useMutation(api.finance.stands.createDevelopment);
  const update = useMutation(api.finance.stands.updateDevelopment);
  const [name, setName] = React.useState(dev?.name ?? "");
  const [developerName, setDeveloperName] = React.useState(dev?.developerName ?? "");
  const [developerEmail, setDeveloperEmail] = React.useState(dev?.developerEmail ?? "");
  const [moneyHeldBy, setMoneyHeldBy] = React.useState<Development["moneyHeldBy"]>(dev?.moneyHeldBy ?? "agency_trust");
  const [commissionPct, setCommissionPct] = React.useState(dev ? String(dev.commissionPct) : "");
  const [commissionTiming, setCommissionTiming] = React.useState<Development["commissionTiming"]>(dev?.commissionTiming ?? "each_payment");
  const [interest, setInterest] = React.useState(dev?.interestPctPerMonth ? String(dev.interestPctPerMonth) : "");
  const [currency, setCurrency] = React.useState<FinCurrency>(dev?.currency ?? "USD");
  const [isActive, setIsActive] = React.useState(dev?.isActive ?? true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const locked = !!dev && dev.stands > 0;

  const submit = async () => {
    setError(null);
    const pct = commissionPct.trim() ? parseAmount(commissionPct) : 0;
    const int = interest.trim() ? parseAmount(interest) : undefined;
    if (!name.trim()) return setError("Name the development.");
    if (!developerName.trim()) return setError("Name the developer.");
    if (!(pct >= 0 && pct <= 100)) return setError("Commission must be between 0 and 100%.");
    if (int !== undefined && !(int >= 0 && int <= 20)) return setError("Interest must be between 0 and 20% a month.");
    const args = {
      name: name.trim(),
      developerName: developerName.trim(),
      developerEmail: developerEmail.trim() || undefined,
      moneyHeldBy,
      commissionPct: pct,
      commissionTiming,
      interestPctPerMonth: int,
      currency,
    };
    setBusy(true);
    try {
      if (dev) await update({ developmentId: dev._id, isActive, ...args });
      else await create(args);
      animatedToast.success(dev ? "Development updated" : "Development added", { description: args.name });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={dev ? `Edit ${dev.name}` : "Add development"}
      description="A development groups the stands or items sold on a plan for one developer."
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSubmit={submit} label={dev ? "Save" : "Add development"} />}
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="space-y-2">
          <Label>Development name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: Hopewell Park Phase 2" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Developer</Label>
            <Input value={developerName} onChange={(e) => setDeveloperName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Developer email</Label>
            <Input type="email" value={developerEmail} onChange={(e) => setDeveloperEmail(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Who holds the money</Label>
            <Select value={moneyHeldBy} disabled={locked} onChange={(e) => setMoneyHeldBy(e.target.value as Development["moneyHeldBy"])}>
              {(Object.keys(HELD_BY_LABELS) as Array<keyof typeof HELD_BY_LABELS>).map((k) => (
                <option key={k} value={k}>
                  {HELD_BY_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={currency} disabled={locked} onChange={(e) => setCurrency(e.target.value as FinCurrency)}>
              {CURRENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {locked && <p className="text-xs text-text-muted">This development has clients, so its currency and who holds the money are fixed.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Commission %</Label>
            <Input inputMode="decimal" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-2">
            <Label>Commission is earned</Label>
            <Select value={commissionTiming} onChange={(e) => setCommissionTiming(e.target.value as Development["commissionTiming"])}>
              {(Object.keys(TIMING_LABELS) as Array<keyof typeof TIMING_LABELS>).map((k) => (
                <option key={k} value={k}>
                  {TIMING_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {moneyHeldBy === "developer" && (
          <p className="text-xs text-text-muted">When the developer holds the money, nothing is taken automatically. Invoice the developer for commission.</p>
        )}
        <div className="space-y-2">
          <Label>Interest on overdue amounts, % a month (optional)</Label>
          <Input inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="Leave blank for no interest" />
        </div>
        {dev && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Open for new sales
          </label>
        )}
      </div>
    </Modal>
  );
}

type TypedRow = { label: string; dueDate: string; amount: string };

function PlanModal({ devs, today, onClose }: { devs: Development[]; today: string; onClose: () => void }) {
  const createStand = useMutation(api.finance.stands.createStand);
  const [developmentId, setDevelopmentId] = React.useState<string>(devs[0]?._id ?? "");
  const [standNumber, setStandNumber] = React.useState("");
  const [buyerName, setBuyerName] = React.useState("");
  const [buyerPhone, setBuyerPhone] = React.useState("");
  const [buyerEmail, setBuyerEmail] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [mode, setMode] = React.useState<"even" | "rows">("even");
  const [deposit, setDeposit] = React.useState("");
  const [depositDue, setDepositDue] = React.useState(today);
  const [count, setCount] = React.useState("12");
  const [firstDue, setFirstDue] = React.useState(`${addMonths(today.slice(0, 7), 1)}-${today.slice(8, 10) > "28" ? "28" : today.slice(8, 10)}`);
  const [rows, setRows] = React.useState<TypedRow[]>([
    { label: "Deposit", dueDate: today, amount: "" },
    { label: "Instalment 1", dueDate: "", amount: "" },
  ]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const dev = devs.find((d) => d._id === developmentId);
  const c = dev?.currency ?? "USD";
  const p = parseAmount(price);
  const dep = deposit.trim() ? parseAmount(deposit) : 0;
  const n = parseInt(count, 10);
  const evenValid = p > 0 && dep >= 0 && dep <= p && n >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(firstDue) && (dep === 0 || /^\d{4}-\d{2}-\d{2}$/.test(depositDue));
  const preview = mode === "even" && evenValid ? buildPlan(p, dep, depositDue, n, firstDue) : [];
  const typedTotal = r2(rows.reduce((s, r) => s + (parseAmount(r.amount) || 0), 0));

  const setRow = (i: number, patch: Partial<TypedRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    setError(null);
    if (!dev) return setError("Pick the development.");
    if (!standNumber.trim()) return setError("Enter the stand or item number.");
    if (!buyerName.trim()) return setError("Enter the buyer's name.");
    if (!(p > 0)) return setError("Enter the price.");
    let schedule: Array<{ dueDate: string; amount: number; label: string }> | undefined;
    let plan: { deposit: number; depositDue: string; count: number; firstDue: string } | undefined;
    if (mode === "even") {
      if (!evenValid) return setError("Check the deposit, number of instalments and dates.");
      plan = { deposit: dep, depositDue, count: n, firstDue };
    } else {
      schedule = [];
      for (const r of rows) {
        const a = parseAmount(r.amount);
        if (!r.dueDate && !r.amount.trim()) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate)) return setError("Each row needs a due date.");
        if (!(a > 0)) return setError("Each row needs an amount.");
        schedule.push({ dueDate: r.dueDate, amount: a, label: r.label.trim() || "Instalment" });
      }
      if (!schedule.length) return setError("Add the payment rows.");
      if (r2(typedTotal) !== r2(p)) return setError(`The rows add up to ${money(typedTotal, c)}, not the price ${money(p, c)}.`);
    }
    setBusy(true);
    try {
      await createStand({
        developmentId: dev._id,
        standNumber: standNumber.trim(),
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim() || undefined,
        buyerEmail: buyerEmail.trim() || undefined,
        price: p,
        plan,
        schedule,
      });
      animatedToast.success("Client plan added", { description: `Stand ${standNumber.trim()} to ${buyerName.trim()}` });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="New client plan" description="A buyer paying for a stand or item by instalments." onClose={onClose} footer={<ModalFooter busy={busy} onClose={onClose} onSubmit={submit} label="Add plan" />}>
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Development</Label>
            <Select value={developmentId} onChange={(e) => setDevelopmentId(e.target.value)}>
              {devs.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.currency})
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Stand or item number</Label>
            <Input value={standNumber} onChange={(e) => setStandNumber(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Buyer name</Label>
            <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Price ({c})</Label>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant={mode === "even" ? "primary" : "secondary"} className="h-9" onClick={() => setMode("even")}>
            Even monthly plan
          </Button>
          <Button variant={mode === "rows" ? "primary" : "secondary"} className="h-9" onClick={() => setMode("rows")}>
            Type the rows
          </Button>
        </div>

        {mode === "even" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Deposit ({c})</Label>
                <Input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Deposit due</Label>
                <Input type="date" value={depositDue} onChange={(e) => setDepositDue(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Monthly instalments</Label>
                <Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>First instalment due</Label>
                <Input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
              </div>
            </div>
            {preview.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-[10px] border border-border text-sm">
                {preview.map((r, i) => (
                  <div key={i} className="flex justify-between gap-2 border-b border-border px-3 py-1.5 last:border-0">
                    <span>{r.label}</span>
                    <span className="text-text-muted">{dateLabel(r.dueDate)}</span>
                    <span className="font-medium">{money(r.amount, c)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
                <Input aria-label="Label" placeholder="Label" value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} className="col-span-2 sm:col-span-1" />
                <Input aria-label="Due date" type="date" value={r.dueDate} onChange={(e) => setRow(i, { dueDate: e.target.value })} />
                <Input aria-label="Amount" inputMode="decimal" placeholder={`Amount (${c})`} value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} />
                <Button variant="ghost" className="h-10 w-10 p-0" aria-label="Remove row" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} disabled={rows.length <= 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="secondary" className="h-9 gap-2" onClick={() => setRows((rs) => [...rs, { label: `Instalment ${rs.length}`, dueDate: "", amount: "" }])}>
                <Plus className="h-4 w-4" />
                Add row
              </Button>
              <span className={`text-sm ${p > 0 && typedTotal !== r2(p) ? "text-danger" : "text-text-muted"}`}>
                Rows add up to {money(typedTotal, c)}
                {p > 0 ? ` of ${money(p, c)}` : ""}
              </span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function InterestModal({ devs, today, onClose }: { devs: Development[]; today: string; onClose: () => void }) {
  const charge = useMutation(api.finance.stands.chargeInterest);
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const [developmentId, setDevelopmentId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setError(null);
    if (!/^\d{4}-\d{2}$/.test(month)) return setError("Pick a month.");
    setBusy(true);
    try {
      const res = await charge({ month, developmentId: (developmentId || undefined) as Id<"finDevelopments"> | undefined });
      animatedToast.success(res.charged ? `Interest charged on ${res.charged} ${res.charged === 1 ? "plan" : "plans"}` : "No interest to charge", {
        description: periodLabel(month, true),
      });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Charge interest"
      description="Adds one month's interest on overdue amounts, for developments that set an interest rate. Each plan is charged once per month."
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSubmit={submit} label="Charge interest" />}
    >
      <div className="space-y-4">
        <FormError message={error} />
        {devs.length === 0 && <p className="text-sm text-text-muted">No development charges interest yet. Set a rate on a development first.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Development</Label>
            <Select value={developmentId} onChange={(e) => setDevelopmentId(e.target.value)}>
              <option value="">All that charge interest</option>
              {devs.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.interestPctPerMonth}% a month)
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function StandMoneyModal({
  mode,
  stand,
  today,
  accounts,
  onClose,
}: {
  mode: "receive" | "refund";
  stand: StandRow;
  today: string;
  accounts: Account[];
  onClose: () => void;
}) {
  const receive = useMutation(api.finance.stands.receivePayment);
  const refund = useMutation(api.finance.stands.refundStand);
  const c = stand.currency;
  const [date, setDate] = React.useState(today);
  const [amount, setAmount] = React.useState(mode === "receive" ? String(stand.overdue > 0 ? stand.overdue : stand.nextDueAmount ?? "") : "");
  const [method, setMethod] = React.useState<Method>("bank_transfer");
  const [accountId, setAccountId] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [sendStatement, setSendStatement] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setError(null);
    const n = parseAmount(amount);
    if (!(n > 0)) return setError("Enter the amount.");
    setBusy(true);
    try {
      const common = { standId: stand._id, date, amount: n, method, accountId: (accountId || undefined) as Id<"finAccounts"> | undefined, reference: reference.trim() || undefined };
      if (mode === "receive") {
        const res = await receive({ ...common, emailStatement: sendStatement && !!stand.buyerEmail });
        animatedToast.success("Payment received", { description: `Receipt ${res.number}: ${money(n, c)} from ${stand.buyerName}` });
      } else {
        const res = await refund(common);
        animatedToast.success("Refund recorded", { description: `Payment ${res.number}: ${money(n, c)} to ${stand.buyerName}` });
      }
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={mode === "receive" ? `Receive payment from ${stand.buyerName}` : `Refund ${stand.buyerName}`}
      description={
        mode === "receive"
          ? `Stand ${stand.standNumber}, ${stand.development}. Balance ${money(stand.balance, c)}${stand.overdue > 0 ? `, overdue ${money(stand.overdue, c)}` : ""}.`
          : `Stand ${stand.standNumber}, ${stand.development}. The sale is cancelled. You can refund up to what was received since go-live.`
      }
      onClose={onClose}
      footer={<ModalFooter busy={busy} onClose={onClose} onSubmit={submit} label={mode === "receive" ? "Receive payment" : "Record refund"} />}
    >
      <div className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Amount ({c})</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              {METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{mode === "receive" ? "Into account (optional)" : "From account (optional)"}</Label>
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Default for this development</option>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Reference</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank reference or slip number" />
        </div>
        {mode === "receive" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" checked={sendStatement && !!stand.buyerEmail} disabled={!stand.buyerEmail} onChange={(e) => setSendStatement(e.target.checked)} />
            {stand.buyerEmail ? "Email the buyer an updated statement" : "The buyer has no email address, so no statement is sent"}
          </label>
        )}
      </div>
    </Modal>
  );
}

function CancelSaleModal({ stand, onClose }: { stand: StandRow; onClose: () => void }) {
  const cancel = useMutation(api.finance.stands.cancelStand);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    if (!reason.trim()) return setError("Give a reason.");
    setBusy(true);
    setError(null);
    try {
      await cancel({ standId: stand._id, reason: reason.trim() });
      animatedToast.success("Sale cancelled", { description: `Stand ${stand.standNumber}, ${stand.buyerName}` });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      title={`Cancel the sale of stand ${stand.standNumber}`}
      description="The plan stops and reminders stop. Anything the buyer paid stays on record until you refund it."
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep the sale
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy ? "Cancelling..." : "Cancel sale"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormError message={error} />
        <p className="text-sm">
          {stand.buyerName} has paid {money(stand.paidToDate, stand.currency)} of {money(stand.price, stand.currency)}.
        </p>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
