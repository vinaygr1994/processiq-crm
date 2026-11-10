"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isDemo } from "@/lib/config";
import { localDb } from "@/lib/engine/localdb";
import { addDays, appointmentSlots, bookingSettings, classSessions, createBooking, fmtDay, fmtTime, fmtWhen, localDate, money, weekday, zoned, type Slot } from "@/lib/bookings";
import type { Hours, Service } from "@/lib/types";

type PubService = Pick<Service, "id" | "name" | "kind" | "duration" | "price" | "color" | "description" | "capacity">;
interface Info { business: string; intro: string; tz: string; window: number; hours: Hours[]; services: PubService[]; sessions: (Slot & { service: string })[] }

/** Demo mode: everything runs on this browser's sample data. */
async function demoInfo(slug: string, service?: string, date?: string): Promise<(Info & { slots: Slot[] }) | null> {
  const [st] = await localDb.list("settings");
  const bs = bookingSettings(st);
  if (!st || !bs.enabled || bs.slug !== slug) return null;
  const [services, bookings] = await Promise.all([localDb.list("services"), localDb.list("bookings")]);
  const now = Date.now(), tz = st.timezone, active = services.filter((s) => s.active);
  const svc = active.find((s) => s.id === service && s.kind === "appointment");
  return {
    business: st.business_name, intro: bs.intro, tz, window: bs.window_days, hours: bs.hours, services: active,
    sessions: active.filter((s) => s.kind === "class").flatMap((s) => classSessions(s, localDate(now, tz), bs.window_days, bookings, tz, now + bs.lead_hours * 3_600_000).map((x) => ({ ...x, service: s.id }))),
    slots: svc && date ? appointmentSlots(svc, date, bs, bookings, now, tz, st.reps ?? []) : [],
  };
}

