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
        "Move a lead to another pipeline stage. Use listPipelineStages for stage ids. For closing (terminal) stages, provide closeReason; for won deals optionally dealValue and dealCurrency.",
      inputSchema: zodSchema(
        z
          .object({
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
      description: "Replace the notes field on a lead with the given text.",
      inputSchema: zodSchema(
        z
          .object({
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
  };
}
