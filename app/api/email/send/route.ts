import { authed, appUrl, esc, json, signId } from "@/lib/server";
import { isDemo } from "@/lib/config";
import { isEmail } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Body { to?: string; subject?: string; body?: string; contactId?: string; marketing?: boolean }

export async function POST(req: Request) {
  const p = (await req.json().catch(() => ({}))) as Body;
  const to = (p.to ?? "").trim(), subject = (p.subject ?? "").trim(), text = p.body ?? "";
  if (!isEmail(to)) return json({ error: "That email address doesn't look right." }, 400);
  if (!subject || !text.trim()) return json({ error: "Subject and message are required." }, 400);
  if (subject.length > 300 || text.length > 50_000) return json({ error: "That email is too long." }, 400);

  // Demo mode never sends real email, so a public demo can't be abused.
  if (isDemo) return json({ status: "demo" });

  const a = await authed(req);
  if (!a) return json({ error: "Please log in again." }, 401);
  const key = process.env.RESEND_API_KEY, fromAddr = process.env.RESEND_FROM_EMAIL;
  if (!key || !fromAddr) return json({ error: "Email sending isn't set up yet. Add your Resend key in Settings → Email." }, 400);

  // Only email people who are in this user's own CRM.
  if (!p.contactId) return json({ error: "Choose a contact to email." }, 400);
  const { data: contact } = await a.sb.from("contacts").select("id,email,unsubscribed").eq("id", p.contactId).maybeSingle();
  if (!contact || contact.email.toLowerCase() !== to.toLowerCase()) return json({ error: "That contact wasn't found." }, 404);
  if (p.marketing && contact.unsubscribed) return json({ error: "This contact has unsubscribed." }, 400);

  const { data: s } = await a.sb.from("settings").select("*").limit(1).maybeSingle();
  const name = (s?.sender_name || s?.business_name || "").replace(/["<>\r\n]/g, "").trim();
  const from = name ? `${name} <${fromAddr}>` : fromAddr;

  let plain = text;
  let html = `<div style="font:15px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#222">${esc(text).replace(/\n/g, "<br>")}</div>`;
  const headers: Record<string, string> = {};
  if (p.marketing) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Campaigns need the unsubscribe setup (SUPABASE_SERVICE_ROLE_KEY). See Settings → Email." }, 400);
    if (!s?.address?.trim() || !s?.business_name?.trim()) return json({ error: "Add your business name and mailing address in Settings first." }, 400);
    const url = `${appUrl(req)}/api/unsubscribe?c=${contact.id}&s=${signId(contact.id)}`;
    plain += `\n\n--\n${s.business_name}, ${s.address}\nUnsubscribe: ${url}`;
    html += `<hr style="border:0;border-top:1px solid #e4e8f0;margin:28px 0 14px"><div style="font:12.5px/1.5 Arial,sans-serif;color:#6b7690">${esc(s.business_name)} · ${esc(s.address)}<br><a href="${url}" style="color:#6b7690">Unsubscribe</a></div>`;
    headers["List-Unsubscribe"] = `<${url}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text: plain, html, headers, ...(s?.reply_to ? { reply_to: s.reply_to } : {}) }),
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { message?: string };
    return json({ error: e.message || `The email service rejected this message (${res.status}).` }, 502);
  }
  return json({ status: "sent" });
}
