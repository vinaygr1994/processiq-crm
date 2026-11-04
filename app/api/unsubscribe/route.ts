import { esc, serviceClient, verifyId } from "@/lib/server";

export const dynamic = "force-dynamic";

async function run(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("c") ?? "", sig = u.searchParams.get("s") ?? "";
  if (!id || !verifyId(id, sig)) return { ok: false, msg: "This unsubscribe link isn't valid." };
  const sb = serviceClient();
  if (!sb) return { ok: false, msg: "Unsubscribe isn't available right now." };
  const { error } = await sb.from("contacts").update({ unsubscribed: true }).eq("id", id);
  return error ? { ok: false, msg: "Something went wrong. Please try again." } : { ok: true, msg: "You've been unsubscribed and won't receive marketing emails from this sender." };
}

const page = (msg: string, ok: boolean) =>
  new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#f4f6fb;font:16px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#33405a">
<div style="max-width:420px;margin:24px;background:#fff;border:1px solid #e4e8f0;border-radius:24px;padding:36px;text-align:center">
<div style="font-size:40px">${ok ? "✅" : "⚠️"}</div><h1 style="font-size:22px;color:#111a2e;margin:8px 0">${ok ? "Unsubscribed" : "Hmm"}</h1><p>${esc(msg)}</p></div></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

export async function GET(req: Request) { const r = await run(req); return page(r.msg, r.ok); }
export async function POST(req: Request) { const r = await run(req); return page(r.msg, r.ok); }
