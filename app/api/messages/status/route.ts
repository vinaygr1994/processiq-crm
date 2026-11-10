import { appUrl, authed, json } from "@/lib/server";
import { channelStatus } from "@/lib/messaging";

export async function POST(req: Request) {
  const a = await authed(req);
  if (!a) return json({ error: "Please sign in again." }, 401);
  const base = appUrl(req);
  return json({ ...channelStatus(), twilioWebhook: `${base}/api/webhooks/twilio`, whatsappWebhook: `${base}/api/webhooks/whatsapp` });
}
