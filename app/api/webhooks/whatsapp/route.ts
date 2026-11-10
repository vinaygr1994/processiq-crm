import { serviceClient } from "@/lib/server";
import { metaSigned, recordInbound } from "@/lib/messaging";

/** Meta checks this once when you save the webhook. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const want = process.env.WHATSAPP_VERIFY_TOKEN;
  if (want && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === want) return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Forbidden", { status: 403 });
}

interface WaValue { messages?: { id: string; from: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string }; list_reply?: { title: string } } }[]; statuses?: { id: string; status: string; errors?: { title?: string }[] }[] }

/** Inbound WhatsApp messages and delivery receipts. */
export async function POST(req: Request) {
  const raw = await req.text();
  const svc = serviceClient();
  if (!svc) return new Response("Not configured", { status: 400 });
  if (!metaSigned(raw, req.headers.get("x-hub-signature-256") ?? "")) return new Response("Forbidden", { status: 403 });
  let body: { entry?: { changes?: { value?: WaValue }[] }[] };
  try { body = JSON.parse(raw); } catch { return new Response("Bad request", { status: 400 }); }
  for (const e of body.entry ?? []) for (const c of e.changes ?? []) {
    const v = c.value ?? {};
    for (const m of v.messages ?? []) {
      const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? `[${m.type} message]`;
      await recordInbound(svc, { channel: "whatsapp", from: m.from, body: text, providerId: m.id });
    }
    for (const s of v.statuses ?? []) {
      if (s.status === "delivered" || s.status === "read") await svc.from("messages").update({ status: "delivered" }).eq("provider_id", s.id);
      else if (s.status === "failed") await svc.from("messages").update({ status: "failed", error: s.errors?.[0]?.title ?? "Not delivered" }).eq("provider_id", s.id);
    }
  }
  return new Response("ok");
}
