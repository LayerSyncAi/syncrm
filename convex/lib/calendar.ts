/**
 * Generic calendar-event utility.
 *
 * The event model and URL builder contain no app-specific text — callers map
 * their domain objects (tasks, activities, …) onto `CalendarEvent` before
 * calling in.
 */

/** Default event length used when no explicit end is supplied. */
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

export interface CalendarEvent {
  title: string;
  description?: string;
  location?: string;
  /**
   * Event start. Pass a `Date`, or an ISO-8601 string that includes an
   * explicit offset/`Z`. Naive strings (no offset) are ambiguous and will be
   * interpreted by the JS engine using the server's local timezone — always
   * provide an absolute instant.
   */
  start: Date | string;
  /** Event end. Defaults to `start` + 2 hours when omitted. */
  end?: Date | string;
  /** Optional link back to the source record. */
  url?: string;
}

/** Parse a Date | string into a Date, throwing on an unparseable value. */
function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid calendar date: ${String(value)}`);
  }
  return date;
}

/** Resolve the start/end pair, applying the default duration when needed. */
function resolveRange(event: CalendarEvent): { start: Date; end: Date } {
  const start = toDate(event.start);
  const end = event.end
    ? toDate(event.end)
    : new Date(start.getTime() + DEFAULT_DURATION_MS);
  return { start, end };
}

/** Format a Date as a compact UTC stamp: `yyyyMMddTHHmmssZ`. */
function formatGoogleDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Build a Google Calendar "add event" URL.
 * Returns an `https://calendar.google.com/calendar/render?...` link.
 */
export function generateGoogleCalendarUrl(event: CalendarEvent): string {
  const { start, end } = resolveRange(event);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatGoogleDate(start)}/${formatGoogleDate(end)}`,
  });

  const details = [event.description, event.url].filter(Boolean).join("\n\n");
  if (details) params.set("details", details);
  if (event.location) params.set("location", event.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
