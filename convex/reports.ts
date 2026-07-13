import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg, isEffectiveAdmin } from "./helpers";
import { Doc, Id } from "./_generated/dataModel";
import {
  estimateLeadValue,
  weightedForecastValue,
  conversionRate,
  inWindow,
  daysOnMarket,
  addToCurrencyMap,
  computeTaskMetrics,
  type CurrencyMap,
} from "./reportingLib";

// Shared args: a client-computed [start, end] window (timezone handled on the
// client) plus an optional admin-only agent filter.
const windowArgs = {
  start: v.number(),
  end: v.number(),
  ownerUserId: v.optional(v.id("users")),
};

const CONTACT_TYPES = new Set(["call", "whatsapp", "email", "meeting"]);

function userLabel(u: Doc<"users"> | undefined): string {
  return u?.fullName || u?.name || u?.email || "Unknown";
}

// Resolve role scoping: admins see the whole org (optionally filtered to one
// agent); agents see only their own data regardless of the passed filter.
async function resolveScope(ctx: QueryCtx, args: { ownerUserId?: Id<"users"> }) {
  const user = await getCurrentUserWithOrg(ctx);
  const isAdmin = isEffectiveAdmin(user);
  const focusUserId: Id<"users"> | null = isAdmin
    ? args.ownerUserId ?? null
    : user._id;
  return { user, isAdmin, focusUserId };
}

