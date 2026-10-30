import { toE164 } from "../sms";
import { MIN_DUPLICATE_PHONE_DIGITS } from "./contactRoles";

/**
 * Matching a WhatsApp chat to a CRM record by phone number.
 *
 * WhatsApp always gives the full international number, but agents type local
 * ones ("077 123 4567") and normalizedPhone keeps the digits as typed. Pure and
 * Convex-free so the matching rules can be unit tested.
 */

/** A number as international digits with no plus: "263771234567". */
export function internationalDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  // Only these two forms are local. Anything else already has a country code,
  // so a South African 27... number must not gain a 263 prefix.
  if (digits.startsWith("0") || digits.length === 9) {
    return toE164(digits)?.slice(1) ?? digits;
  }
  return digits;
}

/** Every form the same number could be stored in, for exact index lookups. */
export function phoneVariants(phone: string): string[] {
  const intl = internationalDigits(phone);
  const variants = new Set([intl, `00${intl}`]);
  if (intl.startsWith("263")) {
    const local = intl.slice(3);
    variants.add(`0${local}`);
    variants.add(local);
  }
  return [...variants].filter((v) => v.length >= MIN_DUPLICATE_PHONE_DIGITS);
}

interface LeadLike<UserId> {
  ownerUserId: UserId;
  closedAt?: number;
  isArchived?: boolean;
  createdAt: number;
}

/** The open lead a chat belongs to: the caller's own first, then the newest. */
export function pickOpenLead<UserId, T extends LeadLike<UserId>>(leads: T[], userId: UserId): T | null {
  const open = leads.filter((l) => !l.closedAt && !l.isArchived);
  open.sort(
    (a, b) =>
      Number(b.ownerUserId === userId) - Number(a.ownerUserId === userId) || b.createdAt - a.createdAt
  );
  return open[0] ?? null;
}
