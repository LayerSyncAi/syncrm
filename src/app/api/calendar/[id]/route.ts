import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { generateIcsContent } from "../../../../../convex/lib/calendar";

/**
 * Serves a downloadable .ics file for an activity. Linked from reminder emails,
 * so it must be unauthenticated and return an absolute-friendly attachment that
 * Apple Calendar, Outlook and other clients can open.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

  let activity: {
    _id: string;
    title: string;
    description: string;
    type: string;
    scheduledAt: number;
  } | null = null;
  try {
    activity = await convex.query(api.activities.getForCalendar, {
      activityId: id as Id<"activities">,
    });
  } catch {
    activity = null;
  }

  if (!activity) {
    return new Response("Activity not found", { status: 404 });
  }

  const siteUrl = process.env.SITE_URL || "http://localhost:3000";
  const ics = await generateIcsContent({
    title: activity.title,
    description: activity.description || undefined,
    start: new Date(activity.scheduledAt),
    url: `${siteUrl}/app/tasks`,
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="event-${id}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
