import { timingSafeEqual } from "node:crypto";
import { appUrl, json, serviceClient } from "@/lib/server";
import { runEngine } from "@/lib/engine/engine";
import { supaDb } from "@/lib/engine/supadb";
import { serverPort } from "@/lib/enginePort";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ok = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Called every minute by the database scheduler. Runs every user's due automations, even when nobody is logged in. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || !given || !ok(given, secret)) return json({ error: "Not allowed." }, 401);
  const sb = serviceClient();
  if (!sb) return json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, 500);
  const { data, error } = await sb.from("workflows").select("owner_id").eq("active", true);
  if (error) return json({ error: error.message }, 500);
  const owners = [...new Set((data ?? []).map((r: { owner_id: string }) => r.owner_id))];
  const base = appUrl(req);
  const out: Record<string, unknown> = {};
  const started = Date.now();
  for (const id of owners) {
    if (Date.now() - started > 50_000) break;
    try { out[id] = await runEngine(supaDb(sb, id), serverPort(sb, base, id)); } catch (e) { out[id] = { error: (e as Error).message }; }
  }
  return json({ owners: owners.length, out });
}
