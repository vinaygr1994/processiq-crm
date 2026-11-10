import { authed, json } from "@/lib/server";
import { channelStatus, sendMessage, type WaTemplate } from "@/lib/messaging";
import { fill } from "@/lib/format";
import type { Channel, Contact } from "@/lib/types";

export const maxDuration = 60;
const MAX = 500;

/** Sends an SMS or WhatsApp message to one or many contacts. Row-level security decides which contacts the caller can reach. */
export async function POST(req: Request) {
  const a = await authed(req);
  if (!a) return json({ error: "Please sign in again." }, 401);
  const b = (await req.json().catch(() => ({}))) as { channel?: Channel; contactIds?: string[]; body?: string; template?: WaTemplate };
  const channel = b.channel === "whatsapp" ? "whatsapp" : "sms";
  const ids = [...new Set(b.contactIds ?? [])].slice(0, MAX);
  const body = (b.body ?? "").trim();
  const tpl = channel === "whatsapp" && b.template?.name?.trim() ? { name: b.template.name.trim(), lang: (b.template.lang || "en").trim(), params: (b.template.params ?? []).map(String) } : undefined;
  if (!ids.length) return json({ error: "Choose at least one contact." }, 400);
  if (!body && !tpl) return json({ error: "Write a message first." }, 400);
  if (body.length > 1600) return json({ error: "Messages can be up to 1,600 characters." }, 400);
  const st = channelStatus();
  if (!st[channel]) return json({ error: channel === "sms" ? "SMS isn't connected yet. Open Mobile Studio → Setup." : "WhatsApp isn't connected yet. Open Mobile Studio → Setup." }, 400);
  const { data: role } = await a.sb.rpc("crm_role");
  if (role === "viewer") return json({ error: "You have read-only access." }, 403);

  const { data, error } = await a.sb.from("contacts").select("id,name,company,phone,sms_opt_out").in("id", ids);
  if (error) return json({ error: error.message }, 400);
  const out = { sent: 0, failed: 0, skipped: 0, errors: [] as string[] };
  for (const c of (data ?? []) as Pick<Contact, "id" | "name" | "company" | "phone" | "sms_opt_out">[]) {
    if (!c.phone?.trim() || (channel === "sms" && c.sms_opt_out)) { out.skipped++; continue; }
    const r = await sendMessage({ sb: a.sb, channel, to: c.phone, contactId: c.id, body: fill(body, c), template: tpl ? { ...tpl, params: tpl.params.map((p) => fill(p, c)) } : undefined });
    if (r.ok) out.sent++; else { out.failed++; if (r.error && !out.errors.includes(r.error)) out.errors.push(r.error); }
  }
  return json(out);
}
