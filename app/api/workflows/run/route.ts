import { authed, appUrl, json, serviceClient } from "@/lib/server";
import { runEngine } from "@/lib/engine/engine";
import { supaDb } from "@/lib/engine/supadb";
import { serverPort } from "@/lib/enginePort";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The app calls this right after something happens so automations react instantly. */
export async function POST(req: Request) {
  const a = await authed(req);
  if (!a) return json({ error: "Please log in again." }, 401);
  // Run as the workspace (like the scheduler does), so the per-workspace lock applies and two passes never overlap.
  const svc = serviceClient();
  const { data: org } = svc ? await a.sb.rpc("crm_org") : { data: null };
  const sum = svc && typeof org === "string"
    ? await runEngine(supaDb(svc, org), serverPort(svc, appUrl(req), org))
    : await runEngine(supaDb(a.sb), serverPort(a.sb, appUrl(req)));
  return json(sum);
}
