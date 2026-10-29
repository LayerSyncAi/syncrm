"use client";

import * as React from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Building2, Grid3x3, Pencil, Percent, Plus, Search } from "lucide-react";
import { api } from "../../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Section, StatTile, StayPageHeader } from "@/components/stay/page-header";
import { DevelopmentModal, InterestModal, StandMoneyModal, type MoneySale } from "@/components/sales/modals";
import { InventoryBar, ModuleHint, useSalesFinance } from "@/components/sales/shared";
import {
  AddStandsModal,
  EditStandModal,
  STATUS_LABELS,
  StandPanel,
  StandTile,
  actionToast,
  type SoldSale,
  type StandStatus,
} from "@/components/dev/inventory";
import { money } from "@/lib/finance/format";
import { cn } from "@/lib/utils";

type Filter = "all" | StandStatus;

const CHIP_ACTIVE: Record<Filter, string> = {
  all: "border-primary-600 bg-primary-600 text-white",
  available: "border-[var(--status-success-fg)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  reserved: "border-[var(--status-warning-fg)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
  sold: "border-text bg-surface-2 text-text",
};

export default function DevelopmentPage() {
  const params = useParams<{ developmentId: string }>();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const devs = useQuery(api.dev.sales.listDevelopments);
  const dev = devs?.find((d) => d._id === params.developmentId);
  const id = dev?._id;
  const inv = useQuery(api.dev.inventory.list, id ? { developmentId: id } : "skip");
  const report = useQuery(api.dev.sales.developerReport, id ? { developmentId: id } : "skip");
  const sales = useQuery(api.dev.sales.listStands, id ? { developmentId: id } : "skip");
  const { today, accountsFor, loading } = useSalesFinance(inv?.role.financeOn);

  const [filter, setFilter] = React.useState<Filter>("all");
  const [q, setQ] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(() => searchParams.get("add") === "1");
  const [editingDev, setEditingDev] = React.useState(false);
  const [interestOpen, setInterestOpen] = React.useState(false);
  const [paying, setPaying] = React.useState<{ sale: MoneySale; amount: number } | null>(null);

  const stands = React.useMemo(() => inv?.stands ?? [], [inv]);
  // The price most stands carry, offered when adding more.
  const usualPrice = React.useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of stands) counts.set(s.price, (counts.get(s.price) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [stands]);
  const counts = React.useMemo(() => {
    const c = { all: stands.length, available: 0, reserved: 0, sold: 0 };
    for (const s of stands) c[s.status]++;
    return c;
  }, [stands]);
  const shown = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    return stands.filter(
      (s) =>
        (filter === "all" || s.status === filter) &&
        (!term || s.number.toLowerCase().includes(term) || (s.sale?.buyerName ?? s.reservedFor?.name ?? "").toLowerCase().includes(term))
    );
  }, [stands, filter, q]);
  const salesById = React.useMemo(() => new Map((sales ?? []).map((s) => [s._id as string, s])), [sales]);

  if (devs === undefined) return <ListSkeleton />;
  if (!dev) {
    return <EmptyState icon={Building2} title="Development not found" description="It may have been removed, or the link is wrong." />;
  }
  if (inv === undefined || loading) return <ListSkeleton />;

  const c = dev.currency;
  const { canManage, financeOn } = inv.role;
  const open = openId ? stands.find((s) => s._id === openId) : undefined;
  const editing = editId ? stands.find((s) => s._id === editId) : undefined;
  const hasInterest = (dev.interestPctPerMonth ?? 0) > 0;

  const closeAdd = () => {
    setAdding(false);
    if (searchParams.get("add")) router.replace(pathname);
  };

  const saleFor = (saleId: string): SoldSale | null => {
    const s = salesById.get(saleId);
    return s
      ? {
          _id: s._id,
          buyerName: s.buyerName,
          buyerEmail: s.buyerEmail,
          buyerPhone: s.buyerPhone,
          paidToDate: s.paidToDate,
          balance: s.balance,
          overdue: s.overdue,
          nextDueDate: s.nextDueDate,
          nextDueAmount: s.nextDueAmount,
          status: s.status,
        }
      : null;
  };

  const chip = (f: Filter) => (
    <button
      key={f}
      type="button"
      onClick={() => setFilter(f)}
      aria-pressed={filter === f}
      className={cn(
        "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
        filter === f ? CHIP_ACTIVE[f] : "border-border-strong text-text-muted hover:text-text"
      )}
    >
      {f === "all" ? "All" : STATUS_LABELS[f]} <span className="opacity-70">{counts[f]}</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <StayPageHeader
        back={{ href: "/app/dev/developments", label: "Developments" }}
        title={dev.name}
        description={[dev.location, dev.developerName, c, hasInterest ? `interest ${dev.interestPctPerMonth}% a month on overdue` : "", dev.isActive ? "" : "closed for sales"]
          .filter(Boolean)
          .join(" · ")}
        actions={
          canManage && (
            <>
              <Button variant="secondary" className="gap-2" onClick={() => setEditingDev(true)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              {hasInterest && (
                <Button variant="secondary" className="gap-2" onClick={() => setInterestOpen(true)}>
                  <Percent className="h-4 w-4" />
                  Charge interest
                </Button>
              )}
              <Button className="h-11 gap-2 px-5" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" />
                Add stands
              </Button>
            </>
          )
        }
      />

      {report && report.sold > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Contracted" value={money(report.contracted, c)} hint={`${report.sold} ${report.sold === 1 ? "stand" : "stands"} sold`} />
          <StatTile label="Paid" value={money(report.collected, c)} tone="good" />
          <StatTile label="Owed" value={money(report.outstanding, c)} />
          <StatTile label="Overdue" value={money(report.overdue, c)} tone={report.overdue > 0 ? "danger" : "default"} href="/app/dev/buyers" />
          {report.financeOn && dev.moneyHeldBy === "agency_trust" && (
            <>
              <StatTile label="Commission earned" value={money(report.commission, c)} />
              <StatTile label="Paid to developer" value={money(report.paidOut, c)} />
              <StatTile label="Held for developer" value={money(report.held, c)} />
            </>
          )}
        </div>
      )}
      {!financeOn && report && report.sold > 0 && <ModuleHint>Sync Finance adds commission and payouts to the developer.</ModuleHint>}

      <Section title="Stands" actions={stands.length > 0 && <InventoryBar className="w-80 max-w-full" sold={counts.sold} reserved={counts.reserved} available={counts.available} />}>
        {stands.length === 0 ? (
          <EmptyState
            icon={Grid3x3}
            title="No stands yet"
            description={canManage ? "Add them in one go: type a range like 1-40 and the price." : "Ask a director or sales manager to add the stands."}
            action={canManage ? <Button onClick={() => setAdding(true)}>Add stands</Button> : undefined}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {(["all", "available", "reserved", "sold"] as const).map(chip)}
              <div className="relative ml-auto w-full sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input className="pl-9" placeholder="Stand or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a stand" />
              </div>
            </div>
            {shown.length === 0 ? (
              <p className="text-sm text-text-muted">No stands match.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
                {shown.map((s) => (
                  <StandTile key={s._id} stand={s} currency={c} onClick={() => setOpenId(s._id)} />
                ))}
              </div>
            )}
            <p className="text-xs text-text-muted">Tap a stand to {canManage ? "reserve, sell or see its buyer" : "reserve it or see who has it"}. A red dot means the buyer is overdue.</p>
          </div>
        )}
      </Section>

      {open && (
        <StandPanel
          key={open._id + open.status}
          stand={open}
          sale={open.sale ? saleFor(open.sale._id) : null}
          currency={c}
          developmentName={dev.name}
          canManage={canManage}
          canRelease={canManage || open.reservedFor?.byUserId === inv?.role.userId}
          today={inv?.today ?? today}
          onClose={() => setOpenId(null)}
          onEdit={() => {
            setOpenId(null);
            setEditId(open._id);
          }}
          onTakePayment={() => {
            const s = open.sale ? salesById.get(open.sale._id) : undefined;
            if (!s) return;
            setOpenId(null);
            setPaying({
              sale: { _id: s._id, standNumber: s.standNumber, development: dev.name, currency: c, buyerName: s.buyerName, buyerEmail: s.buyerEmail, balance: s.balance, overdue: s.overdue },
              amount: s.overdue > 0 ? s.overdue : s.nextDueAmount ?? 0,
            });
          }}
          onSold={(info) =>
            actionToast(
              `Stand ${open.number} sold`,
              `To ${info.buyerName} for ${money(info.price, c)}.`,
              {
                label: "Take first payment",
                onClick: () =>
                  setPaying({
                    sale: { _id: info.saleId, standNumber: open.number, development: dev.name, currency: c, buyerName: info.buyerName, buyerEmail: info.buyerEmail, balance: info.price, overdue: 0 },
                    amount: info.firstPayment,
                  }),
              },
              { label: "Open buyer account", onClick: () => router.push(`/app/dev/buyers/${info.saleId}`) }
            )
          }
        />
      )}
      {editing && <EditStandModal stand={editing} currency={c} onClose={() => setEditId(null)} />}
      {adding && canManage && <AddStandsModal developmentId={dev._id} currency={c} defaultPrice={usualPrice} onClose={closeAdd} />}
      {editingDev && <DevelopmentModal dev={dev} financeOn={financeOn} onClose={() => setEditingDev(false)} />}
      {interestOpen && <InterestModal devs={[dev]} fixed={dev} today={today} onClose={() => setInterestOpen(false)} />}
      {paying && <StandMoneyModal mode="receive" sale={paying.sale} defaultAmount={paying.amount} today={today} accounts={accountsFor(c)} onClose={() => setPaying(null)} />}
    </div>
  );
}
