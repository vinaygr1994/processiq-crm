import { authed, appUrl, json } from "@/lib/server";
import { isDemo } from "@/lib/config";
import { isEmail } from "@/lib/format";
import { sendMail } from "@/lib/mail";
import { sanitizeDesign } from "@/lib/emailDesign";

export const dynamic = "force-dynamic";

interface Body { to?: string; subject?: string; body?: string; contactId?: string; marketing?: boolean; design?: unknown; test?: boolean; trackId?: string; vars?: Record<string, unknown> }
/** Merge values for a test ("preview as" a contact): short strings only. */
const cleanVars = (v: unknown) => v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 20).filter(([k, x]) => /^[a-z_]{1,30}$/.test(k) && typeof x === "string").map(([k, x]) => [k, (x as string).slice(0, 300)])) : undefined;

export async function POST(req: Request) {
  const p = (await req.json().catch(() => ({}))) as Body;
  const to = (p.to ?? "").trim(), subject = (p.subject ?? "").trim(), text = p.body ?? "";
  if (!isEmail(to)) return json({ error: "That email address doesn't look right." }, 400);
  const design = p.design ? sanitizeDesign(p.design) : null;
  if (p.design && !design) return json({ error: "That email design isn't valid." }, 400);
  if (!subject || (!design && !text.trim()) || (design && design.blocks.length === 0)) return json({ error: "Subject and message are required." }, 400);
  if (subject.length > 300 || text.length > 50_000) return json({ error: "That email is too long." }, 400);
  // Demo mode never sends real email, so a public demo can't be abused.
  if (isDemo) return json({ status: "demo" });
  const a = await authed(req);
  if (!a) return json({ error: "Please log in again." }, 401);
  if (p.test && to.toLowerCase() !== (a.user.email ?? "").toLowerCase()) return json({ error: "Test emails can only be sent to your own login email." }, 400);
  const r = await sendMail({ sb: a.sb, to, subject, body: text, design: design ?? undefined, test: !!p.test, vars: p.test ? cleanVars(p.vars) : undefined, contactId: p.contactId, marketing: p.marketing && !p.test, baseUrl: appUrl(req), trackId: p.trackId && /^[0-9a-f-]{36}$/i.test(p.trackId) ? p.trackId : undefined });
  return r.ok ? json({ status: "sent" }) : json({ error: r.error }, r.code);
}
