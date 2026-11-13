import { esc, serviceClient, verifyId } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Unsubscribe links in marketing emails.
 * - Email apps' one-click button (RFC 8058) POSTs "List-Unsubscribe=One-Click": unsubscribe straight away.
 * - A person clicking the link gets a page first, so link scanners that open every URL can't unsubscribe people.
 *   They can tell us why, or choose fewer emails instead.
 */
const REASONS = ["I get too many emails", "The emails aren't relevant to me", "I never signed up for these", "I'm no longer interested", "Other"];

type Outcome = { ok: boolean; title: string; msg: string };

async function apply(id: string, action: "unsub" | "less", reason: string): Promise<Outcome> {
  const sb = serviceClient();
  if (!sb) return { ok: false, title: "Hmm", msg: "Unsubscribe isn't available right now. Please reply to the email and ask to be removed." };
  const now = new Date().toISOString();
  if (action === "less") {
    const { data } = await sb.from("contacts").select("tags").eq("id", id).maybeSingle();
    const tags = Array.from(new Set([...(((data?.tags as string[] | undefined) ?? [])), "fewer-emails"]));
    const { error } = await sb.from("contacts").update({ tags }).eq("id", id);
    return error ? { ok: false, title: "Hmm", msg: "Something went wrong. Please try again." } : { ok: true, title: "Got it", msg: "You'll hear from us less often. You can still unsubscribe completely using the link in any email." };
  }
  let { error } = await sb.from("contacts").update({ unsubscribed: true, email_status: "unsubscribed", unsub_reason: reason.slice(0, 300), unsub_at: now }).eq("id", id);
  // Before migration 016 the status columns don't exist yet: fall back to the flag alone.
  if (error && /column/i.test(error.message)) ({ error } = await sb.from("contacts").update({ unsubscribed: true }).eq("id", id));
  if (error) return { ok: false, title: "Hmm", msg: "Something went wrong. Please try again." };
  return { ok: true, title: "You're unsubscribed", msg: "You won't receive marketing emails from this sender any more." };
}

const shell = (body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Email preferences</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#f4f6fb;font:16px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#33405a}
.card{max-width:460px;margin:24px;background:#fff;border:1px solid #e4e8f0;border-radius:20px;padding:32px}h1{font-size:22px;color:#111a2e;margin:0 0 8px}
label{display:flex;gap:10px;align-items:flex-start;padding:8px 0;cursor:pointer}input[type=radio]{margin-top:5px;accent-color:#0b8a8a}
textarea{width:100%;box-sizing:border-box;border:1px solid #d6dce8;border-radius:10px;padding:10px;font:inherit;min-height:70px;margin-top:6px}
.btn{display:block;width:100%;border:0;border-radius:10px;padding:13px;font:600 15px/1 inherit;cursor:pointer;margin-top:14px;background:#111a2e;color:#fff}
.alt{background:#fff;color:#0b6f6f;border:1px solid #cfe7e7}.small{font-size:13px;color:#6b7690}</style>
<body><div class="card">${body}</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
const done = (o: Outcome) => shell(`<h1>${esc(o.title)}</h1><p>${esc(o.msg)}</p>`, o.ok ? 200 : 400);

function link(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("c") ?? "", sig = u.searchParams.get("s") ?? "";
  return { id, sig, valid: !!id && verifyId(id, sig) };
}

export async function GET(req: Request) {
  const { id, sig, valid } = link(req);
  if (!valid) return done({ ok: false, title: "Hmm", msg: "This unsubscribe link isn't valid. Please reply to the email and ask to be removed." });
  const q = `c=${encodeURIComponent(id)}&amp;s=${encodeURIComponent(sig)}`;
  return shell(`<h1>Unsubscribe from marketing emails?</h1>
<form method="post" action="/api/unsubscribe?${q}">
<p class="small">Help us improve by telling us why (optional):</p>
${REASONS.map((r) => `<label><input type="radio" name="reason" value="${esc(r)}">${esc(r)}</label>`).join("")}
<textarea name="note" placeholder="Anything else? (optional)" maxlength="250"></textarea>
<button class="btn" name="action" value="unsub">Unsubscribe</button>
<button class="btn alt" name="action" value="less">Just send me fewer emails</button>
</form>`);
}

export async function POST(req: Request) {
  const { id, valid } = link(req);
  if (!valid) return done({ ok: false, title: "Hmm", msg: "This unsubscribe link isn't valid." });
  const form = await req.formData().catch(() => null);
  // One-click from the email app's own unsubscribe button.
  if (form?.get("List-Unsubscribe") === "One-Click") { const r = await apply(id, "unsub", "One-click unsubscribe (email app)"); return new Response(r.ok ? "Unsubscribed" : "Error", { status: r.ok ? 200 : 400 }); }
  const action = form?.get("action");
  const reason = [String(form?.get("reason") ?? ""), String(form?.get("note") ?? "").trim()].filter(Boolean).join(": ");
  return done(await apply(id, action === "less" ? "less" : "unsub", reason || "No reason given"));
}