// ── Agent performance ───────────────────────────────────────────────
export const agentPerformance = query({
  args: windowArgs,
  handler: async (ctx, args) => {
    const { user, isAdmin, focusUserId } = await resolveScope(ctx, args);

    const [leads, activities, matches, commissions, stages, users] =
      await Promise.all([
        ctx.db.query("leads").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
        ctx.db.query("activities").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
        ctx.db.query("leadPropertyMatches").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
        ctx.db.query("dealCommissions").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
        ctx.db.query("pipelineStages").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
        ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ]);

    const wonStageIds = new Set(stages.filter((s) => s.terminalOutcome === "won").map((s) => s._id));
    const lostStageIds = new Set(stages.filter((s) => s.terminalOutcome === "lost").map((s) => s._id));

    // Which agents get a row.
    const agents = users.filter(
      (u) => (focusUserId ? u._id === focusUserId : true)
    );

    type Row = {
      userId: Id<"users">;
      name: string;
      leadsAssigned: number;
      leadsContacted: number;
      viewingsBooked: number;
      offersReceived: number;
      dealsClosed: number;
      salesValue: CurrencyMap;
      commission: CurrencyMap;
      conversionRate: number;
      tasksCreated: number;
      tasksCompleted: number;
      tasksPending: number;
      tasksOverdue: number;
      taskCompletionRate: number;
      _won: number;
      _lostClosed: number;
      _contactedLeads: Set<string>;
    };

    const rows = new Map<string, Row>();
    for (const a of agents) {
      rows.set(a._id, {
        userId: a._id,
        name: userLabel(a),
        leadsAssigned: 0,
        leadsContacted: 0,
        viewingsBooked: 0,
        offersReceived: 0,
        dealsClosed: 0,
        salesValue: {},
        commission: {},
        conversionRate: 0,
        tasksCreated: 0,
        tasksCompleted: 0,
        tasksPending: 0,
        tasksOverdue: 0,
        taskCompletionRate: 0,
        _won: 0,
        _lostClosed: 0,
        _contactedLeads: new Set(),
      });
    }
    const get = (id: Id<"users"> | undefined) => (id ? rows.get(id) : undefined);

    // Leads: assigned (createdAt in window) + closed-deal metrics (closedAt in window).
    for (const lead of leads) {
      const row = get(lead.ownerUserId);
      if (!row) continue;
      if (inWindow(lead.createdAt, args.start, args.end)) row.leadsAssigned++;
      if (inWindow(lead.closedAt, args.start, args.end)) {
        if (wonStageIds.has(lead.stageId)) {
          row._won++;
          row.dealsClosed++;
          if (typeof lead.dealValue === "number") {
            addToCurrencyMap(row.salesValue, lead.dealCurrency, lead.dealValue);
          }
        } else if (lostStageIds.has(lead.stageId)) {
          row._lostClosed++;
        }
      }
    }

    // Activities: contacts (distinct leads) + viewings booked.
    for (const act of activities) {
      if (!inWindow(act.createdAt, args.start, args.end)) continue;
      const row = get(act.assignedToUserId);
      if (!row) continue;
      if (act.leadId && CONTACT_TYPES.has(act.type)) {
        row._contactedLeads.add(act.leadId);
      }
      if (act.type === "viewing") row.viewingsBooked++;
    }

    // Matches: viewings (viewed) + offers (offered), attributed to creator.
    for (const m of matches) {
      if (!inWindow(m.createdAt, args.start, args.end)) continue;
      const row = get(m.createdByUserId);
      if (!row) continue;
      if (m.matchType === "viewed") row.viewingsBooked++;
      if (m.matchType === "offered") row.offersReceived++;
    }

    // Commissions: split amounts to lead-agent and property-agent.
    for (const c of commissions) {
      if (!inWindow(c.createdAt, args.start, args.end)) continue;
      const leadRow = get(c.leadAgentUserId);
      if (leadRow) addToCurrencyMap(leadRow.commission, c.dealCurrency, c.leadAgentAmount);
      const propRow = get(c.propertyAgentUserId);
      if (propRow && c.propertyAgentAmount) {
        addToCurrencyMap(propRow.commission, c.dealCurrency, c.propertyAgentAmount);
      }
    }

    // Tasks (activities): per-agent created/completed/pending/overdue metrics.
    // Created & completed are window-bounded; pending & overdue are a current
    // backlog snapshot relative to now (overdue is an absolute scheduledAt < now
    // comparison, so the server clock is authoritative and timezone-independent).
    const now = Date.now();
    const tasksByAgent = new Map<string, Doc<"activities">[]>();
    for (const act of activities) {
      if (!rows.has(act.assignedToUserId)) continue;
      const arr = tasksByAgent.get(act.assignedToUserId) ?? [];
      arr.push(act);
      tasksByAgent.set(act.assignedToUserId, arr);
    }
    for (const [id, row] of rows) {
      const m = computeTaskMetrics(tasksByAgent.get(id) ?? [], args.start, args.end, now);
      row.tasksCreated = m.created;
      row.tasksCompleted = m.completed;
      row.tasksPending = m.pending;
      row.tasksOverdue = m.overdue;
      row.taskCompletionRate = m.completionRate;
    }

    const result = [...rows.values()].map((r) => {
      r.leadsContacted = r._contactedLeads.size;
      r.conversionRate = conversionRate(r._won, r._won + r._lostClosed);
      const { _won, _lostClosed, _contactedLeads, ...rest } = r;
      void _won;
      void _lostClosed;
      void _contactedLeads;
      return rest;
    });

    // Sort by deals closed, then leads assigned (most active first).
    result.sort((a, b) => b.dealsClosed - a.dealsClosed || b.leadsAssigned - a.leadsAssigned);
    return { rows: result, isAdmin };
  },
});

// ── Task summary ─────────────────────────────────────────────────────
// Org-level task overview (totals) plus a per-agent breakdown. Respects role
// scoping: admins see the whole org (optionally one agent); agents see only
// their own tasks. Powers the Tasks report tab and its exports.
export const taskSummary = query({
  args: windowArgs,
  handler: async (ctx, args) => {
    const { user, isAdmin, focusUserId } = await resolveScope(ctx, args);

    const [activities, users] = await Promise.all([
      ctx.db.query("activities").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
    ]);

    const now = Date.now();
    const scoped = activities.filter((a) =>
      focusUserId ? a.assignedToUserId === focusUserId : true
    );
    const agents = users.filter((u) => (focusUserId ? u._id === focusUserId : true));

    const totals = computeTaskMetrics(scoped, args.start, args.end, now);

    // Bucket activities by assignee in a single pass, then score each agent from
    // its bucket, O(N + A) instead of an O(A·N) filter-per-agent.
    const byAssignee = new Map<string, Doc<"activities">[]>();
    for (const act of scoped) {
      const arr = byAssignee.get(act.assignedToUserId) ?? [];
      arr.push(act);
      byAssignee.set(act.assignedToUserId, arr);
    }

    const byAgent = agents
      .map((a) => {
        const m = computeTaskMetrics(
          byAssignee.get(a._id) ?? [],
          args.start,
          args.end,
          now
        );
        return { userId: a._id, name: userLabel(a), ...m };
      })
      .filter((r) => r.created || r.completed || r.pending || r.overdue);

    byAgent.sort((a, b) => b.created - a.created || b.completed - a.completed);

    return { totals, byAgent, isAdmin };
  },
});

