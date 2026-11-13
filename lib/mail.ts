import type { SupabaseClient } from "@supabase/supabase-js";
import { esc, signId } from "./server";
import { emailVars, renderDesign, type Design } from "./emailDesign";

export interface MailIn { sb: SupabaseClient; ownerId?: string; to: string; subject: string; body: string; contactId?: string; marketing?: boolean; toOwner?: boolean; baseUrl: string; design?: Design; test?: boolean;
  /** Extra merge values (journeys add job and visit details). */ vars?: Record<string, string>;
  /** The email log row id: turns on open and click tracking. */ trackId?: string;
  /** A system email to any address (team invites). Only server code sets this. */ system?: boolean }
export type MailOut = { ok: true } | { ok: false; code: number; error: string };

/** Sends one email through Resend as the business. Used by the app, the workflow engine and the scheduler. */
export async function sendMail(o: MailIn): Promise<MailOut> {
  const key = process.env.RESEND_API_KEY, fromAddr = process.env.RESEND_FROM_EMAIL;
  if (!key || !fromAddr) return { ok: false, code: 400, error: "Email sending isn't set up yet. Add your Resend key in Vercel settings." };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope = (q: any) => (o.ownerId ? q.eq("owner_id", o.ownerId) : q);

  const { data: s } = (await scope(o.sb.from("settings").select("*")).limit(1).maybeSingle()) as { data: Record<string, string> | null };
  type C = { id: string; email: string; unsubscribed: boolean; name: string; company: string; email_status?: string };
  let contact = null as C | null;
  if (o.test || o.system) {
    // A test goes only to the logged-in user (the route checks the address).
  } else if (o.toOwner) {
    if (!s?.owner_email || s.owner_email.toLowerCase() !== o.to.toLowerCase()) return { ok: false, code: 400, error: "Owner alert email isn't set in Settings." };
  } else {
    if (!o.contactId) return { ok: false, code: 400, error: "Choose a contact to email." };
    const r = (await scope(o.sb.from("contacts").select("*").eq("id", o.contactId)).maybeSingle()) as { data: C | null };
    contact = r.data;
    if (!contact || contact.email.toLowerCase() !== o.to.toLowerCase()) return { ok: false, code: 404, error: "That contact wasn't found." };
    if (o.marketing && contact.unsubscribed) return { ok: false, code: 400, error: "This contact has unsubscribed." };
    // A hard bounce or spam complaint stops every email, not just marketing, to protect your sender reputation.
    if (contact.email_status === "bounced" || contact.email_status === "complaint") return { ok: false, code: 400, error: contact.email_status === "bounced" ? "This address bounced. Fix the email address to send again." : "This person marked an email as spam." };
    if (o.marketing) {
      const sup = await scope(o.sb.from("suppressions").select("id").ilike("email", contact.email.replace(/[%_\\]/g, "\\$&"))).limit(1);
      if (!sup.error && sup.data?.length) return { ok: false, code: 400, error: "This address is on your suppression list." };
    }
  }

  const name = (s?.sender_name || s?.business_name || "").replace(/["<>\r\n]/g, "").trim();
  const from = name ? `${name} <${fromAddr}>` : fromAddr;
  const subject = o.test ? `[Test] ${o.subject}` : o.subject;
  const headers: Record<string, string> = {};
  const unsubUrl = o.marketing && contact ? `${o.baseUrl}/api/unsubscribe?c=${contact.id}&s=${signId(contact.id)}` : "";
  if (o.marketing && contact) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, code: 400, error: "Campaigns need the unsubscribe setup (SUPABASE_SERVICE_ROLE_KEY)." };
    if (!s?.address?.trim() || !s?.business_name?.trim()) return { ok: false, code: 400, error: "Add your business name and mailing address in Settings first." };
    headers["List-Unsubscribe"] = `<${unsubUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  let plain = o.body;
  let html: string;
  if (o.design) {
    const r = renderDesign(o.design, { ...emailVars(contact ?? { name: "Sarah Collins", company: "Collins Family" }, s as never), ...(o.vars ?? {}) }, { business: s?.business_name, address: s?.address, unsubscribeUrl: unsubUrl || undefined, assetBase: o.baseUrl });
    html = r.html; plain = r.text;
  } else {
    html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#222">${esc(o.body).replace(/\n/g, "<br>")}</div>`;
    if (unsubUrl) {
      plain += `\n\n--\n${s?.business_name}, ${s?.address}\nUnsubscribe: ${unsubUrl}`;
      html += `<hr style="border:0;border-top:1px solid #e4e8f0;margin:28px 0 14px"><div style="font:12.5px/1.5 Arial,sans-serif;color:#6b7690">${esc(s?.business_name ?? "")} · ${esc(s?.address ?? "")}<br><a href="${unsubUrl}" style="color:#6b7690">Unsubscribe</a></div>`;
    }
  }
  if (o.trackId && !o.test && process.env.SUPABASE_SERVICE_ROLE_KEY) html = addTracking(html, o.trackId, o.baseUrl, unsubUrl);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [o.to], subject, text: plain, html, headers, ...(s?.reply_to ? { reply_to: s.reply_to } : {}) }),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, code: 502, error: explainResend(e.message ?? "", res.status, fromAddr) };
  }
  return { ok: true };
}

/** Adds an invisible open pixel and routes links through /api/t/c so opens and clicks are recorded. */
export function addTracking(html: string, id: string, base: string, skip = ""): string {
  const out = html.replace(/href="(https?:\/\/[^"]+)"/g, (m, raw: string) => {
    const u = raw.replace(/&amp;/g, "&");
    if (u === skip || u.startsWith(base + "/api/unsubscribe")) return m;
    return `href="${base}/api/t/c?e=${id}&amp;u=${encodeURIComponent(u)}&amp;s=${signId(`${id}|${u}`)}"`;
  });
  const pixel = `<img src="${base}/api/t/o?e=${id}&amp;s=${signId(id)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`;
  return out.includes("</body>") ? out.replace("</body>", `${pixel}</body>`) : out + pixel;
}

/** Turns Resend's error into a plain next step. */
function explainResend(msg: string, status: number, from: string): string {
  const domain = from.split("@")[1] ?? "your domain";
  if (/not verified|verify a domain/i.test(msg)) return `Resend hasn't verified ${domain} yet. In Resend → Domains, check every DNS record shows "Verified", then try again. (Resend said: ${msg})`;
  if (/only send testing emails|testing emails to your own/i.test(msg)) return `Your Resend account is still in test mode, so it can only email your Resend login address. Verify ${domain} in Resend → Domains to email anyone. (Resend said: ${msg})`;
  if (status === 401 || status === 403 || /api key/i.test(msg)) return `Resend rejected the API key. Create a new key in Resend → API Keys, paste it into Vercel as RESEND_API_KEY, then redeploy. (Resend said: ${msg})`;
  if (/from/i.test(msg) && /invalid/i.test(msg)) return `The sender address "${from}" isn't valid. Set RESEND_FROM_EMAIL in Vercel to an address on your verified domain, e.g. hello@${domain}, then redeploy. (Resend said: ${msg})`;
  return msg || `The email service rejected this message (${status}).`;
}
