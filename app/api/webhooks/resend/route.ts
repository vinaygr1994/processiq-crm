import { createHmac, timingSafeEqual } from "node:crypto";
import { json, serviceClient } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Resend webhook: hard bounces and spam complaints suppress the address automatically.
 * In Resend → Webhooks, add https://<your CRM>/api/webhooks/resend with the events
 * email.bounced and email.complained, then put its signing secret in Vercel as RESEND_WEBHOOK_SECRET.
 */
function verified(body: string, h: Headers) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = h.get("svix-id"), ts = h.get("svix-timestamp"), sigs = h.get("svix-signature");
  if (!secret || !id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay protection
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  return sigs.split(" ").some((part) => {
    const [, sig] = part.split(",");
    if (!sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

interface Event { type?: string; data?: { to?: string[] | string; bounce?: { type?: string; message?: string } } }

export async function POST(req: Request) {
  const body = await req.text();
  if (!verified(body, req.headers)) return json({ error: "Invalid signature" }, 401);
  let ev: Event;
  try { ev = JSON.parse(body) as Event; } catch { return json({ error: "Bad JSON" }, 400); }

  const complaint = ev.type === "email.complained";
  const bounce = ev.type === "email.bounced";
  // Soft (temporary) bounces, like a full mailbox, aren't suppressed.
  if (!complaint && !(bounce && !/transient|temporary|soft/i.test(ev.data?.bounce?.type ?? ""))) return json({ ok: true, ignored: true });

  const sb = serviceClient();
  if (!sb) return json({ error: "Service key missing" }, 500);
  const to = (Array.isArray(ev.data?.to) ? ev.data!.to : [ev.data?.to ?? ""]).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  const status = complaint ? "complaint" : "bounced";
  const reason = complaint ? "Marked an email as spam" : `Hard bounce${ev.data?.bounce?.message ? `: ${ev.data.bounce.message.slice(0, 200)}` : ""}`;
  let updated = 0;
  for (const email of to) {
    const { data: rows } = await sb.from("contacts").select("id,owner_id").ilike("email", email.replace(/[%_\\]/g, "\\$&"));
    for (const c of rows ?? []) {
      let { error } = await sb.from("contacts").update({ unsubscribed: true, email_status: status, unsub_reason: reason, unsub_at: new Date().toISOString() }).eq("id", c.id);
      if (error && /column/i.test(error.message)) ({ error } = await sb.from("contacts").update({ unsubscribed: true }).eq("id", c.id));
      if (!error) updated++;
      // Already on the list is fine: the unique index rejects the duplicate.
      await sb.from("suppressions").insert({ owner_id: c.owner_id, email, reason }).then(() => {}, () => {});
    }
  }
  return json({ ok: true, updated });
}
