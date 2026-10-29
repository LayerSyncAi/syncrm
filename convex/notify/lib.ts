/**
 * Sync Notify rules kept pure, shared by the server and the compose screen.
 */

/** Placeholders every audience fills. Imported lists may add their own columns. */
export const MESSAGE_FIELDS = [
  { key: "name", label: "Name" },
  { key: "owed", label: "Amount owed" },
  { key: "overdue", label: "Amount overdue" },
  { key: "nextDue", label: "Next amount due" },
  { key: "nextDueDate", label: "Next due date" },
  { key: "item", label: "What it is for" },
  { key: "agency", label: "Agency name" },
] as const;

export type MessageValues = Record<string, string>;

/** Fill {name}, {owed} and any other {field}. Unknown fields stay as typed. */
export function fillTemplate(template: string, values: MessageValues): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (values[k] !== undefined ? values[k] : m));
}

/** Fields used in a template that a recipient has no value for. */
export function missingFields(template: string, values: MessageValues): string[] {
  const used = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return [...new Set(used.filter((k) => values[k] === undefined || values[k] === ""))];
}

/** SMS parts a message will use (160 characters, or 153 each when split). */
export function smsParts(text: string): number {
  if (text.length <= 160) return 1;
  return Math.ceil(text.length / 153);
}

export function looksLikeEmail(s: string | undefined | null): boolean {
  return !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function looksLikePhone(s: string | undefined | null): boolean {
  return !!s && s.replace(/\D/g, "").length >= 9;
}

/** Pick the channel and address, honouring what the agency switched on. */
export function routeMessage(
  s: { emailEnabled: boolean; smsEnabled: boolean; preferredChannel: "email" | "sms" },
  m: { channel: "email" | "sms" | "preferred"; email?: string; phone?: string }
): { channel: "email" | "sms"; to: string } | { error: string } {
  const can = {
    email: s.emailEnabled && looksLikeEmail(m.email),
    sms: s.smsEnabled && looksLikePhone(m.phone),
  };
  const order: Array<"email" | "sms"> =
    m.channel === "preferred" ? (s.preferredChannel === "sms" ? ["sms", "email"] : ["email", "sms"]) : [m.channel];
  for (const c of order) if (can[c]) return { channel: c, to: c === "email" ? m.email!.trim() : m.phone!.trim() };
  if (m.channel !== "preferred" && !(m.channel === "email" ? s.emailEnabled : s.smsEnabled)) {
    return { error: `${m.channel === "email" ? "Email" : "SMS"} is switched off in Sync Notify settings` };
  }
  return { error: m.channel === "sms" ? "No usable phone number" : m.channel === "email" ? "No usable email address" : "No usable email or phone" };
}
