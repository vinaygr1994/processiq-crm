import { appUrl, serviceClient } from "@/lib/server";
import { handleSubmission, readConfig, validate } from "@/lib/forms";
import { runEngine } from "@/lib/engine/engine";
import { supaDb } from "@/lib/engine/supadb";
import { serverPort } from "@/lib/enginePort";
import type { FormDef } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { ...cors, "Cache-Control": "no-store" } });
export const OPTIONS = () => new Response(null, { status: 204, headers: cors });

async function load(slug: string) {
  const sb = serviceClient();
  if (!sb || !/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const { data } = await sb.from("forms").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!data) return null;
  const form = data as FormDef & { owner_id: string };
  const { data: st } = await sb.from("settings").select("business_name").eq("owner_id", form.owner_id).maybeSingle();
  return { sb, form, business: (st as { business_name?: string } | null)?.business_name ?? "" };
}

/** Public: the published form's design (nothing private). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const r = await load((await params).slug);
  if (!r) return reply({ error: "This form isn't available." }, 404);
  return reply({ name: r.form.name, config: readConfig(r.form), business: r.business });
}

/** Public: a submission. Creates or updates the contact, then fires journeys and workflows. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const r = await load((await params).slug);
  if (!r) return reply({ error: "This form isn't available." }, 404);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Something went wrong. Please try again." }, 400); }
  if (!body || typeof body !== "object") return reply({ error: "Something went wrong. Please try again." }, 400);
  // Bots fill hidden fields or submit instantly. Pretend it worked.
  if (String(body.website ?? "").trim() || Number(body.elapsed ?? 99999) < 1500) return reply({ ok: true });
  const cfg = readConfig(r.form);
  const v = validate(cfg, body);
  if ("error" in v) return reply({ error: v.error }, 400);
  const owner = r.form.owner_id, db = supaDb(r.sb, owner), port = serverPort(r.sb, appUrl(req), owner);
  try {
    const out = await handleSubmission(db, r.form, v.values, v.consent);
    const owner_email = ((await r.sb.from("settings").select("owner_email").eq("owner_id", owner).maybeSingle()).data as { owner_email?: string } | null)?.owner_email;
    if (cfg.notify && owner_email) {
      const lines = cfg.fields.filter((f) => v.values[f.id]).map((f) => `${f.label}: ${v.values[f.id]}`).join("\n");
      await port.email({ to: owner_email, subject: `New submission: ${r.form.name}`, body: `Someone just filled in “${r.form.name}”.\n\n${lines}\n\nOpen your CRM to follow up.` }).catch(() => {});
    }
    try { await runEngine(db, port); } catch { /* the scheduler picks it up */ }
    return reply({ ok: true, id: out.contactId });
  } catch { return reply({ error: "We couldn't save that. Please try again." }, 500); }
}
