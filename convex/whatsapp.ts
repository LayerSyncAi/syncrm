/**
 * WhatsApp message sender interface - placeholder implementation
 * Uses the Twilio WhatsApp API for sending messages.
 *
 * Setup:
 * 1. Create a Twilio account at https://www.twilio.com
 * 2. Enable WhatsApp in the Twilio Console (Messaging > Try it out > Send a WhatsApp message)
 * 3. Get a WhatsApp-enabled Twilio number or use the sandbox for testing
 * 4. Set the following environment variables in your Convex dashboard:
 *    - TWILIO_ACCOUNT_SID
 *    - TWILIO_AUTH_TOKEN
 *    - TWILIO_WHATSAPP_FROM  (e.g. "whatsapp:+14155238886")
 *
 * Note: For production, you need to register message templates with Meta
 * for business-initiated messages (notifications). Twilio sandbox allows
 * free-form messages for testing.
 */

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WhatsAppMessageOptions {
  to: string; // E.164 format phone number e.g. "+263771234567"
  body: string; // Plain text message content
}

/**
 * Normalise a phone number to WhatsApp format: "whatsapp:+XXXXXXXXXXX"
 * Strips spaces, dashes, and ensures the + prefix.
 */
function toWhatsAppNumber(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  const withPlus = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  return `whatsapp:${withPlus}`;
}

/**
 * Send a WhatsApp message via Twilio REST API.
 *
 * In development (when env vars are missing) this logs to console.
 * In production, set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and
 * TWILIO_WHATSAPP_FROM in your Convex environment.
 */
export async function sendWhatsApp(
  options: WhatsAppMessageOptions
): Promise<WhatsAppSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

  // Placeholder mode when credentials are not configured
  if (!accountSid || !authToken || !fromNumber) {
    console.log("=== WHATSAPP SENT (placeholder) ===");
    console.log("To:", options.to);
    console.log("Body:", options.body);
    console.log("===================================");
    return {
      success: true,
      messageId: `wa-placeholder-${Date.now()}`,
    };
  }

  // Production: call Twilio Messages API
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const params = new URLSearchParams({
    From: toWhatsAppNumber(fromNumber),
    To: toWhatsAppNumber(options.to),
    Body: options.body,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Twilio WhatsApp error:", data);
      return {
        success: false,
        error: data.message || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      messageId: data.sid,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("WhatsApp send failed:", message);
    return {
      success: false,
      error: message,
    };
  }
}
