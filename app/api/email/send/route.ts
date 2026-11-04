import { authed, appUrl, json } from "@/lib/server";
import { isDemo } from "@/lib/config";
import { isEmail } from "@/lib/format";
import { sendMail } from "@/lib/mail";

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
  const r = await sendMail({ sb: a.sb, to, subject, body: text, contactId: p.contactId, marketing: p.marketing, baseUrl: appUrl(req) });
  return r.ok ? json({ status: "sent" }) : json({ error: r.error }, r.code);
}
