import { serviceClient, verifyId } from "@/lib/server";
import { cancelBooking } from "@/lib/bookings";
import { supaDb } from "@/lib/engine/supadb";
import type { Booking } from "@/lib/types";

export const dynamic = "force-dynamic";
const page = (title: string, text: string, status = 200) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#f4f6fb;display:grid;place-items:center;min-height:100vh"><div style="background:#fff;border-radius:20px;padding:32px;max-width:420px;text-align:center;box-shadow:0 10px 30px rgba(17,26,46,.08)"><h1 style="margin:0 0 8px;font-size:22px;color:#111a2e">${title}</h1><p style="margin:0;color:#5d6782;line-height:1.5">${text}</p></div></body>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

/** Signed link from the confirmation email. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams, id = q.get("b") ?? "", sig = q.get("s") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !verifyId(id, sig)) return page("Link not valid", "This cancel link isn't valid. Please contact us directly.", 400);
  const sb = serviceClient();
  if (!sb) return page("Not available", "Please contact us directly to cancel.", 503);
  const { data } = await sb.from("bookings").select("*").eq("id", id).maybeSingle();
  const b = data as (Booking & { owner_id: string }) | null;
  if (!b) return page("Booking not found", "We couldn't find that booking.", 404);
  if (new Date(b.starts_at).getTime() < Date.now()) return page("Too late to cancel online", "This booking has already started. Please contact us directly.");
  await cancelBooking(supaDb(sb, b.owner_id), b);
  return page("Booking cancelled", "Your booking is cancelled. We hope to see you another time.");
}
