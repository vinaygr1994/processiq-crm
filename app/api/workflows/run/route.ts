import { authed, appUrl, json } from "@/lib/server";
import { runEngine } from "@/lib/engine/engine";
import { supaDb } from "@/lib/engine/supadb";
import { serverPort } from "@/lib/enginePort";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The app calls this right after something happens so automations react instantly. */
export async function POST(req: Request) {
  const a = await authed(req);
  if (!a) return json({ error: "Please log in again." }, 401);
  const sum = await runEngine(supaDb(a.sb), serverPort(a.sb, appUrl(req)));
  return json(sum);
}
