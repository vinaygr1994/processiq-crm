import type { SendResult } from "./engine/engine";

/** Sends a text (or WhatsApp message) through Twilio. Returns "skipped" until Twilio keys are added. */
export async function sendSms(to: string, body: string, opts: { whatsapp?: boolean } = {}): Promise<{ status: SendResult; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  const from = opts.whatsapp ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_FROM;
  if (!sid || !token || !from) return { status: "skipped" };
  const digits = to.replace(/[^\d+]/g, "");
  const num = digits.startsWith("+") ? digits : digits.length === 10 ? `+1${digits}` : `+${digits}`;
  const form = new URLSearchParams({ To: opts.whatsapp ? `whatsapp:${num}` : num, From: from, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: form,
  });
  if (!res.ok) { const e = (await res.json().catch(() => ({}))) as { message?: string }; return { status: "failed", error: e.message || `Twilio error ${res.status}` }; }
  return { status: "sent" };
}
