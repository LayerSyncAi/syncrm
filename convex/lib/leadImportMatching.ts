/**
 * Pure helpers for the lead import: reading the portal's interest wording and
 * resolving the "Primary Agent" column to an agent in the organisation.
 *
 * Dependency-free so they run in Convex functions, in the import page (for the
 * preview) and in src/__tests__ without the Convex runtime.
 */

export type ImportInterest = "rent" | "buy";

// Wordings seen on (or expected from) Property Book and Property.co.zw
// exports, plus the obvious variants agents type by hand. Compared after
// lower-casing and collapsing punctuation/whitespace (see normaliseInterest).
const RENT_WORDS = new Set([
  "rent",
  "rental",
  "rentals",
  "renting",
  "renter",
  "to rent",
  "for rent",
  "to let",
  "for let",
  "let",
  "letting",
  "lease",
  "leasing",
  "to lease",
  "for lease",
  "tenant",
  "tenancy",
  "residential rent",
  "residential rental",
  "commercial rent",
  "commercial rental",
  "rent residential",
  "rent commercial",
  "property to rent",
  "property for rent",
  "property to let",
  "looking to rent",
  "wants to rent",
]);

const BUY_WORDS = new Set([
  "buy",
  "buying",
  "buyer",
  "to buy",
  "purchase",
  "purchasing",
  "for sale",
  "sale",
  "sales",
  "sell",
  "selling",
  "on sale",
  "residential sale",
  "residential sales",
  "commercial sale",
  "commercial sales",
  "sale residential",
  "sale commercial",
  "property for sale",
  "looking to buy",
  "wants to buy",
]);

function normaliseInterest(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[_\-/.,:;()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Read an interest-type cell. Returns null when the value is empty or not
 * recognised — callers must flag that rather than defaulting to "buy".
 */
export function parseInterestType(raw: string | undefined | null): ImportInterest | null {
  if (!raw) return null;
  const value = normaliseInterest(raw);
  if (!value) return null;
  if (RENT_WORDS.has(value)) return "rent";
  if (BUY_WORDS.has(value)) return "buy";

  // Longer phrases ("Residential Property To Let", "House for sale in
  // Borrowdale"): look for a rent or buy keyword, but only accept the answer
  // when exactly one side is mentioned.
  const words = value.split(" ");
  const has = (w: string) => words.includes(w);
  const phrase = ` ${value} `;
  const rentHit =
    has("rent") || has("rental") || has("renting") || has("rentals") ||
    has("lease") || has("leasing") || has("letting") ||
    phrase.includes(" to let ") || phrase.includes(" for let ");
  const buyHit =
    has("buy") || has("buying") || has("purchase") || has("sale") ||
    has("sales") || phrase.includes(" for sale ");
  if (rentHit && !buyHit) return "rent";
  if (buyHit && !rentHit) return "buy";
  return null;
}

// ─── Primary Agent matching ────────────────────────────────────────────────

export interface AgentCandidate {
  id: string;
  /** Display name (fullName || name). */
  name?: string;
  email?: string;
}

export type AgentMatch =
  | { status: "empty" }
  | { status: "matched"; agentId: string; agentName: string }
  | { status: "ambiguous"; candidates: string[] }
  | { status: "not_found" };

/** Lower-case, drop punctuation, split on whitespace. */
export function nameTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9@\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * How well the import value's tokens fit an agent's name tokens.
 * 0 = no match. Otherwise every token from the value must land on a different
 * token of the agent's name, in any order:
 *   3 — the same set of words ("moyo john" vs "John Moyo")
 *   2 — every whole word matches exactly; initials match a word's first
 *       letter ("J. Moyo", "John M")
 *   1 — words are prefixes of the agent's words ("Jo Moy", "Tadi")
 */
function matchTier(query: string[], agent: string[]): number {
  if (query.length === 0 || agent.length === 0) return 0;
  if (query.length > agent.length) return 0;

  // Assign each query token to a distinct agent token. Try exact matches
  // first so "John Johnson" vs "John J" pairs john→john, j→johnson.
  const used = new Array(agent.length).fill(false);
  let allWholeExact = true;
  const order = [...query].sort((a, b) => b.length - a.length);
  for (const q of order) {
    let idx = agent.findIndex((a, i) => !used[i] && a === q);
    if (idx === -1) {
      idx = agent.findIndex((a, i) => !used[i] && a.startsWith(q));
      if (idx === -1) return 0;
      // An initial ("j") is as good as an exact word; a longer fragment is not.
      if (q.length > 1) allWholeExact = false;
    }
    used[idx] = true;
  }
  if (query.length === agent.length && used.every(Boolean) && allWholeExact) {
    const qs = [...query].sort().join(" ");
    const as = [...agent].sort().join(" ");
    if (qs === as) return 3;
  }
  return allWholeExact ? 2 : 1;
}

/**
 * Resolve a Primary Agent cell to exactly one agent, or report why not.
 * Never guesses: when the best-fitting tier holds more than one agent the
 * result is "ambiguous".
 */
export function matchAgent(raw: string | undefined | null, agents: AgentCandidate[]): AgentMatch {
  const value = (raw ?? "").trim();
  if (!value) return { status: "empty" };

  // An email address must match exactly.
  if (value.includes("@")) {
    const email = value.toLowerCase();
    const hits = agents.filter((a) => a.email && a.email.trim().toLowerCase() === email);
    if (hits.length === 1) {
      return { status: "matched", agentId: hits[0].id, agentName: displayName(hits[0]) };
    }
    if (hits.length > 1) return { status: "ambiguous", candidates: hits.map(displayName) };
    // fall through: "John Moyo <john@x.com>" style values still match by name
  }

  const query = nameTokens(value.replace(/<[^>]*>/g, " ")).filter((t) => !t.includes("@"));
  if (query.length === 0) return { status: "not_found" };

  let bestTier = 0;
  let best: AgentCandidate[] = [];
  for (const agent of agents) {
    const names = [agent.name, agent.email ? agent.email.split("@")[0].replace(/[._-]+/g, " ") : undefined]
      .filter((n): n is string => !!n && n.trim().length > 0);
    let tier = 0;
    for (const n of names) tier = Math.max(tier, matchTier(query, nameTokens(n)));
    if (tier === 0) continue;
    if (tier > bestTier) {
      bestTier = tier;
      best = [agent];
    } else if (tier === bestTier) {
      best.push(agent);
    }
  }

  if (best.length === 1) {
    return { status: "matched", agentId: best[0].id, agentName: displayName(best[0]) };
  }
  if (best.length > 1) return { status: "ambiguous", candidates: best.map(displayName) };
  return { status: "not_found" };
}

function displayName(a: AgentCandidate): string {
  return a.name?.trim() || a.email || "Unknown";
}

/** Column headers that mean "Primary Agent" in portal exports. */
export const PRIMARY_AGENT_HEADER_ALIASES = [
  "primaryagent",
  "agent",
  "agentname",
  "assignedagent",
  "assignedto",
  "leadagent",
  "listingagent",
  "responsibleagent",
  "leadowner",
  "agentfullname",
  "salesagent",
  "consultant",
  "negotiator",
];

/** Column headers that mean "Interest Type" in portal exports. */
export const INTEREST_HEADER_ALIASES = [
  "interesttype",
  "interest",
  "enquirytype",
  "inquirytype",
  "leadtype",
  "listingtype",
  "transactiontype",
  "dealtype",
  "purpose",
  "salesorrental",
  "saleorrent",
  "rentorbuy",
  "buyorrent",
  "lookingto",
];