export default function BookPage() {
  const { slug } = useParams<{ slug: string }>();
  const [info, setInfo] = useState<Info | "missing" | null>(null);
  const [svc, setSvc] = useState<PubService | null>(null);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [pick, setPick] = useState<Slot | null>(null);
  const [f, setF] = useState({ name: "", email: "", phone: "", note: "", website: "" });
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState("");
  const [started] = useState(() => Date.now());
  const [done, setDone] = useState("");

  const fetchInfo = useCallback(async (service?: string, d?: string) => {
    if (isDemo) return demoInfo(slug, service, d);
    const q = service && d ? `?service=${service}&date=${d}` : "";
    const r = await fetch(`/api/book/${encodeURIComponent(slug)}${q}`);
    return r.ok ? r.json() : null;
  }, [slug]);

  useEffect(() => { fetchInfo().then((j) => setInfo(j ?? "missing")).catch(() => setInfo("missing")); }, [fetchInfo]);
  useEffect(() => {
    if (!svc || svc.kind !== "appointment" || !date) return;
    let off = false;
    fetchInfo(svc.id, date).then((j) => { if (!off) setSlots(j?.slots ?? []); });
    return () => { off = true; };
  }, [svc, date, fetchInfo]);

  const days = useMemo(() => {
    if (!info || info === "missing") return [];
    const today = localDate(started, info.tz);
    return Array.from({ length: info.window }, (_, i) => addDays(today, i)).filter((d) => info.hours.some((h) => h.day === weekday(d)));
  }, [info, started]);

  if (info === null) return <main className="min-h-dvh bg-[#f4f6fb]" />;
  if (info === "missing") return <main className="grid min-h-dvh place-items-center bg-[#f4f6fb] px-5 text-center"><div><h1 className="text-xl font-semibold">Online booking isn&apos;t available</h1><p className="mt-1 text-muted">Please contact the business directly.</p></div></main>;
  const tz = info.tz;
  const sessions = svc?.kind === "class" ? info.sessions.filter((s) => s.service === svc.id) : [];
  const step = state === "done" ? 3 : pick ? 2 : svc ? 1 : 0;

  async function book(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!svc || !pick) return;
    if (!f.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setErr("Please add your name and a valid email address.");
    setState("busy");
    try {
      if (isDemo) {
        const [st] = await localDb.list("settings");
        const full = (await localDb.list("services")).find((s) => s.id === svc.id)!;
        await createBooking(localDb, { service: full, start: pick.start, staff: pick.staff, person: { name: f.name, email: f.email, phone: f.phone }, source: "online", note: f.note }, st, Date.now());
        setDone(fmtWhen(pick.start, tz));
      } else {
        const r = await fetch(`/api/book/${encodeURIComponent(slug)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service: svc.id, start: pick.start, staff: pick.staff, ...f, elapsed: Date.now() - started }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
        setDone(j.when ?? fmtWhen(pick.start, tz));
      }
      setState("done");
    } catch (x) { setErr((x as Error).message); setState("idle"); }
  }

  const back = () => { if (pick) setPick(null); else { setSvc(null); setSlots(null); setDate(""); } };
  const groups: [string, PubService[]][] = [["Classes", info.services.filter((s) => s.kind === "class")], ["Appointments", info.services.filter((s) => s.kind === "appointment")]];

  return (
    <main className="min-h-dvh bg-[#f4f6fb] pb-16">
      <header className="bg-[#111a2e] text-white">
        <div className="mx-auto max-w-3xl px-5 py-8">
          <div className="text-sm font-semibold text-white/70">{info.business}</div>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight sm:text-[34px]" style={{ color: "#fff" }}>Book online</h1>
          <p className="mt-2 max-w-xl text-white/80">{info.intro}</p>
          <ol className="mt-6 flex gap-2 text-[13px] font-semibold" aria-label="Steps">
            {["Choose", "Time", "Your details", "Done"].map((l, i) => <li key={l} className={`rounded-full px-3 py-1 ${i === step ? "bg-white text-[#111a2e]" : i < step ? "bg-white/20 text-white" : "bg-white/5 text-white/50"}`}>{l}</li>)}
          </ol>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5 pt-6">
        {step > 0 && step < 3 && <button type="button" onClick={back} className="mb-4 text-sm font-semibold text-[#0b6f6f] hover:underline">← Back</button>}

        {step === 0 && groups.map(([g, list]) => list.length > 0 && (
          <section key={g} className="mb-6">
            <h2 className="mb-3 text-[15px] font-semibold text-[#111a2e]">{g}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map((s) => (
                <button key={s.id} type="button" onClick={() => { setSvc(s); if (s.kind === "appointment") { setDate(days[0] ?? ""); setSlots(null); } }} className="flex gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-[#e4e8f0] transition hover:shadow-md hover:ring-[#0b8a8a]">
                  <span className="w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="min-w-0"><span className="block font-semibold text-[#111a2e]">{s.name}</span><span className="block text-[13px] text-[#5d6782]">{s.duration} min · {money(s.price)}</span>{s.description && <span className="mt-1 block text-[13.5px] text-[#5d6782]">{s.description}</span>}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {step === 0 && info.services.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-[#5d6782]">Nothing to book right now. Please check back soon.</p>}

        {step === 1 && svc && (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#e4e8f0] sm:p-6">
            <h2 className="text-base font-semibold text-[#111a2e]">{svc.name}</h2>
            <p className="text-sm text-[#5d6782]">{svc.duration} min · {money(svc.price)}</p>
            {svc.kind === "class" ? (
              sessions.length === 0 ? <p className="mt-4 text-[#5d6782]">No upcoming classes. Please check back soon.</p> : (
                <ul className="mt-4 divide-y divide-[#e4e8f0]">
                  {sessions.map((s) => (
                    <li key={s.start} className="flex items-center justify-between gap-3 py-3">
                      <div><div className="font-semibold text-[#111a2e]">{fmtDay(s.start, tz)}</div><div className="text-sm text-[#5d6782]">{fmtTime(s.start, tz)}{s.staff ? ` · ${s.staff}` : ""} · {s.spots ? `${s.spots} spot${s.spots === 1 ? "" : "s"} left` : "Full"}</div></div>
                      <button type="button" disabled={!s.spots} onClick={() => setPick(s)} className="rounded-full bg-[#0b8a8a] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:bg-[#cfd6e6]">{s.spots ? "Book" : "Full"}</button>
                    </li>
                  ))}
                </ul>
              )
            ) : (<>
              <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2" role="listbox" aria-label="Day">
                {days.map((d) => { const ms = zoned(d, "12:00", tz); const on = d === date; return (
                  <button key={d} type="button" role="option" aria-selected={on} onClick={() => { setDate(d); setSlots(null); }} className={`flex w-16 shrink-0 flex-col items-center rounded-2xl border py-2 ${on ? "border-[#0b8a8a] bg-[#0b8a8a] text-white" : "border-[#e4e8f0] bg-white text-[#111a2e] hover:border-[#0b8a8a]"}`}>
                    <span className="text-[12px] font-semibold opacity-80">{new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: "short" }).format(ms)}</span>
                    <span className="text-lg font-semibold">{new Intl.DateTimeFormat(undefined, { timeZone: tz, day: "numeric" }).format(ms)}</span>
                    <span className="text-[11px] opacity-80">{new Intl.DateTimeFormat(undefined, { timeZone: tz, month: "short" }).format(ms)}</span>
                  </button>); })}
              </div>
              <div className="mt-3">
                {slots === null ? <p className="text-sm text-[#5d6782]">Loading times…</p> : slots.length === 0 ? <p className="text-sm text-[#5d6782]">No free times that day. Try another day.</p> : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{slots.map((s) => <button key={s.start + s.staff} type="button" onClick={() => setPick(s)} className="rounded-xl border border-[#e4e8f0] py-2.5 text-sm font-semibold text-[#111a2e] hover:border-[#0b8a8a] hover:bg-[#e6f4f3]">{fmtTime(s.start, tz)}</button>)}</div>
                )}
              </div>
            </>)}
            <p className="mt-4 text-[12.5px] text-[#8a93a8]">Times shown in {tz}.</p>
          </section>
        )}

        {step === 2 && svc && pick && (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#e4e8f0] sm:p-6">
            <div className="mb-5 rounded-2xl bg-[#e6f4f3] px-4 py-3 text-[#0b6f6f]"><div className="font-semibold">{svc.name}</div><div className="text-sm">{fmtWhen(pick.start, tz)}{pick.staff ? ` · ${pick.staff}` : ""} · {money(svc.price)}</div></div>
            <form onSubmit={book} className="space-y-4" noValidate>
              {([["name", "Full name", "text", "name"], ["email", "Email", "email", "email"], ["phone", "Phone (optional)", "tel", "tel"]] as const).map(([k, l, t, ac]) => (
                <label key={k} className="block"><span className="mb-1.5 block text-sm font-semibold text-[#111a2e]">{l}</span><input type={t} autoComplete={ac} className="w-full rounded-xl border border-[#d9dfea] px-3.5 py-2.5 text-[15px] outline-none focus:border-[#0b8a8a] focus:ring-4 focus:ring-[#0b8a8a]/15" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
              ))}
              <label className="block"><span className="mb-1.5 block text-sm font-semibold text-[#111a2e]">Anything we should know? (optional)</span><textarea className="min-h-[80px] w-full rounded-xl border border-[#d9dfea] px-3.5 py-2.5 text-[15px] outline-none focus:border-[#0b8a8a]" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
              <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
              {err && <p role="alert" className="rounded-xl bg-[#fde8ee] px-3 py-2 text-sm text-[#b8264b]">{err}</p>}
              <button disabled={state === "busy"} className="h-12 w-full rounded-full bg-[#0b8a8a] font-semibold text-white hover:brightness-110 disabled:opacity-60">{state === "busy" ? "Booking…" : "Confirm booking"}</button>
              <p className="text-center text-[12.5px] text-[#8a93a8]">{svc.price ? "Pay at your visit, or use your membership." : "No payment needed."} You&apos;ll get a confirmation email with a cancel link.</p>
            </form>
          </section>
        )}

        {step === 3 && svc && (
          <section className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-[#e4e8f0]" role="status">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-[#0b8a8a] text-2xl text-white">✓</div>
            <h2 className="text-base font-semibold text-[#111a2e]">You&apos;re booked!</h2>
            <p className="mt-2 text-[#5d6782]">{svc.name} on {done}. A confirmation is on its way to {f.email}.</p>
            <button type="button" onClick={() => { setState("idle"); setPick(null); setSvc(null); setSlots(null); }} className="mt-5 text-sm font-semibold text-[#0b6f6f] hover:underline">Book something else</button>
          </section>
        )}
      </div>
    </main>
  );
}
