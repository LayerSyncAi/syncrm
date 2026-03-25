import { fetchMutation, fetchQuery } from "convex/nextjs";
import { tool, zodSchema, type ToolSet } from "ai";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const convexOpts = (token: string) => ({ token });

const MAX_TOOL_JSON = 14_000;

function truncateForModel(value: unknown): unknown {
  const s = JSON.stringify(value);
  if (s.length <= MAX_TOOL_JSON) {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return { raw: s.slice(0, MAX_TOOL_JSON) };
    }
  }
  return { truncated: true, preview: s.slice(0, MAX_TOOL_JSON) + "…" };
}

const leadSourceSchema = z.enum([
  "walk_in",
  "referral",
  "facebook",
  "whatsapp",
  "website",
  "property_portal",
  "other",
]);

const activityTypeSchema = z.enum([
  "call",
  "whatsapp",
  "email",
  "meeting",
  "viewing",
  "note",
]);

function parseScheduledAt(input: unknown): number | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string") {
    const t = Date.parse(input);
    if (!Number.isNaN(t)) return t;
  }
  return undefined;
}

function emptyToUndefined(s: string | undefined) {
  const t = s?.trim();
  return t ? t : undefined;
}

/** UTC midnight–end of day (for server-side “today” presets; mention timezone to user if needed). */
function utcTodayBoundsMs() {
  const now = new Date();
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0
  );
  const end = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23,
    59,
    59,
    999
  );
  return { start, end };
}

/** Monday 00:00 UTC through Sunday 23:59:59.999 UTC of that week. */
function utcMondayWeekBoundsMs() {
  const now = new Date();
  const dayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dow = new Date(dayUtc).getUTCDay();
  const daysFromMonday = (dow + 6) % 7;
  const start = dayUtc - daysFromMonday * 24 * 60 * 60 * 1000;
  const end = start + 7 * 24 * 60 * 60 * 1000 - 1;
  return { start, end };
}

