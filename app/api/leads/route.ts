import { appUrl, serviceClient } from "@/lib/server";
import { normalizeLead } from "@/lib/leads";
import { runEngine } from "@/lib/engine/engine";
import { supaDb } from "@/lib/engine/supadb";
import { serverPort } from "@/lib/enginePort";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Intake-Key" };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...cors, "Cache-Control": "no-store" } });
export const OPTIONS = () => new Response(null, { status: 204, headers: cors });

const digits = (s: string) => s.replace(/\D/g, "");

/** Public lead intake. Accepts JSON or form posts from forms, Google Ads lead-form webhooks, Zapier/Make and similar. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("form")) body = Object.fromEntries((await req.formData()).entries());
    else body = await req.json();
  } catch { return reply({ error: "Send JSON or a form post." }, 400); }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return reply({ error: "Send a JSON object." }, 400);

  const key = (req.headers.get("x-intake-key") || url.searchParams.get("key") || String(body.key ?? body.google_key ?? "")).trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) return reply({ error: "Missing or invalid intake key." }, 401);
  // Bots fill hidden fields. Pretend it worked.
  if (String(body.website ?? body.company_website ?? "").trim()) return reply({ ok: true });

  const lead = normalizeLead(body, url.searchParams.get("source") || "Website form");
  if ("error" in lead) return reply({ error: lead.error }, 400);

  const sb = serviceClient();
  if (!sb) return reply({ error: "Lead intake isn't switched on yet (SUPABASE_SERVICE_ROLE_KEY is missing)." }, 503);
  const { data: st } = await sb.from("settings").select("owner_id").eq("intake_key", key).maybeSingle();
  if (!st) return reply({ error: "Missing or invalid intake key." }, 401);
  const owner = (st as { owner_id: string }).owner_id;

  // Re-use an existing contact with the same email or phone.
  const ph = digits(lead.phone);
  const { data: existing } = await sb.from("contacts").select("id,name,email,phone").eq("owner_id", owner);
  const found = ((existing ?? []) as { id: string; name: string; email: string; phone: string }[]).find((c) => (lead.email && c.email.toLowerCase() === lead.email) || (ph.length >= 7 && digits(c.phone) === ph));
  let contactId = found?.id;
  const contactName = found?.name ?? lead.name;
  if (!contactId) {
    const { data: c, error } = await sb.from("contacts").insert({ owner_id: owner, name: lead.name, email: lead.email, phone: lead.phone, company: "", tags: ["homeowner"], source: lead.source, unsubscribed: false }).select("id").single();
    if (error || !c) return reply({ error: "Couldn't save that lead." }, 500);
    contactId = (c as { id: string }).id;
  }
  const { data: deal, error: de } = await sb.from("deals").insert({
    owner_id: owner, title: `${lead.project} · ${contactName}`, value: 0, stage: "new", contact_id: contactId, source: lead.source, project: lead.project, budget: lead.budget, address: lead.address, rep: "", lost_reason: "",
  }).select("id").single();
  if (de || !deal) return reply({ error: "Couldn't save that lead." }, 500);
  const dealId = (deal as { id: string }).id;
  if (lead.note) await sb.from("activities").insert({ owner_id: owner, contact_id: contactId, kind: "note", body: lead.note });
  await sb.from("autolog").insert({ owner_id: owner, deal_id: dealId, kind: "Lead", message: `New lead from ${lead.source}: ${contactName}, ${lead.project}${found ? " · linked to existing contact" : ""}`, tone: "info", key: "" });

  // Fire the workflows now (assign, instant reply, call task) instead of waiting for the next scheduler tick.
  try { await runEngine(supaDb(sb, owner), serverPort(sb, appUrl(req), owner)); } catch { /* the scheduler will pick it up */ }
  return reply({ ok: true, id: dealId });
}