// ── Lead source analytics ───────────────────────────────────────────
export const leadSourceAnalytics = query({
  args: windowArgs,
  handler: async (ctx, args) => {
    const { user, isAdmin, focusUserId } = await resolveScope(ctx, args);

    const [allLeads, stages, expenses] = await Promise.all([
      ctx.db.query("leads").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("pipelineStages").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("marketingExpenses").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
    ]);

    const wonStageIds = new Set(stages.filter((s) => s.terminalOutcome === "won").map((s) => s._id));
    const lostStageIds = new Set(stages.filter((s) => s.terminalOutcome === "lost").map((s) => s._id));

    const leads = allLeads.filter(
      (l) => (focusUserId ? l.ownerUserId === focusUserId : true)
    );

    type Bucket = {
      source: string;
      leads: number;
      won: number;
      lostClosed: number;
      salesValue: CurrencyMap;
      spend: CurrencyMap;
    };
    const buckets = new Map<string, Bucket>();
    const bucket = (source: string) => {
      let b = buckets.get(source);
      if (!b) {
        b = { source, leads: 0, won: 0, lostClosed: 0, salesValue: {}, spend: {} };
        buckets.set(source, b);
      }
      return b;
    };

    for (const lead of leads) {
      if (!inWindow(lead.createdAt, args.start, args.end)) continue;
      const b = bucket(lead.source);
      b.leads++;
      if (inWindow(lead.closedAt, args.start, args.end)) {
        if (wonStageIds.has(lead.stageId)) {
          b.won++;
          if (typeof lead.dealValue === "number") {
            addToCurrencyMap(b.salesValue, lead.dealCurrency, lead.dealValue);
          }
        } else if (lostStageIds.has(lead.stageId)) {
          b.lostClosed++;
        }
      }
    }

    // Attribute marketing spend by channel (agent view: own spend only).
    for (const e of expenses) {
      if (focusUserId && e.createdByUserId !== focusUserId) continue;
      if (!inWindow(e.spentAt, args.start, args.end)) continue;
      const b = bucket(e.channel);
      addToCurrencyMap(b.spend, e.currency, e.amount);
    }

    const bySource = [...buckets.values()].map((b) => ({
      source: b.source,
      leads: b.leads,
      won: b.won,
      conversionRate: conversionRate(b.won, b.won + b.lostClosed),
      salesValue: b.salesValue,
      spend: b.spend,
    }));
    bySource.sort((a, b) => b.leads - a.leads);
    return { bySource, isAdmin };
  },
});