export function createCopilotTools(token: string): ToolSet {
  const opts = convexOpts(token);

  return {
    getDashboardSummary: tool({
      description:
        "Get pipeline KPIs: totals, open/won/lost counts, stage breakdown, and optional score distribution. Use for 'how many leads' or dashboard questions.",
      inputSchema: zodSchema(z.object({}).strict()),
      execute: async () => {
        try {
          const [dash, scores] = await Promise.all([
            fetchQuery(api.leads.dashboardStats, {}, opts),
            fetchQuery(api.leads.dashboardScoreStats, {}, opts),
          ]);
          return truncateForModel({
            dashboard: dash,
            scoreSummary: scores
              ? {
                  scoredCount: scores.scoredCount,
                  totalActive: scores.totalActive,
                  overallAvg: scores.overallAvg,
                  distribution: scores.distribution,
                  topUnworked: (scores.topUnworked ?? []).slice(0, 8),
                }
              : null,
          });
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to load dashboard stats",
          };
        }
      },
    }),

    searchContacts: tool({
      description:
        "Search contacts by name, phone, email, or company substring. Use before creating a duplicate contact or to resolve a person.",
      inputSchema: zodSchema(
        z
          .object({
            q: z.string().optional().describe("Search substring"),
            page: z.number().int().min(0).optional().default(0),
            pageSize: z.number().int().min(1).max(25).optional().default(15),
          })
          .strict()
      ),
      execute: async (input) => {
        try {
          const result = await fetchQuery(
            api.contacts.list,
            {
              q: input.q,
              page: input.page ?? 0,
              pageSize: Math.min(input.pageSize ?? 15, 25),
            },
            opts
          );
          return truncateForModel(result);
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to search contacts",
          };
        }
      },
    }),

    lookupPersonByName: tool({
      description:
        "Search both contacts and leads by name (or phone/email substring). Use for 'who is X?', bare names, or disambiguating a person in the CRM.",
      inputSchema: zodSchema(
        z
          .object({
            query: z.string().min(1).describe("Name or search string"),
            pageSize: z.number().int().min(1).max(15).optional().default(10),
          })
          .strict()
      ),
      execute: async (input) => {
        try {
          const size = Math.min(input.pageSize ?? 10, 15);
          const [contacts, leads] = await Promise.all([
            fetchQuery(
              api.contacts.list,
              { q: input.query, page: 0, pageSize: size },
              opts
            ),
            fetchQuery(
              api.leads.list,
              { q: input.query, page: 0, pageSize: size },
              opts
            ),
          ]);
          return truncateForModel({
            query: input.query,
            contacts: (contacts as { items?: unknown[] })?.items ?? contacts,
            leads: (leads as { items?: unknown[] })?.items ?? leads,
          });
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to look up person",
          };
        }
      },
    }),

    searchLeads: tool({
      description:
        "Search and list leads with filters. Returns a page of leads with stage and owner names. Use q for name search.",
      inputSchema: zodSchema(
        z
          .object({
            q: z.string().optional().describe("Search by contact/lead name"),
            stageId: z.string().optional().describe("Pipeline stage Convex id"),
            interestType: z.enum(["rent", "buy"]).optional(),
            page: z.number().int().min(0).optional().default(0),
            pageSize: z.number().int().min(1).max(20).optional().default(15),
          })
          .strict()
      ),
      execute: async (input) => {
        try {
          const result = await fetchQuery(
            api.leads.list,
            {
              q: input.q,
              stageId: input.stageId
                ? (input.stageId as Id<"pipelineStages">)
                : undefined,
              interestType: input.interestType,
              page: input.page ?? 0,
              pageSize: Math.min(input.pageSize ?? 15, 20),
            },
            opts
          );
          return truncateForModel(result);
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to search leads",
          };
        }
      },
    }),

    getLeadDetails: tool({
      description:
        "Load full detail for one lead by id (use ids from searchLeads). Includes stage and owner.",
      inputSchema: zodSchema(
        z
          .object({
            leadId: z.string().describe("Convex leads table id"),
          })
          .strict()
      ),
      execute: async (input) => {
        try {
          const row = await fetchQuery(
            api.leads.getById,
            { leadId: input.leadId as Id<"leads"> },
            opts
          );
          if (!row) {
            return { error: "Lead not found or access denied" };
          }
          return truncateForModel(row);
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to load lead",
          };
        }
      },
    }),

    listUpcomingTasks: tool({
      description:
        "List upcoming scheduled activities assigned to the current user (tasks with a scheduled time, not completed).",
      inputSchema: zodSchema(z.object({}).strict()),
      execute: async () => {
        try {
          const rows = await fetchQuery(api.activities.listUpcomingForMe, {}, opts);
          const sorted = [...rows].sort(
            (a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0)
          );
          return truncateForModel({ items: sorted.slice(0, 25), total: rows.length });
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to load tasks",
          };
        }
      },
    }),

    getMyTasksInTimeWindow: tool({
      description:
        "List your open (todo) tasks with a scheduled time falling between rangeStartMs and rangeEndMs (Unix ms), or use preset utc_today / utc_week_monday_utc for quick ranges. Admins see all org tasks; agents see only theirs. Say if you used UTC. Optionally include open tasks with no scheduled time.",
      inputSchema: zodSchema(
        z
          .object({
            preset: z
              .enum(["utc_today", "utc_week_monday_utc"])
              .optional()
              .describe("Quick range; omit if using explicit rangeStartMs/rangeEndMs"),
            rangeStartMs: z.number().optional(),
            rangeEndMs: z.number().optional(),
            includeUnscheduledOpen: z
              .boolean()
              .optional()
              .describe("Also include open todos with no scheduledAt"),
          })
          .strict()
      ),
      execute: async (input) => {
        try {
          let rangeStartMs = input.rangeStartMs;
          let rangeEndMs = input.rangeEndMs;
          if (input.preset === "utc_today") {
            const b = utcTodayBoundsMs();
            rangeStartMs = b.start;
            rangeEndMs = b.end;
          } else if (input.preset === "utc_week_monday_utc") {
            const b = utcMondayWeekBoundsMs();
            rangeStartMs = b.start;
            rangeEndMs = b.end;
          }
          if (rangeStartMs === undefined || rangeEndMs === undefined) {
            return {
              error:
                "Provide preset (utc_today or utc_week_monday_utc) or both rangeStartMs and rangeEndMs (Unix ms).",
            };
          }
          const result = await fetchQuery(
            api.activities.listTodosScheduledBetween,
            {
              rangeStartMs,
              rangeEndMs,
              includeUnscheduledOpen: input.includeUnscheduledOpen,
            },
            opts
          );
          return truncateForModel({
            ...result,
            note:
              input.preset != null
                ? "Range uses UTC. If the user cares about local timezone, ask their timezone and switch to explicit rangeStartMs/rangeEndMs."
                : undefined,
          });
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to load tasks in window",
          };
        }
      },
    }),

    listMyOpenTasks: tool({
      description:
        "List open (todo) tasks for the current user (agents: own only; admins: whole org), newest activity first. Use for backlog / all open tasks when not tied to a single day.",
      inputSchema: zodSchema(
        z
          .object({
            page: z.number().int().min(0).optional().default(0),
            pageSize: z.number().int().min(1).max(50).optional().default(30),
          })
          .strict()
      ),
      execute: async (input) => {
        try {
          const result = await fetchQuery(
            api.activities.listAllTasks,
            {
              status: "todo",
              page: input.page ?? 0,
              pageSize: Math.min(input.pageSize ?? 30, 50),
            },
            opts
          );
          return truncateForModel(result);
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to list open tasks",
          };
        }
      },
    }),

    getPropertyPortfolioSummary: tool({
      description:
        "High-level counts for non-draft properties: totals by status, listing type, property type, and simple price min/max/avg. Use for 'summary of properties we have'.",
      inputSchema: zodSchema(z.object({}).strict()),
      execute: async () => {
        try {
          const stats = await fetchQuery(api.properties.summaryStats, {}, opts);
          return truncateForModel(stats);
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to load property summary",
          };
        }
      },
    }),

    searchProperties: tool({
      description:
        "Search and filter the property catalog (title q, location substring, type, listing type, status, price range). Returns a page of matches for 'properties that match …'.",
      inputSchema: zodSchema(
        z
          .object({
            q: z.string().optional().describe("Title contains (case-insensitive)"),
            location: z.string().optional(),
            type: z
              .enum(["house", "apartment", "land", "commercial", "other"])
              .optional(),
            listingType: z.enum(["rent", "sale"]).optional(),
            status: z
              .enum(["available", "under_offer", "let", "sold", "off_market"])
              .optional(),
            priceMin: z.number().optional(),
            priceMax: z.number().optional(),
            page: z.number().int().min(0).optional().default(0),
            pageSize: z.number().int().min(1).max(25).optional().default(15),
          })
          .strict()
      ),
      execute: async (input) => {
        try {
          const result = await fetchQuery(
            api.properties.list,
            {
              q: input.q,
              location: input.location,
              type: input.type,
              listingType: input.listingType,
              status: input.status,
              priceMin: input.priceMin,
              priceMax: input.priceMax,
              page: input.page ?? 0,
              pageSize: Math.min(input.pageSize ?? 15, 25),
            },
            opts
          );
          return truncateForModel(result);
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to search properties",
          };
        }
      },
    }),

    getLeadsForProperty: tool({
      description:
        "List leads linked to a specific property (Convex property id). Use after searchProperties if the user names a listing. Combine with getLeadDetails for one row.",
      inputSchema: zodSchema(
        z
          .object({
            propertyId: z.string().describe("Convex properties table id"),
            page: z.number().int().min(0).optional().default(0),
            pageSize: z.number().int().min(1).max(25).optional().default(15),
          })
          .strict()
      ),
      execute: async (input) => {
        try {
          const result = await fetchQuery(
            api.leads.list,
            {
              propertyId: input.propertyId as Id<"properties">,
              page: input.page ?? 0,
              pageSize: Math.min(input.pageSize ?? 15, 25),
            },
            opts
          );
          return truncateForModel(result);
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to list leads for property",
          };
        }
      },
    }),

    listPipelineStages: tool({
      description:
        "List pipeline stages in order for the organization. Use before moveLeadStage to pick a valid stageId.",
      inputSchema: zodSchema(z.object({}).strict()),
      execute: async () => {
        try {
          const stages = await fetchQuery(api.stages.list, {}, opts);
          return truncateForModel(
            stages.map((s) => ({
              id: s._id,
              name: s.name,
              order: s.order,
              isTerminal: s.isTerminal,
              terminalOutcome: s.terminalOutcome,
            }))
          );
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to load stages",
          };
        }
      },
    }),

    moveLeadStage: tool({
      description:
        "Move a lead to another pipeline stage. Use listPipelineStages for stage ids. For closing (terminal) stages, provide closeReason; for won deals optionally dealValue and dealCurrency. Only after the user explicitly confirmed the move in their latest message.",
      inputSchema: zodSchema(
        z
          .object({
            userConfirmedMutation: z
              .literal(true)
              .describe(
                "Must be true only after the user explicitly confirmed this change (e.g. yes, confirm, go ahead)."
              ),
            leadId: z.string(),
            stageId: z.string(),
            closeReason: z.string().optional(),
            dealValue: z.number().optional(),
            dealCurrency: z.string().optional(),
          })
          .strict()
      ),
      execute: async (input) => {
        try {
          await fetchMutation(
            api.leads.moveStage,
            {
              leadId: input.leadId as Id<"leads">,
              stageId: input.stageId as Id<"pipelineStages">,
              closeReason: input.closeReason,
              dealValue: input.dealValue,
              dealCurrency: input.dealCurrency,
            },
            opts
          );
          return {
            ok: true,
            leadId: input.leadId,
            newStageId: input.stageId,
          };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to move stage",
          };
        }
      },
    }),

    updateLeadNotes: tool({
      description:
        "Replace the notes field on a lead with the given text. Only after the user explicitly confirmed in their latest message.",
      inputSchema: zodSchema(
        z
          .object({
            userConfirmedMutation: z
              .literal(true)
              .describe(
                "Must be true only after the user explicitly confirmed this change (e.g. yes, confirm, go ahead)."
              ),
            leadId: z.string(),
            notes: z.string().max(20_000),
          })
          .strict()
      ),
      execute: async (input) => {
        try {
          await fetchMutation(
            api.leads.updateNotes,
            {
              leadId: input.leadId as Id<"leads">,
              notes: input.notes,
            },
            opts
          );
          return { ok: true, leadId: input.leadId };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to update notes",
          };
        }
      },
    }),

    createContact: tool({
      description:
        "Create a new contact. Call only after summarizing fields and receiving explicit user confirmation. Prefer collecting phone or email.",
      inputSchema: zodSchema(
        z
          .object({
            userConfirmedMutation: z
              .literal(true)
              .describe(
                "Must be true only after the user explicitly confirmed creation (e.g. yes, create it, confirm)."
              ),
            name: z.string().min(1).max(200),
            phone: z.string().max(40).optional(),
            email: z.string().max(320).optional(),
            company: z.string().max(200).optional(),
            notes: z.string().max(10_000).optional(),
          })
          .strict()
      ),
      execute: async (input) => {
        try {
          const contactId = await fetchMutation(
            api.contacts.create,
            {
              name: input.name.trim(),
              phone: emptyToUndefined(input.phone),
              email: emptyToUndefined(input.email),
              company: emptyToUndefined(input.company),
              notes: emptyToUndefined(input.notes),
            },
            opts
          );
          return { ok: true, contactId };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to create contact",
          };
        }
      },
    }),

    createLead: tool({
      description:
        "Create a new lead for an existing contact. Requires stageId from listPipelineStages, source, interestType, notes, and preferredAreas (use [] only if user has none). Only after explicit user confirmation.",
      inputSchema: zodSchema(
        z
          .object({
            userConfirmedMutation: z
              .literal(true)
              .describe(
                "Must be true only after the user explicitly confirmed creation (e.g. yes, create it, confirm)."
              ),
            contactId: z.string(),
            source: leadSourceSchema,
            interestType: z.enum(["rent", "buy"]),
            notes: z.string().min(1).max(20_000),
            stageId: z.string(),
            preferredAreas: z.array(z.string()).optional(),
            budgetCurrency: z.string().max(10).optional(),
            budgetMin: z.number().optional(),
            budgetMax: z.number().optional(),
            ownerUserId: z.string().optional().describe("Admin only: assign to another user"),
          })
          .strict()
      ),
      execute: async (input) => {
        try {
          const leadId = await fetchMutation(
            api.leads.create,
            {
              contactId: input.contactId as Id<"contacts">,
              source: input.source,
              interestType: input.interestType,
              notes: input.notes,
              stageId: input.stageId as Id<"pipelineStages">,
              preferredAreas: input.preferredAreas?.length ? input.preferredAreas : [],
              budgetCurrency: emptyToUndefined(input.budgetCurrency),
              budgetMin: input.budgetMin,
              budgetMax: input.budgetMax,
              ownerUserId: input.ownerUserId
                ? (input.ownerUserId as Id<"users">)
                : undefined,
            },
            opts
          );
          return { ok: true, leadId, contactId: input.contactId };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to create lead",
          };
        }
      },
    }),

    createTaskForLead: tool({
      description:
        "Create an activity/task linked to a lead. Optional scheduledAt as ISO-8601 string or Unix ms. Only after explicit user confirmation.",
      inputSchema: zodSchema(
        z
          .object({
            userConfirmedMutation: z
              .literal(true)
              .describe(
                "Must be true only after the user explicitly confirmed creation (e.g. yes, create it, confirm)."
              ),
            leadId: z.string(),
            type: activityTypeSchema,
            title: z.string().min(1).max(300),
            description: z.string().min(1).max(10_000),
            scheduledAt: z.union([z.number(), z.string()]).optional(),
            assignedToUserId: z.string().optional(),
          })
          .strict()
      ),
      execute: async (input) => {
        try {
          const scheduledAt = parseScheduledAt(input.scheduledAt);
          const activityId = await fetchMutation(
            api.activities.createForLead,
            {
              leadId: input.leadId as Id<"leads">,
              type: input.type,
              title: input.title,
              description: input.description,
              scheduledAt,
              assignedToUserId: input.assignedToUserId
                ? (input.assignedToUserId as Id<"users">)
                : undefined,
            },
            opts
          );
          return { ok: true, activityId, leadId: input.leadId };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to create task",
          };
        }
      },
    }),

    createStandaloneTask: tool({
      description:
        "Create a task not tied to a lead. Optional scheduledAt as ISO-8601 or Unix ms. Only after explicit user confirmation.",
      inputSchema: zodSchema(
        z
          .object({
            userConfirmedMutation: z
              .literal(true)
              .describe(
                "Must be true only after the user explicitly confirmed creation (e.g. yes, create it, confirm)."
              ),
            type: activityTypeSchema,
            title: z.string().min(1).max(300),
            description: z.string().min(1).max(10_000),
            scheduledAt: z.union([z.number(), z.string()]).optional(),
            assignedToUserId: z.string().optional(),
          })
          .strict()
      ),
      execute: async (input) => {
        try {
          const scheduledAt = parseScheduledAt(input.scheduledAt);
          const activityId = await fetchMutation(
            api.activities.createStandalone,
            {
              type: input.type,
              title: input.title,
              description: input.description,
              scheduledAt,
              assignedToUserId: input.assignedToUserId
                ? (input.assignedToUserId as Id<"users">)
                : undefined,
            },
            opts
          );
          return { ok: true, activityId };
        } catch (e) {
          return {
            error: e instanceof Error ? e.message : "Failed to create task",
          };
        }
      },
    }),
  };
}
