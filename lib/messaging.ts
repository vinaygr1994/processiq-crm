import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Channel } from "./types";

export interface WaTemplate { name: string; lang: string; params: string[] }
export const e164 = (raw: string) => {
  const d = raw.replace(/[^\d+]/g, "");
  if (!d) return "";
  return d.startsWith("+") ? d : d.length === 10 ? `+1${d}` : `+${d}`;
};
export const last10 = (raw: string) => raw.replace(/\D/g, "").slice(-10);

export const channelStatus = () => ({
  sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM),
  whatsapp: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
  smsInbound: !!process.env.TWILIO_AUTH_TOKEN,
  whatsappInbound: !!(process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_APP_SECRET),
});

type Out = { ok: boolean; id?: string; error?: string; skipped?: boolean };

async function twilioSms(to: string, body: string): Promise<Out> {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return { ok: false, skipped: true, error: "SMS isn't connected yet. Add the Twilio keys in Vercel." };
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  const j = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  return res.ok ? { ok: true, id: j.sid } : { ok: false, error: j.message || `Twilio error ${res.status}` };
}

async function metaWhatsapp(to: string, body: string, tpl?: WaTemplate): Promise<Out> {
  const token = process.env.WHATSAPP_TOKEN, phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { ok: false, skipped: true, error: "WhatsApp isn't connected yet. Add the WhatsApp keys in Vercel." };
  const payload = tpl
    ? { messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "template", template: { name: tpl.name, language: { code: tpl.lang || "en" }, ...(tpl.params.length ? { components: [{ type: "body", parameters: tpl.params.map((text) => ({ type: "text", text })) }] } : {}) } }
    : { messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "text", text: { body } };
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const j = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
  if (res.ok) return { ok: true, id: j.messages?.[0]?.id };
  const code = j.error?.code;
  const hint = code === 131047 ? "More than 24 hours since their last message. Send an approved template instead." : code === 132001 ? "That template name or language doesn't exist or isn't approved yet." : j.error?.message || `WhatsApp error ${res.status}`;
  return { ok: false, error: hint };
}

/** Sends one SMS or WhatsApp message and records it in the messages table. */
export async function sendMessage(o: { sb: SupabaseClient; ownerId?: string; channel: Channel; to: string; body: string; contactId?: string | null; template?: WaTemplate }) {
  const to = e164(o.to);
  if (!to || to.replace(/\D/g, "").length < 8) return { ok: false, error: "No valid phone number." };
  const r = o.channel === "sms" ? await twilioSms(to, o.body) : await metaWhatsapp(to, o.body, o.template);
  const row = {
    ...(o.ownerId ? { owner_id: o.ownerId } : {}), contact_id: o.contactId ?? null, channel: o.channel, direction: "out", phone: to,
    body: o.template ? o.body || `Template: ${o.template.name}` : o.body, template: o.template?.name ?? "", status: r.ok ? "sent" : r.skipped ? "skipped" : "failed", error: r.ok ? "" : r.error ?? "", provider_id: r.id ?? "", read: true,
  };
  await o.sb.from("messages").insert(row);
  return r;
}

const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
/** Twilio signs each webhook: HMAC-SHA1 of the URL plus every form field in name order. */
export function twilioSigned(url: string, params: Record<string, string>, sig: string) {
  const token = process.env.TWILIO_AUTH_TOKEN; if (!token || !sig) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return safeEq(createHmac("sha1", token).update(data).digest("base64"), sig);
}
/** Meta signs the raw body with the app secret. */
export function metaSigned(raw: string, sig: string) {
  const secret = process.env.WHATSAPP_APP_SECRET; if (!secret || !sig) return false;
  return safeEq("sha256=" + createHmac("sha256", secret).update(raw).digest("hex"), sig);
}

/** Works out which workspace an inbound message belongs to and saves it. */
export async function recordInbound(svc: SupabaseClient, o: { channel: Channel; from: string; body: string; providerId: string }) {
  const phone = e164(o.from), tail = last10(o.from);
  if (o.providerId) { const { data: dup } = await svc.from("messages").select("id").eq("provider_id", o.providerId).limit(1); if (dup?.length) return; }
  // Prefer the workspace that last messaged this number, then any workspace that has it as a contact.
  const { data: prior } = await svc.from("messages").select("owner_id,contact_id").like("phone", `%${tail}`).order("created_at", { ascending: false }).limit(1);
  let owner = prior?.[0]?.owner_id as string | undefined, contactId = (prior?.[0]?.contact_id as string | null) ?? null;
  if (!contactId) {
    let q = svc.from("contacts").select("id,owner_id,phone").like("phone", `%${tail.slice(-4)}`).limit(200);
    if (owner) q = q.eq("owner_id", owner);
    const { data: cs } = await q;
    const hit = (cs ?? []).find((c) => last10(c.phone as string) === tail);
    if (hit) { contactId = hit.id as string; owner = owner ?? (hit.owner_id as string); }
  }
  if (!owner) { const { data: st } = await svc.from("settings").select("owner_id").order("created_at").limit(1); owner = st?.[0]?.owner_id as string | undefined; }
  if (!owner) return;
  await svc.from("messages").insert({ owner_id: owner, contact_id: contactId, channel: o.channel, direction: "in", phone, body: o.body, status: "received", provider_id: o.providerId, read: false });
  if (contactId && o.channel === "sms" && /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i.test(o.body)) await svc.from("contacts").update({ sms_opt_out: true }).eq("id", contactId);
  if (contactId && o.channel === "sms" && /^\s*(start|unstop|yes)\s*$/i.test(o.body)) await svc.from("contacts").update({ sms_opt_out: false }).eq("id", contactId);
}
