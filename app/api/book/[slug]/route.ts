import { appUrl, serviceClient, signId } from "@/lib/server";
import { appointmentSlots, bookingSettings, classSessions, createBooking, fmtWhen, localDate } from "@/lib/bookings";
import { runEngine } from "@/lib/engine/engine";
import { supaDb } from "@/lib/engine/supadb";
import { serverPort } from "@/lib/enginePort";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function load(slug: string) {
  const sb = serviceClient();
  if (!sb || !/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  const { data } = await sb.from("settings").select("*").eq("booking->>slug", slug).maybeSingle();
  const st = data as (Settings & { owner_id: string }) | null;
  if (!st || !bookingSettings(st).enabled) return null;
  return { sb, st, owner: st.owner_id, db: supaDb(sb, st.owner_id) };
}

/** Public: services and class sessions; with ?service=&date= also the free appointment times that day. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const r = await load((await params).slug);
  if (!r) return reply({ error: "Online booking isn't available." }, 404);
  const q = new URL(req.url).searchParams, now = Date.now(), tz = r.st.timezone, bs = bookingSettings(r.st);
  const [services, bookings] = await Promise.all([r.db.list("services"), r.db.list("bookings")]);
  const active = services.filter((s) => s.active);
  const pub = active.map(({ id, name, kind, duration, price, color, description, capacity }) => ({ id, name, kind, duration, price, color, description, capacity }));
  const sessions = active.filter((s) => s.kind === "class").flatMap((s) => classSessions(s, localDate(now, tz), bs.window_days, bookings, tz, now + bs.lead_hours * 3_600_000).map((x) => ({ ...x, service: s.id })));
  const svc = active.find((s) => s.id === q.get("service") && s.kind === "appointment");
  const date = q.get("date") ?? "";
  const slots = svc && /^\d{4}-\d{2}-\d{2}$/.test(date) ? appointmentSlots(svc, date, bs, bookings, now, tz, r.st.reps ?? []) : [];
  return reply({ business: r.st.business_name, intro: bs.intro, tz, window: bs.window_days, hours: bs.hours, services: pub, sessions, slots });
}

/** Public: make a booking. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const r = await load((await params).slug);
  if (!r) return reply({ error: "Online booking isn't available." }, 404);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return reply({ error: "Something went wrong. Please try again." }, 400); }
  if (String(b.website ?? "").trim() || Number(b.elapsed ?? 99999) < 1500) return reply({ ok: true });
  const name = String(b.name ?? "").trim().slice(0, 120), email = String(b.email ?? "").trim().slice(0, 200), phone = String(b.phone ?? "").trim().slice(0, 40);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "Please add your name and a valid email address." }, 400);
  const svc = (await r.db.list("services")).find((s) => s.id === b.service && s.active);
  const start = Number(b.start);
  if (!svc || !Number.isFinite(start)) return reply({ error: "Please choose a service and a time." }, 400);
  try {
    const out = await createBooking(r.db, { service: svc, start, staff: typeof b.staff === "string" ? b.staff : undefined, person: { name, email, phone }, source: "online", note: String(b.note ?? "").slice(0, 1000) }, r.st, Date.now());
    const base = appUrl(req), port = serverPort(r.sb, base, r.owner), when = fmtWhen(start, r.st.timezone);
    const cancel = `${base}/api/book/cancel?b=${out.booking.id}&s=${signId(out.booking.id)}`;
    await port.email({ to: out.contact.email, contactId: out.contact.id, subject: `You're booked: ${svc.name}, ${when}`,
      body: `Hi ${name.split(/\s+/)[0]},\n\nYou're booked in for ${svc.name} on ${when}${out.booking.staff ? ` with ${out.booking.staff}` : ""}.\n${out.membership ? "We've used your membership for this booking.\n" : svc.price ? `Price: $${svc.price}, paid at your visit.\n` : ""}\nNeed to cancel? ${cancel}\n\nSee you soon,\n${r.st.business_name}` }).catch(() => {});
    if (r.st.owner_email) await port.email({ to: r.st.owner_email, subject: `New booking: ${svc.name}, ${when}`, body: `${name} (${email}${phone ? `, ${phone}` : ""}) booked ${svc.name} for ${when}.` }).catch(() => {});
    try { await runEngine(r.db, port); } catch { /* the scheduler picks it up */ }
    return reply({ ok: true, when });
  } catch (e) { return reply({ error: (e as Error).message }, 409); }
}
