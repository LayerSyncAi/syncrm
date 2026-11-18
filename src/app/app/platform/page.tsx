"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Building2,
  Clock,
  CreditCard,
  Eye,
  FlaskConical,
  Inbox,
  Loader2,
  LogOut,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { useNow } from "@/hooks/useNow";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { animatedToast } from "@/components/ui/animated-toaster";
import { getErrorMessage } from "@/lib/errors";
import { MODULES, type ModuleKey } from "@/config/modules";
import { WebsiteEnquiries } from "@/components/platform/website-enquiries";
import { relativeTime } from "@/components/hub/format";
import { orgInitials } from "@/lib/org-theme";
import { readableOn } from "@/lib/color";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { PlanBadge } from "@/components/platform/onboarding/plan-picker";
import { isPaidPlan, planStatus, type PlanKey } from "../../../../convex/lib/plans";

const formatDate = (ts: number | null | undefined) =>
  ts ? new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** "just now", "5 min ago", "2 d ago" or "2 Nov". */
function activeLabel(ts: number): string {
  const label = relativeTime(ts);
  return label === "Just now" ? "just now" : label;
}

const formatCount = (n: number, cap: number) => (n > cap ? `${cap}+` : n.toLocaleString("en-GB"));

type OrgRow = {
  _id: Id<"organizations">;
  name: string;
  slug: string;
  createdAt: number;
  deletingAt?: number;
  counts: { users: number; leads: number; contacts: number; properties: number };
  countCap: number;
  lastActivityAt: number | null;
  isViewing: boolean;
  enabledModules: ModuleKey[];
  isDemo: boolean;
  whiteLabel: boolean;
  primaryColor: string | null;
  logoUrl: string | null;
  plan: PlanKey | null;
  trialEndsAt: number | null;
};

type Tab = "organisations" | "enquiries" | "team";
type Kind = "all" | "trial" | "beta" | "paying" | "demos";

function matchesKind(o: OrgRow, kind: Kind): boolean {
  switch (kind) {
    case "all":
      return true;
    case "demos":
      return o.isDemo;
    case "trial":
      return !o.isDemo && o.plan === "trial";
    case "beta":
      return !o.isDemo && o.plan === "beta";
    case "paying":
      return !o.isDemo && isPaidPlan(o.plan);
  }
}

/**
 * Platform (LayerSync staff) home: every organisation on this deployment as a
 * card, the website enquiries inbox, and the LayerSync team. Built to read at
 * a glance: one main action (New organisation), one primary action per
 * organisation (Manage), and nothing destructive on the overview — deleting
 * lives on the organisation's own page.
 */
