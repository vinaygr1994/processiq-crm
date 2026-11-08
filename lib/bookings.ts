// Bookings, classes and memberships: time-zone safe slot finding, booking, cancelling and credits.
// Pure helpers plus a few functions that take an engine Db (Supabase or demo storage).
import type { Db } from "./engine/engine";
import type { Booking, BookingSettings, Contact, Membership, Plan, Service, Settings } from "./types";

const MIN = 60_000, DAY = 86_400_000;
export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function bookingSettings(s: Settings | null | undefined): BookingSettings {
  const b = s?.booking ?? {};
  const slug = (s?.business_name ?? "book").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "book";
  return {
    enabled: b.enabled ?? false, slug: b.slug || slug, intro: b.intro ?? "Pick a time that suits you. You'll get a confirmation by email.",
    hours: b.hours ?? [1, 2, 3, 4, 5].map((day) => ({ day, open: "09:00", close: "17:00" })).concat([{ day: 6, open: "09:00", close: "13:00" }]),
    lead_hours: b.lead_hours ?? 2, interval: b.interval ?? 30, window_days: b.window_days ?? 21,
  };
}

/* ---------- Time zones ---------- */
function offset(tz: string, utc: number) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utc));
  const g = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second")) - utc;
}
const safeTz = (tz?: string) => { try { if (tz) { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } } catch {} return "UTC"; };
/** A wall-clock date and time in the business's time zone, as a timestamp. */
export function zoned(date: string, time: string, tzIn?: string): number {
  const tz = safeTz(tzIn);
  const [y, m, d] = date.split("-").map(Number), [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const o1 = offset(tz, guess); let t = guess - o1;
  const o2 = offset(tz, t); if (o2 !== o1) t = guess - o2;
  return t;
}
export const localDate = (ms: number, tz?: string) => new Intl.DateTimeFormat("en-CA", { timeZone: safeTz(tz), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
export const weekday = (date: string) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
export const addDays = (date: string, n: number) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d) + n * DAY).toISOString().slice(0, 10); };
export const fmtTime = (ms: number, tz?: string) => new Intl.DateTimeFormat(undefined, { timeZone: safeTz(tz), hour: "numeric", minute: "2-digit" }).format(new Date(ms));
export const fmtDay = (ms: number, tz?: string) => new Intl.DateTimeFormat(undefined, { timeZone: safeTz(tz), weekday: "long", month: "long", day: "numeric" }).format(new Date(ms));
export const fmtWhen = (ms: number, tz?: string) => `${fmtDay(ms, tz)} at ${fmtTime(ms, tz)}`;

/* ---------- Availability ---------- */
export interface Slot { start: number; end: number; staff: string; spots?: number; capacity?: number }
const live = (b: Booking) => b.status === "booked" || b.status === "checked_in";
const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/** Free appointment times on one day. With no staff set up, the business is one calendar. */
export function appointmentSlots(svc: Service, date: string, bs: BookingSettings, bookings: Booking[], now: number, tz: string | undefined, staffList: string[]): Slot[] {
  const dur = svc.duration * MIN, step = Math.max(5, bs.interval) * MIN;
  const people = svc.staff.length ? svc.staff : staffList.length ? staffList : [""];
  const busy = bookings.filter(live).map((b) => ({ s: +new Date(b.starts_at), e: +new Date(b.ends_at), staff: b.staff }));
  const out: Slot[] = [];
  for (const h of bs.hours.filter((x) => x.day === weekday(date))) {
    const open = zoned(date, h.open, tz), close = zoned(date, h.close, tz);
    for (let t = open; t + dur <= close; t += step) {
      if (t < now + bs.lead_hours * 60 * MIN) continue;
      const who = people.find((p) => !busy.some((b) => (p === "" || b.staff === "" || b.staff === p) && overlaps(t, t + dur, b.s, b.e)));
      if (who !== undefined) out.push({ start: t, end: t + dur, staff: who });
    }
  }
  return out;
}

