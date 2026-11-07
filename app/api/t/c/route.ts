import { serviceClient, verifyId } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Click redirect: records the first click (and counts it as an open), then forwards to the real link. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams, id = q.get("e") ?? "", u = q.get("u") ?? "", sig = q.get("s") ?? "";
  if (!/^https?:\/\//i.test(u) || !/^[0-9a-f-]{36}$/i.test(id) || !verifyId(`${id}|${u}`, sig)) {
    return new Response("This link is not valid.", { status: 400, headers: { "Content-Type": "text/plain" } });
  }
  const sb = serviceClient();
  if (sb) {
    const now = new Date().toISOString();
    await sb.from("emails").update({ clicked_at: now }).eq("id", id).is("clicked_at", null).then(() => {}, () => {});
    await sb.from("emails").update({ opened_at: now }).eq("id", id).is("opened_at", null).then(() => {}, () => {});
  }
  return Response.redirect(u, 302);
}
