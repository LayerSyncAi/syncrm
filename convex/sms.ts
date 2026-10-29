/**
 * SMS sender with Twilio.
 *
 * Each agency can set its own Twilio account in Sync Notify settings; the
 * deployment's env vars are the fallback:
 *   - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   - TWILIO_FROM: the sending number or alphanumeric sender id
 *
 * Without them the message is only logged, the way email behaves in
 * development, and reported back as "logged".
 */

export type SmsResult = { status: "sent" | "failed" | "logged"; error?: string };

/** Zimbabwe numbers written locally ("077 123 4567") become +263771234567. */
export function toE164(phone: string, defaultCountry = "263"): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.length >= 10 ? digits : null;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0") && digits.length >= 9) return `+${defaultCountry}${digits.slice(1)}`;
  if (digits.startsWith(defaultCountry)) return `+${digits}`;
  return digits.length >= 9 ? `+${defaultCountry}${digits}` : null;
}

export type SmsCredentials = { accountSid: string; authToken: string; from: string };

/** Send with the agency's own account when given, else the deployment's. */
export async function sendSms(to: string, body: string, creds?: SmsCredentials | null): Promise<SmsResult> {
  const sid = creds?.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const token = creds?.authToken || process.env.TWILIO_AUTH_TOKEN;
  const from = creds?.from || process.env.TWILIO_FROM;
  const number = toE164(to);
  if (!number) return { status: "failed", error: "Not a usable phone number" };
  if (!sid || !token || !from) {
    console.log(`[sms:dev] to ${number}: ${body}`);
    return { status: "logged" };
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: number, From: from, Body: body }).toString(),
    });
    if (!res.ok) {
      const detail = await res.text();
      return { status: "failed", error: `Twilio ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { status: "sent" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}
