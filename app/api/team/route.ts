import { appUrl, authed, serviceClient } from "@/lib/server";
import { sendMail } from "@/lib/mail";

export const dynamic = "force-dynamic";
const json = (b: unknown, status = 200) => Response.json(b, { status });
const ROLES = ["admin", "manager", "rep", "viewer"];
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/**
 * Team management for owners and admins: invite, change role, limit to own records, disable, remove, resend invite.
 * Members can't change org_members directly; everything goes through here with the caller's role checked.
 */
export async function POST(req: Request) {
  const a = await authed(req);
  if (!a) return json({ error: "Please log in again." }, 401);
  const svc = serviceClient();
  if (!svc) return json({ error: "Team management needs SUPABASE_SERVICE_ROLE_KEY in Vercel." }, 400);
  const [{ data: org }, { data: role }] = await Promise.all([a.sb.rpc("crm_org"), a.sb.rpc("crm_role")]);
  if (!org || (role !== "owner" && role !== "admin")) return json({ error: "Only the owner or an admin can manage the team." }, 403);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const action = String(b.action ?? "");
  const base = appUrl(req);

  async function invite(email: string, name: string) {
    const redirectTo = `${base}/welcome`;
    let link = await svc!.auth.admin.generateLink({ type: "invite", email, options: { redirectTo, data: { name } } });
    if (link.error && /already|registered|exists/i.test(link.error.message)) link = await svc!.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
    if (link.error || !link.data.user) throw new Error(link.error?.message || "Couldn't create the login.");
    const { data: st } = await svc!.from("settings").select("business_name").eq("owner_id", org).maybeSingle();
    const biz = (st as { business_name?: string } | null)?.business_name || "your team";
    const r = await sendMail({ sb: svc!, ownerId: org as string, to: email, system: true, baseUrl: base,
      subject: `You're invited to ${biz}'s CRM`,
      body: `Hi ${name.split(/\s+/)[0] || "there"},\n\nYou've been invited to join ${biz} on Process IQ CRM.\n\nAccept the invite and set your password here:\n${link.data.properties.action_link}\n\nThe link works once and expires in 24 hours. If it expires, ask for a new invite.` });
    return { userId: link.data.user.id, emailed: r.ok, link: r.ok ? undefined : link.data.properties.action_link, error: r.ok ? undefined : r.error };
  }

  try {
    if (action === "invite") {
      const email = String(b.email ?? "").trim().toLowerCase(), name = String(b.name ?? "").trim().slice(0, 80), r = String(b.role ?? "rep");
      if (!isEmail(email) || !name) return json({ error: "Add a name and a valid email address." }, 400);
      if (!ROLES.includes(r)) return json({ error: "Choose a role." }, 400);
      if (r === "admin" && role !== "owner") return json({ error: "Only the owner can add admins." }, 403);
      if (email === (a.user.email ?? "").toLowerCase()) return json({ error: "That's you." }, 400);
      const out = await invite(email, name);
      const { error } = await svc.from("org_members").upsert({ org_id: org, user_id: out.userId, email, name, role: r, own_only: !!b.own_only, status: "invited" }, { onConflict: "org_id,email" });
      if (error) throw new Error(/relation .* does not exist/.test(error.message) ? "Run supabase/migrations/012_team_objects.sql in Supabase first." : error.message);
      // Add them to the lead rotation by default.
      const { data: st } = await svc.from("settings").select("id,reps").eq("owner_id", org).maybeSingle();
      const s = st as { id: string; reps: string[] } | null;
      if (s && r !== "viewer" && !s.reps.includes(name)) await svc.from("settings").update({ reps: [...s.reps, name] }).eq("id", s.id);
      return json({ ok: true, emailed: out.emailed, link: out.link, emailError: out.error });
    }

    const id = String(b.id ?? "");
    const { data: m } = await svc.from("org_members").select("*").eq("id", id).eq("org_id", org).maybeSingle();
    const mem = m as { id: string; email: string; name: string; role: string; user_id: string | null } | null;
    if (!mem) return json({ error: "That team member wasn't found." }, 404);
    if (mem.role === "admin" && role !== "owner") return json({ error: "Only the owner can change an admin." }, 403);

    if (action === "update") {
      const patch: Record<string, unknown> = {};
      if (typeof b.role === "string") { if (!ROLES.includes(b.role)) return json({ error: "Choose a role." }, 400); if (b.role === "admin" && role !== "owner") return json({ error: "Only the owner can make admins." }, 403); patch.role = b.role; }
      if (typeof b.own_only === "boolean") patch.own_only = b.own_only;
      if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 80);
      if (b.status === "disabled" || b.status === "active") patch.status = b.status;
      await svc.from("org_members").update(patch).eq("id", mem.id);
      if (typeof patch.name === "string" && patch.name !== mem.name) {
        // Keep assignments pointing at the renamed person.
        await svc.from("deals").update({ rep: patch.name }).eq("owner_id", org).eq("rep", mem.name);
        await svc.from("contacts").update({ owner: patch.name }).eq("owner_id", org).eq("owner", mem.name);
      }
      return json({ ok: true });
    }
    if (action === "resend") { const out = await invite(mem.email, mem.name); return json({ ok: true, emailed: out.emailed, link: out.link, emailError: out.error }); }
    if (action === "remove") {
      await svc.from("org_members").delete().eq("id", mem.id);
      const { data: st } = await svc.from("settings").select("id,reps").eq("owner_id", org).maybeSingle();
      const s = st as { id: string; reps: string[] } | null;
      if (s) await svc.from("settings").update({ reps: s.reps.filter((x) => x !== mem.name) }).eq("id", s.id);
      // Their login stays, but with no membership it can only see an empty account. Remove it entirely if it has no data of its own.
      if (mem.user_id) {
        const { count } = await svc.from("contacts").select("id", { count: "exact", head: true }).eq("owner_id", mem.user_id);
        if (!count) await svc.auth.admin.deleteUser(mem.user_id).catch(() => {});
      }
      return json({ ok: true });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (e) { return json({ error: (e as Error).message }, 500); }
}