// ── Property performance ────────────────────────────────────────────
export const propertyPerformance = query({
  args: windowArgs,
  handler: async (ctx, args) => {
    const { user, isAdmin, focusUserId } = await resolveScope(ctx, args);

    const [allProps, matches, expenses] = await Promise.all([
      ctx.db.query("properties").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("leadPropertyMatches").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("marketingExpenses").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
    ]);

    const properties = allProps.filter(
      (p) => (focusUserId ? p.createdByUserId === focusUserId : true)
    );
    const propIds = new Set(properties.map((p) => p._id));

    const inquiries = new Map<string, number>();
    const viewings = new Map<string, number>();
    const offers = new Map<string, number>();
    for (const m of matches) {
      if (!propIds.has(m.propertyId)) continue;
      if (!inWindow(m.createdAt, args.start, args.end)) continue;
      const id = m.propertyId as string;
      if (m.matchType === "requested" || m.matchType === "suggested") {
        inquiries.set(id, (inquiries.get(id) ?? 0) + 1);
      } else if (m.matchType === "viewed") {
        viewings.set(id, (viewings.get(id) ?? 0) + 1);
      } else if (m.matchType === "offered") {
        offers.set(id, (offers.get(id) ?? 0) + 1);
      }
    }

    const spend = new Map<string, CurrencyMap>();
    for (const e of expenses) {
      if (!e.propertyId || !propIds.has(e.propertyId)) continue;
      if (!inWindow(e.spentAt, args.start, args.end)) continue;
      const id = e.propertyId as string;
      const m = spend.get(id) ?? {};
      addToCurrencyMap(m, e.currency, e.amount);
      spend.set(id, m);
    }

    const SOLD = new Set(["sold", "let"]);
    // Days-on-market runs to the sold/let date if closed, otherwise to "now".
    // It must never use the reporting window's end directly: the "All time"
    // window ends at a far-future sentinel (MAX_TS), which would make an active
    // listing read as ~100 million days on market. Clamp to now.
    const now = Date.now();
    const statusCounts: Record<string, number> = {};
    const rows = properties.map((p) => {
      statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
      const endTs = SOLD.has(p.status) ? p.updatedAt : Math.min(args.end, now);
      // Prefer the marketing "date listed on market" when set; fall back to the
      // record creation time for properties that predate the field.
      const marketStart = p.listedOnMarketAt ?? p.createdAt;
      const id = p._id as string;
      return {
        propertyId: p._id,
        title: p.title,
        status: p.status,
        listingType: p.listingType,
        price: p.price,
        currency: p.currency,
        inquiries: inquiries.get(id) ?? 0,
        viewings: viewings.get(id) ?? 0,
        offers: offers.get(id) ?? 0,
        daysOnMarket: daysOnMarket(marketStart, endTs),
        spend: spend.get(id) ?? {},
      };
    });

    rows.sort(
      (a, b) =>
        b.inquiries + b.viewings + b.offers - (a.inquiries + a.viewings + a.offers)
    );
    return { rows, statusCounts, isAdmin };
  },
});

// ── Revenue, pipeline & leaderboards ────────────────────────────────
export const revenueSummary = query({
  args: windowArgs,
  handler: async (ctx, args) => {
    const { user, isAdmin, focusUserId } = await resolveScope(ctx, args);

    const [allLeads, commissions, stages] = await Promise.all([
      ctx.db.query("leads").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("dealCommissions").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("pipelineStages").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
    ]);
    stages.sort((a, b) => a.order - b.order);

    const wonStageIds = new Set(stages.filter((s) => s.terminalOutcome === "won").map((s) => s._id));

    const leads = allLeads.filter(
      (l) => (focusUserId ? l.ownerUserId === focusUserId : true)
    );

    // Closed-won revenue in window (by currency).
    const salesValue: CurrencyMap = {};
    for (const lead of leads) {
      if (inWindow(lead.closedAt, args.start, args.end) && wonStageIds.has(lead.stageId)) {
        if (typeof lead.dealValue === "number") {
          addToCurrencyMap(salesValue, lead.dealCurrency, lead.dealValue);
        }
      }
    }

    // Commission earned in window (by currency).
    const commission: CurrencyMap = {};
    for (const c of commissions) {
      if (focusUserId && c.leadAgentUserId !== focusUserId && c.propertyAgentUserId !== focusUserId) {
        continue;
      }
      if (!inWindow(c.createdAt, args.start, args.end)) continue;
      if (focusUserId) {
        if (c.leadAgentUserId === focusUserId) addToCurrencyMap(commission, c.dealCurrency, c.leadAgentAmount);
        if (c.propertyAgentUserId === focusUserId) addToCurrencyMap(commission, c.dealCurrency, c.propertyAgentAmount);
      } else {
        addToCurrencyMap(commission, c.dealCurrency, c.companyAmount + c.leadAgentAmount + c.propertyAgentAmount);
      }
    }

    // Pipeline value by stage (open leads only) + weighted forecast.
    const openLeads = leads.filter((l) => !l.closedAt);
    const forecast: CurrencyMap = {};
    const pipelineByStage = stages
      .filter((s) => !s.isTerminal)
      .map((s) => {
        const stageLeads = openLeads.filter((l) => l.stageId === s._id);
        const estimated: CurrencyMap = {};
        const weighted: CurrencyMap = {};
        for (const lead of stageLeads) {
          const value = estimateLeadValue(lead);
          const currency = lead.dealCurrency || lead.budgetCurrency || "USD";
          addToCurrencyMap(estimated, currency, value);
          const w = weightedForecastValue(value, s.winProbability);
          addToCurrencyMap(weighted, currency, w);
          addToCurrencyMap(forecast, currency, w);
        }
        return {
          stageId: s._id,
          name: s.name,
          winProbability: s.winProbability ?? null,
          openCount: stageLeads.length,
          estimatedValue: estimated,
          weightedValue: weighted,
        };
      });

    return { salesValue, commission, pipelineByStage, forecast, isAdmin };
  },
});

