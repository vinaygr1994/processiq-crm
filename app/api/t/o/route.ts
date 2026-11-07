import { serviceClient, verifyId } from "@/lib/server";

export const dynamic = "force-dynamic";
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Open pixel: records the first time an email is opened. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams, id = q.get("e") ?? "", sig = q.get("s") ?? "";
  if (/^[0-9a-f-]{36}$/i.test(id) && verifyId(id, sig)) {
    const sb = serviceClient();
    if (sb) await sb.from("emails").update({ opened_at: new Date().toISOString() }).eq("id", id).is("opened_at", null).then(() => {}, () => {});
  }
  return new Response(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" } });
}
