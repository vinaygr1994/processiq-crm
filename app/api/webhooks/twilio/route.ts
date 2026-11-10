import { appUrl, serviceClient } from "@/lib/server";
import { recordInbound, twilioSigned } from "@/lib/messaging";

const xml = (status = 200) => new Response("<Response></Response>", { status, headers: { "Content-Type": "text/xml" } });

/** Twilio calls this for every inbound SMS and for delivery updates. */
export async function POST(req: Request) {
  const svc = serviceClient();
  const form = await req.formData().catch(() => null);
  if (!svc || !form) return xml(400);
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });
  const sig = req.headers.get("x-twilio-signature") ?? "";
  const here = `${appUrl(req)}/api/webhooks/twilio`;
  if (!twilioSigned(here, params, sig) && !twilioSigned(req.url, params, sig)) return xml(403);
  const sid = params.MessageSid || params.SmsSid || "";
  if (params.MessageStatus && !params.Body) {
    const s = params.MessageStatus;
    if (sid && ["delivered", "failed", "undelivered"].includes(s)) await svc.from("messages").update({ status: s === "delivered" ? "delivered" : "failed", error: s === "delivered" ? "" : params.ErrorMessage || `Not delivered (${params.ErrorCode || "carrier"})` }).eq("provider_id", sid);
    return xml();
  }
  if (params.From && params.Body !== undefined) await recordInbound(svc, { channel: "sms", from: params.From, body: params.Body, providerId: sid });
  return xml();
}