/** Class sessions from the weekly timetable, with spots left. */
export function classSessions(svc: Service, from: string, days: number, bookings: Booking[], tz: string | undefined, now?: number): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    for (const c of svc.schedule.filter((x) => x.day === weekday(date))) {
      const start = zoned(date, c.time, tz);
      if (now !== undefined && start < now) continue;
      const taken = bookings.filter((b) => live(b) && b.service_id === svc.id && +new Date(b.starts_at) === start).length;
      out.push({ start, end: start + svc.duration * MIN, staff: c.staff, spots: Math.max(0, svc.capacity - taken), capacity: svc.capacity });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/* ---------- Memberships ---------- */
export function usableMembership(contactId: string, memberships: Membership[], plans: Plan[], today: string): Membership | null {
  return memberships.find((m) => {
    if (m.contact_id !== contactId || m.status !== "active") return false;
    if (m.ends_on && m.ends_on < today) return false;
    const p = plans.find((x) => x.id === m.plan_id);
    return p?.kind === "unlimited" || (m.credits ?? 0) > 0;
  }) ?? null;
}
export function sellMembership(plan: Plan, startsOn: string): Pick<Membership, "credits" | "starts_on" | "ends_on" | "status"> {
  const [y, m, d] = startsOn.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1 + Math.max(1, plan.months), d) - DAY).toISOString().slice(0, 10);
  return { status: "active", credits: plan.kind === "pack" ? plan.sessions : null, starts_on: startsOn, ends_on: end };
}

/* ---------- Booking ---------- */
export interface NewBooking { service: Service; start: number; staff?: string; contactId?: string; person?: { name: string; email: string; phone: string }; source: "online" | "staff"; note?: string; useMembership?: boolean }
const digits = (s: string) => s.replace(/\D/g, "");

export async function createBooking(db: Db, nb: NewBooking, settings: Settings | null | undefined, now: number): Promise<{ booking: Booking; contact: Contact; membership: Membership | null }> {
  const tz = settings?.timezone, bs = bookingSettings(settings);
  const [bookings, contacts, memberships, plans] = await Promise.all([db.list("bookings"), db.list("contacts"), db.list("memberships"), db.list("plans")]);
  const svc = nb.service, date = localDate(nb.start, tz);
  let slot: Slot | undefined;
  if (svc.kind === "class") {
    slot = classSessions(svc, date, 1, bookings, tz).find((s) => s.start === nb.start);
    if (!slot) throw new Error("That class isn't on the timetable.");
    if (!slot.spots) throw new Error("Sorry, that class is full.");
  } else {
    const all = appointmentSlots(svc, date, nb.source === "staff" ? { ...bs, lead_hours: -24 * 365, hours: bs.hours.length ? bs.hours : [] } : bs, bookings, nb.source === "staff" ? 0 : now, tz, settings?.reps ?? []);
    slot = all.find((s) => s.start === nb.start && (!nb.staff || s.staff === nb.staff));
    if (!slot && nb.source === "online") throw new Error("Sorry, that time was just taken. Please pick another.");
    slot ??= { start: nb.start, end: nb.start + svc.duration * MIN, staff: nb.staff ?? "" };
  }

  let contact = nb.contactId ? contacts.find((c) => c.id === nb.contactId) : undefined;
  if (!contact && nb.person) {
    const email = nb.person.email.trim().toLowerCase(), ph = digits(nb.person.phone);
    contact = contacts.find((c) => (email && c.email.toLowerCase() === email) || (ph.length >= 7 && digits(c.phone) === ph));
    if (!contact) contact = await db.insert("contacts", { name: nb.person.name.trim() || email, email, phone: nb.person.phone.trim(), company: "", tags: ["client"], source: "Online booking", unsubscribed: false });
  }
  if (!contact) throw new Error("Choose who the booking is for.");
  if (contacts.length && bookings.some((b) => live(b) && b.contact_id === contact!.id && +new Date(b.starts_at) === slot!.start && b.service_id === svc.id)) throw new Error("You're already booked in for this time.");

  const m = nb.useMembership !== false ? usableMembership(contact.id, memberships, plans, localDate(now, tz)) : null;
  if (m && m.credits !== null) await db.update("memberships", m.id, { credits: m.credits - 1 });
  const booking = await db.insert("bookings", {
    service_id: svc.id, contact_id: contact.id, staff: slot.staff, starts_at: new Date(slot.start).toISOString(), ends_at: new Date(slot.end).toISOString(),
    status: "booked", source: nb.source, membership_id: m?.id ?? null, note: nb.note ?? "",
  });
  await db.insert("activities", { contact_id: contact.id, kind: "meeting", body: `Booked ${svc.name} for ${fmtWhen(slot.start, tz)}${slot.staff ? ` with ${slot.staff}` : ""}${m ? " (used membership)" : ""}${nb.source === "online" ? " · booked online" : ""}` });
  return { booking, contact, membership: m };
}

/** Cancels a booking and gives back a class-pack credit if one was used. */
export async function cancelBooking(db: Db, b: Booking) {
  if (b.status === "cancelled") return;
  await db.update("bookings", b.id, { status: "cancelled" });
  if (b.membership_id) {
    const m = (await db.list("memberships")).find((x) => x.id === b.membership_id);
    if (m && m.credits !== null) await db.update("memberships", m.id, { credits: m.credits + 1 });
  }
}

export const money = (n: number) => (n ? new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n) : "Free");