// ── Leaderboards (own tab) ──────────────────────────────────────────
export const leaderboards = query({
  args: windowArgs,
  handler: async (ctx, args) => {
    const { user, isAdmin, focusUserId } = await resolveScope(ctx, args);

    const [allLeads, activities, matches, stages, users] = await Promise.all([
      ctx.db.query("leads").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("activities").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("leadPropertyMatches").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("pipelineStages").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
    ]);

    const userMap = new Map(users.map((u) => [u._id, u]));
    const wonStageIds = new Set(stages.filter((s) => s.terminalOutcome === "won").map((s) => s._id));
    const lostStageIds = new Set(stages.filter((s) => s.terminalOutcome === "lost").map((s) => s._id));

    // Leaderboards are a cross-agent ranking, so they only render for an admin
    // viewing the whole org (not filtered to a single agent).
    if (!isAdmin || focusUserId) {
      return { available: false as const };
    }

    const managed = new Map<string, number>(); // leads assigned in window
    const viewings = new Map<string, number>();
    const closed = new Map<string, number>();
    const won = new Map<string, number>();
    const lost = new Map<string, number>();
    const revenue = new Map<string, { value: number; currencies: Set<string> }>();

    const bump = (m: Map<string, number>, id: string | undefined, by = 1) => {
      if (!id) return;
      m.set(id, (m.get(id) ?? 0) + by);
    };

    for (const lead of allLeads) {
      const owner = lead.ownerUserId as string;
      if (inWindow(lead.createdAt, args.start, args.end)) bump(managed, owner);
      if (inWindow(lead.closedAt, args.start, args.end)) {
        if (wonStageIds.has(lead.stageId)) {
          bump(closed, owner);
          bump(won, owner);
          if (typeof lead.dealValue === "number") {
            const r = revenue.get(owner) ?? { value: 0, currencies: new Set<string>() };
            r.value += lead.dealValue; // currency-agnostic for ranking only
            r.currencies.add(lead.dealCurrency || "USD");
            revenue.set(owner, r);
          }
        } else if (lostStageIds.has(lead.stageId)) {
          bump(lost, owner);
        }
      }
    }
    for (const act of activities) {
      if (act.type === "viewing" && inWindow(act.createdAt, args.start, args.end)) {
        bump(viewings, act.assignedToUserId as string);
      }
    }
    for (const m of matches) {
      if (m.matchType === "viewed" && inWindow(m.createdAt, args.start, args.end)) {
        bump(viewings, m.createdByUserId as string);
      }
    }

    const top = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([id, value]) => ({ userId: id as Id<"users">, name: userLabel(userMap.get(id as Id<"users">)), value }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    const conversion = [...managed.keys()]
      .map((id) => {
        const w = won.get(id) ?? 0;
        const closedTotal = w + (lost.get(id) ?? 0);
        return {
          userId: id as Id<"users">,
          name: userLabel(userMap.get(id as Id<"users">)),
          value: conversionRate(w, closedTotal),
        };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return {
      available: true as const,
      leadsManaged: top(managed),
      viewings: top(viewings),
      dealsClosed: top(closed),
      revenue: [...revenue.entries()]
        .map(([id, r]) => ({
          userId: id as Id<"users">,
          name: userLabel(userMap.get(id as Id<"users">)),
          value: r.value,
          mixedCurrency: r.currencies.size > 1,
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
      conversionRate: conversion,
    };
  },
});
