import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserWithOrg } from "./helpers";
import { Doc, Id } from "./_generated/dataModel";
import {
  estimateLeadValue,
  weightedForecastValue,
  conversionRate,
  inWindow,
  daysOnMarket,
  addToCurrencyMap,
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
  const isAdmin = user.role === "admin";
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
    const statusCounts: Record<string, number> = {};
    const rows = properties.map((p) => {
      statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
      const endTs = SOLD.has(p.status) ? p.updatedAt : args.end;
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
        daysOnMarket: daysOnMarket(p.createdAt, endTs),
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
export const revenueAndLeaderboards = query({
  args: windowArgs,
  handler: async (ctx, args) => {
    const { user, isAdmin, focusUserId } = await resolveScope(ctx, args);

    const [allLeads, commissions, stages, users] = await Promise.all([
      ctx.db.query("leads").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("dealCommissions").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("pipelineStages").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
      ctx.db.query("users").withIndex("by_org", (q) => q.eq("orgId", user.orgId)).collect(),
    ]);
    stages.sort((a, b) => a.order - b.order);

    const userMap = new Map(users.map((u) => [u._id, u]));
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

    // Leaderboards (admin only; agents have no cross-agent ranking).
    let leaderboards: {
      leadsManaged: { userId: Id<"users">; name: string; value: number }[];
      dealsClosed: { userId: Id<"users">; name: string; value: number }[];
      revenue: { userId: Id<"users">; name: string; value: number; mixedCurrency: boolean }[];
    } | null = null;

    if (isAdmin && !focusUserId) {
      const managed = new Map<string, number>();
      const closed = new Map<string, number>();
      const revenue = new Map<string, { value: number; currencies: Set<string> }>();
      for (const lead of allLeads) {
        const owner = lead.ownerUserId as string;
        managed.set(owner, (managed.get(owner) ?? 0) + 1);
        if (inWindow(lead.closedAt, args.start, args.end) && wonStageIds.has(lead.stageId)) {
          closed.set(owner, (closed.get(owner) ?? 0) + 1);
          if (typeof lead.dealValue === "number") {
            const r = revenue.get(owner) ?? { value: 0, currencies: new Set<string>() };
            r.value += lead.dealValue; // currency-agnostic for ranking only
            r.currencies.add(lead.dealCurrency || "USD");
            revenue.set(owner, r);
          }
        }
      }
      const top = (m: Map<string, number>) =>
        [...m.entries()]
          .map(([id, value]) => ({ userId: id as Id<"users">, name: userLabel(userMap.get(id as Id<"users">)), value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10);
      leaderboards = {
        leadsManaged: top(managed),
        dealsClosed: top(closed),
        revenue: [...revenue.entries()]
          .map(([id, r]) => ({
            userId: id as Id<"users">,
            name: userLabel(userMap.get(id as Id<"users">)),
            value: r.value,
            mixedCurrency: r.currencies.size > 1,
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 10),
      };
    }

    return { salesValue, commission, pipelineByStage, forecast, leaderboards, isAdmin };
  },
});