export default function PlatformPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const isPlatformAdmin = !!user?.isPlatformAdmin;

  const orgs = useQuery(api.platform.listOrganizations, isPlatformAdmin ? {} : "skip") as OrgRow[] | undefined;
  const newEnquiries = useQuery(api.websiteEnquiries.countNew, isPlatformAdmin ? {} : "skip");

  const setViewOrg = useMutation(api.platform.setViewOrg);
  const exitViewOrg = useMutation(api.platform.exitViewOrg);

  const [tab, setTab] = useState<Tab>("organisations");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const now = useNow();

  useEffect(() => {
    if (!authLoading && user && !user.isPlatformAdmin) {
      router.replace("/app/hub");
    }
  }, [authLoading, user, router]);

  const filteredOrgs = useMemo(() => {
    if (!orgs) return undefined;
    const q = search.trim().toLowerCase();
    return orgs.filter(
      (o) =>
        matchesKind(o, kind) &&
        (!q || o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q))
    );
  }, [orgs, search, kind]);

  const totals = useMemo(() => {
    if (!orgs) return null;
    const live = orgs.filter((o) => !o.deletingAt && !o.isDemo);
    const trials = live.filter((o) => o.plan === "trial");
    return {
      paying: live.filter((o) => isPaidPlan(o.plan)).length,
      trials: trials.length,
      trialsEnding: trials.filter((o) => planStatus(o, now).endingSoon).length,
      beta: live.filter((o) => o.plan === "beta").length,
    };
  }, [orgs, now]);

  const viewingOrg = orgs?.find((o) => o.isViewing) ?? null;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-ink" />
      </div>
    );
  }

  if (!user || !user.isPlatformAdmin) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-text-muted">Access denied. Platform staff only.</p>
      </div>
    );
  }

  const handleOpen = async (org: OrgRow) => {
    setOpeningId(org._id);
    try {
      await setViewOrg({ orgId: org._id });
      router.push("/app/hub");
    } catch (error) {
      animatedToast.error("Could not open organisation", { description: getErrorMessage(error) });
      setOpeningId(null);
    }
  };

  const handleExit = async () => {
    try {
      await exitViewOrg();
      animatedToast.success("Back to your LayerSync view");
    } catch (error) {
      animatedToast.error("Could not leave the organisation", { description: getErrorMessage(error) });
    }
  };

  const tabs: { key: Tab; label: string; icon: typeof Building2; count?: number }[] = [
    { key: "organisations", label: "Organisations", icon: Building2 },
    { key: "enquiries", label: "Enquiries", icon: Inbox, count: newEnquiries ?? 0 },
    { key: "team", label: "LayerSync team", icon: ShieldCheck },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h1 text-text">Organisations</h1>
          <p className="mt-1 max-w-xl text-sm text-text-muted">
            Every agency using {brand.name}. Set up a new one, change how it looks, or see the app exactly as its
            people do.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => router.push("/app/platform/organizations/new?demo=1")}>
            <FlaskConical className="h-4 w-4" /> New demo
          </Button>
          <Button onClick={() => router.push("/app/platform/organizations/new")}>
            <Plus className="h-4 w-4" /> New organisation
          </Button>
        </div>
      </div>

      {viewingOrg && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="flex items-center gap-2">
            <Eye className="h-4 w-4 shrink-0" />
            You&apos;re looking at <strong>{viewingOrg.name}</strong> as its people see it.
          </span>
          <span className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => router.push("/app/hub")}>
              Go back to it
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExit}>
              <LogOut className="h-3.5 w-3.5" /> Leave
            </Button>
          </span>
        </div>
      )}

      {/* At a glance */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Paying" value={totals?.paying} icon={CreditCard} onClick={() => { setTab("organisations"); setKind("paying"); }} />
        <StatTile
          label={totals?.trialsEnding ? `On free trial · ${totals.trialsEnding} ending soon` : "On free trial"}
          value={totals?.trials}
          icon={Clock}
          highlight={!!totals?.trialsEnding}
          onClick={() => { setTab("organisations"); setKind("trial"); }}
        />
        <StatTile label="Beta testers" value={totals?.beta} icon={FlaskConical} onClick={() => { setTab("organisations"); setKind("beta"); }} />
        <StatTile
          label="New enquiries"
          value={newEnquiries}
          icon={Inbox}
          highlight={!!newEnquiries}
          onClick={() => setTab("enquiries")}
        />
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Platform sections" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              tab === t.key ? "border-primary text-text" : "border-transparent text-text-muted hover:text-text"
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" />
            {t.label}
            {t.count ? (
              <span className="rounded-full bg-[var(--status-warning-bg)] px-2 py-0.5 text-xs text-[var(--status-warning-fg)]">
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "organisations" && (
        <section className="space-y-4" aria-label="Organisations">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search organisations"
                className="pl-9"
                aria-label="Search organisations"
              />
            </div>
            <div className="flex max-w-full overflow-x-auto rounded-full border border-border bg-card-bg p-1 text-sm" role="group" aria-label="Show">
              {(
                [
                  ["all", "All"],
                  ["trial", "Free trial"],
                  ["beta", "Beta"],
                  ["paying", "Paying"],
                  ["demos", "Demos"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-1.5 transition-colors",
                    kind === k ? "bg-primary font-medium text-primary-foreground" : "text-text-muted hover:text-text"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredOrgs === undefined ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary-ink" />
            </div>
          ) : filteredOrgs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Building2 className="h-8 w-8 text-text-muted" />
                <p className="font-medium text-text">
                  {orgs && orgs.length > 0 ? "No organisations match" : "No organisations yet"}
                </p>
                <p className="max-w-sm text-sm text-text-muted">
                  {orgs && orgs.length > 0
                    ? "Try another name, or show all organisations."
                    : "Set up your first agency. It takes about two minutes."}
                </p>
                {orgs && orgs.length === 0 && (
                  <Button onClick={() => router.push("/app/platform/organizations/new")}>
                    <Plus className="h-4 w-4" /> New organisation
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filteredOrgs.map((org) => (
                <OrgCard key={org._id} org={org} opening={openingId === org._id} onOpen={() => handleOpen(org)} />
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "enquiries" && <WebsiteEnquiries />}

      {tab === "team" && <TeamSection />}
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  highlight,
  onClick,
}: {
  label: string;
  value: number | null | undefined;
  icon: typeof Building2;
  highlight?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
          highlight ? "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]" : "bg-surface-2 text-text-muted"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-xl font-semibold leading-tight text-text">
          {value === undefined || value === null ? "–" : value.toLocaleString("en-GB")}
        </span>
        <span className="block text-xs leading-snug text-text-muted">{label}</span>
      </span>
    </>
  );
  const className = "flex items-center gap-3 rounded-[14px] border border-border bg-card-bg px-4 py-3 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(className, "transition-colors hover:bg-surface-2")}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function OrgAvatar({ org }: { org: OrgRow }) {
  if (org.logoUrl) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-border bg-white p-1">
        {/* eslint-disable-next-line @next/next/no-img-element -- agency logo from Convex storage */}
        <img src={org.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
      </span>
    );
  }
  const bg = org.primaryColor || brand.colors.sidebar;
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-sm font-bold"
      style={{ backgroundColor: bg, color: readableOn(bg) }}
      aria-hidden="true"
    >
      {orgInitials(org.name)}
    </span>
  );
}

function OrgCard({ org, opening, onOpen }: { org: OrgRow; opening: boolean; onOpen: () => void }) {
  const router = useRouter();
  const deleting = !!org.deletingAt;
  const manageHref = `/app/platform/organizations/${org._id}`;
  const stats = [
    { label: org.counts.users === 1 ? "person" : "people", value: formatCount(org.counts.users, org.countCap) },
    { label: "leads", value: formatCount(org.counts.leads, org.countCap) },
    { label: "properties", value: formatCount(org.counts.properties, org.countCap) },
  ];

  return (
    <li
      className={cn(
        "flex flex-col rounded-[16px] border border-border bg-card-bg p-4 transition-shadow hover:shadow-md",
        deleting && "opacity-60"
      )}
    >
      <div className="flex items-start gap-3">
        <OrgAvatar org={org} />
        <div className="min-w-0 flex-1">
          {deleting ? (
            <p className="truncate text-base font-semibold text-text">{org.name}</p>
          ) : (
            <Link href={manageHref} className="block truncate text-base font-semibold text-text hover:underline">
              {org.name}
            </Link>
          )}
          <p className="text-xs text-text-muted">
            {org.lastActivityAt ? `Active ${activeLabel(org.lastActivityAt)}` : "No activity yet"} ·
            joined {formatDate(org.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {deleting && <Badge variant="danger">Being deleted…</Badge>}
        {org.isViewing && !deleting && <Badge variant="warning">You&apos;re viewing this</Badge>}
        {org.isDemo ? <Badge variant="info">Demo</Badge> : <PlanBadge plan={org.plan} trialEndsAt={org.trialEndsAt} />}
        {org.whiteLabel && org.plan !== "white_label" && <Badge variant="default">Own branding</Badge>}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {org.enabledModules.length === 0 ? (
          <span className="text-xs text-text-muted">No modules switched on</span>
        ) : (
          org.enabledModules.map((k) => (
            <span key={k} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-text-muted">
              {MODULES[k].name}
            </span>
          ))
        )}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 rounded-[12px] bg-surface-2 px-3 py-2.5">
        {stats.map((s) => (
          <div key={s.label} className="flex min-w-0 flex-col-reverse">
            <dt className="truncate text-xs text-text-muted">{s.label}</dt>
            <dd className="text-base font-semibold text-text">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          disabled={deleting}
          onClick={() => router.push(manageHref)}
        >
          <Settings2 className="h-3.5 w-3.5" /> Manage
        </Button>
        <Button size="sm" variant="secondary" className="flex-1" disabled={deleting || opening} onClick={onOpen}>
          {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          {opening ? "Opening…" : "View as them"}
        </Button>
      </div>
    </li>
  );
}

/** LayerSync staff accounts: add someone, see who has access, remove access. */
function TeamSection() {
  const admins = useQuery(api.platform.listPlatformAdmins, {});
  const grantPlatformAdmin = useAction(api.platform.grantPlatformAdmin);
  const revokePlatformAdmin = useMutation(api.platform.revokePlatformAdmin);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [granting, setGranting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ _id: Id<"users">; email: string } | null>(null);
  const [revoking, setRevoking] = useState(false);

  const handleGrant = async () => {
    if (!email.trim()) return;
    setGranting(true);
    setResult(null);
    try {
      const r = await grantPlatformAdmin({ email: email.trim(), fullName: name.trim() || undefined });
      if (r.alreadyAdmin) setResult(`${email.trim()} is already on the LayerSync team.`);
      else if (r.created)
        setResult(
          `Account created for ${email.trim()}. Temporary password: ${r.tempPasswordHint}. They'll choose their own when they first sign in.`
        );
      else setResult(`${email.trim()} now has LayerSync access.`);
      animatedToast.success("Team member added");
      setEmail("");
      setName("");
    } catch (error) {
      animatedToast.error("Could not add them", { description: getErrorMessage(error) });
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokePlatformAdmin({ userId: revokeTarget._id });
      animatedToast.success("Access removed", { description: revokeTarget.email });
      setRevokeTarget(null);
    } catch (error) {
      animatedToast.error("Could not remove access", { description: getErrorMessage(error) });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <section className="space-y-4" aria-label="LayerSync team">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-text">
              <UserPlus className="h-4 w-4 text-text-muted" /> Add a LayerSync team member
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Team members can set up and manage every organisation. They&apos;re never shown in an agency&apos;s own
              user list.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="team-email">Email</Label>
              <Input
                id="team-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@layersyncai.com"
                inputMode="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Full name</Label>
              <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Their name" />
            </div>
            <Button onClick={handleGrant} disabled={granting || !email.trim()}>
              {granting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {granting ? "Adding…" : "Add to team"}
            </Button>
          </div>
          {result && (
            <div className="rounded-[10px] border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {result}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h2 className="mb-1 text-base font-semibold text-text">Who has access</h2>
          {admins === undefined ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary-ink" />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {admins.map((a) => (
                <li key={a._id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-text-muted">
                    {orgInitials(a.fullName || a.email)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text">
                      {a.fullName || a.email}{" "}
                      {a.isMe && <span className="text-xs font-normal text-text-muted">(you)</span>}
                    </p>
                    <p className="truncate text-xs text-text-muted">
                      {a.email} · since {formatDate(a.createdAt)}
                    </p>
                  </div>
                  {!a.isActive ? (
                    <Badge variant="neutral">Removed</Badge>
                  ) : !a.isMe ? (
                    <Button size="sm" variant="ghost" onClick={() => setRevokeTarget({ _id: a._id, email: a.email })}>
                      Remove access
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Modal
        open={!!revokeTarget}
        title="Remove their access?"
        description={
          revokeTarget ? `${revokeTarget.email} will be signed out and can no longer manage organisations.` : undefined
        }
        onClose={() => {
          if (!revoking) setRevokeTarget(null);
        }}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setRevokeTarget(null)} disabled={revoking}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
              {revoking ? "Removing…" : "Remove access"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-muted">You can add them again later with the same email.</p>
      </Modal>
    </section>
  );
}
