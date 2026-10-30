import { toE164 } from "../../convex/sms";

/**
 * One-tap contact links for a stored phone number. Local Zimbabwe numbers
 * ("077 123 4567") get +263, the same rule SMS sending uses.
 */

/** A tel: link, or null when there is no number. */
export function telHref(phone: string | null | undefined): string | null {
  const raw = phone?.replace(/[^\d+]/g, "") ?? "";
  if (!raw) return null;
  return `tel:${toE164(raw) ?? raw}`;
}

/** A WhatsApp chat link, or null when the number can't be read. */
export function whatsAppHref(phone: string | null | undefined): string | null {
  const e164 = phone ? toE164(phone) : null;
  return e164 ? `https://wa.me/${e164.slice(1)}` : null;
}
