"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, Empty, Modal, PageHeader } from "@/components/ui";
import { BookingModal } from "@/components/BookingModal";
import { useCrm } from "@/lib/store";
import { storeDb } from "@/lib/storeDb";
import { addDays, cancelBooking, classSessions, fmtDay, fmtTime, localDate, weekday, zoned } from "@/lib/bookings";
import type { Booking, BookingStatus, Service } from "@/lib/types";

const TONE: Record<BookingStatus, "teal" | "green" | "gray" | "rose"> = { booked: "teal", checked_in: "green", cancelled: "gray", no_show: "rose" };
const LABEL: Record<BookingStatus, string> = { booked: "Booked", checked_in: "Checked in", cancelled: "Cancelled", no_show: "No-show" };

function StatusActions({ b }: { b: Booking }) {
  const crm = useCrm();
  const set = (status: BookingStatus) => crm.update("bookings", b.id, { status });
  if (b.status === "cancelled") return <Badge tone="gray">Cancelled</Badge>;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {b.status === "booked" ? <>
        <button type="button" onClick={() => set("checked_in")} className="rounded-full bg-teal px-3 py-1 text-[13px] font-semibold text-white hover:bg-teal-d">Check in</button>
        <button type="button" onClick={() => set("no_show")} className="rounded-full px-2.5 py-1 text-[13px] font-semibold text-muted hover:bg-cloud">No-show</button>
        <button type="button" onClick={() => cancelBooking(storeDb(crm), b).then(() => crm.toast("Booking cancelled"))} className="rounded-full px-2.5 py-1 text-[13px] font-semibold text-muted hover:bg-rose-t hover:text-rose">Cancel</button>
      </> : <><Badge tone={TONE[b.status]}>{LABEL[b.status]}</Badge><button type="button" onClick={() => set("booked")} className="rounded-full px-2 py-1 text-[12.5px] font-semibold text-muted hover:bg-cloud">Undo</button></>}
    </div>
  );
}

function Roster({ svc, start, onClose }: { svc: Service; start: number; onClose: () => void }) {
  const { data, settings } = useCrm();
  const [add, setAdd] = useState(false);
  const list = data.bookings.filter((b) => b.service_id === svc.id && +new Date(b.starts_at) === start).sort((a, b) => a.status.localeCompare(b.status));
  const taken = list.filter((b) => b.status === "booked" || b.status === "checked_in").length;
  return (
    <Modal title={`${svc.name} · ${fmtDay(start, settings?.timezone)}, ${fmtTime(start, settings?.timezone)}`} onClose={onClose} wide>
      <div className="mb-4 flex items-center justify-between"><span className="text-sm text-muted"><strong className="text-ink">{taken}</strong> of {svc.capacity} spots taken</span><Button size="sm" icon="plus" onClick={() => setAdd(true)} disabled={taken >= svc.capacity}>Add client</Button></div>
      {list.length === 0 ? <p className="rounded-xl bg-cloud px-4 py-6 text-center text-sm text-muted">Nobody booked yet.</p> : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {list.map((b) => { const c = data.contacts.find((x) => x.id === b.contact_id); return (
            <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">{c ? <Link href={`/contacts/${c.id}`} className="font-semibold text-ink hover:text-teal-d">{c.name}</Link> : "Unknown"}<div className="text-[12.5px] text-muted">{b.membership_id ? "Membership" : "Pay at visit"} · {b.source === "online" ? "Booked online" : "Booked by staff"}</div></div>
              <StatusActions b={b} />
            </li>); })}
        </ul>
      )}
      {add && <BookingModal onClose={() => setAdd(false)} preset={{ serviceId: svc.id, start }} />}
    </Modal>
  );
}

export default function SchedulePage() {
  const { data, settings } = useCrm();
  const tz = settings?.timezone;
  const [now] = useState(() => Date.now());
  const today = localDate(now, tz);
  const [from, setFrom] = useState(() => addDays(today, -((weekday(today) + 6) % 7))); // Monday
  const [newB, setNewB] = useState(false);
  const [roster, setRoster] = useState<{ svc: Service; start: number } | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const startMs = zoned(from, "00:00", tz), endMs = zoned(addDays(from, 7), "00:00", tz);

  const week = useMemo(() => {
    const appts = data.bookings.filter((b) => { const t = +new Date(b.starts_at); const svc = data.services.find((s) => s.id === b.service_id); return t >= startMs && t < endMs && svc?.kind !== "class"; });
    const sessions = data.services.filter((s) => s.kind === "class" && s.active).flatMap((s) => classSessions(s, from, 7, data.bookings, tz).map((x) => ({ ...x, svc: s })));
    const inWeek = data.bookings.filter((b) => { const t = +new Date(b.starts_at); return t >= startMs && t < endMs && b.status !== "cancelled"; });
    return { appts, sessions, total: inWeek.length, checked: inWeek.filter((b) => b.status === "checked_in").length, noshow: inWeek.filter((b) => b.status === "no_show").length,
      fill: sessions.length ? Math.round((sessions.reduce((a, s) => a + ((s.capacity ?? 0) - (s.spots ?? 0)), 0) / Math.max(1, sessions.reduce((a, s) => a + (s.capacity ?? 0), 0))) * 100) : 0 };
  }, [data.bookings, data.services, from, startMs, endMs, tz]);

  const label = `${fmtDay(startMs, tz).split(",").slice(1).join(",").trim()} – ${fmtDay(zoned(addDays(from, 6), "12:00", tz), tz).split(",").slice(1).join(",").trim()}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Schedule" sub="Classes and appointments, check-ins and no-shows." action={<Button icon="plus" onClick={() => setNewB(true)} disabled={!data.services.length}>New booking</Button>} />
      {data.services.length === 0 ? (
        <Card><Empty icon="calendar" title="Set up what people can book" text="Add your appointment types and classes first, then share your booking page." action={<Link href="/bookings/services" className="inline-flex h-11 items-center rounded-full bg-ink px-5 font-semibold text-white">Add services and classes</Link>} /></Card>
      ) : (<>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-full bg-white p-1 ring-1 ring-line">
            <button type="button" onClick={() => setFrom(addDays(from, -7))} aria-label="Previous week" className="grid size-9 place-items-center rounded-full hover:bg-cloud"><Icon name="back" className="size-4" /></button>
            <button type="button" onClick={() => setFrom(addDays(today, -((weekday(today) + 6) % 7)))} className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-cloud">This week</button>
            <button type="button" onClick={() => setFrom(addDays(from, 7))} aria-label="Next week" className="grid size-9 rotate-180 place-items-center rounded-full hover:bg-cloud"><Icon name="back" className="size-4" /></button>
          </div>
          <span className="font-semibold text-ink">{label}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {[["Bookings", week.total], ["Checked in", week.checked], ["No-shows", week.noshow], ["Class fill rate", `${week.fill}%`]].map(([l, v]) => <Card key={l as string} className="!p-4"><div className="text-[13px] font-medium text-muted">{l}</div><div className="font-display text-2xl font-semibold text-ink">{v}</div></Card>)}
        </div>
        <div className="space-y-4">
          {days.map((d) => {
            const s = week.sessions.filter((x) => localDate(x.start, tz) === d);
            const a = week.appts.filter((b) => localDate(+new Date(b.starts_at), tz) === d);
            const items = [...s.map((x) => ({ t: x.start, k: "s" as const, x })), ...a.map((b) => ({ t: +new Date(b.starts_at), k: "a" as const, b }))].sort((p, q) => p.t - q.t);
            const isToday = d === today;
            return (
              <Card key={d} className={`!p-0 overflow-hidden ${isToday ? "ring-2 ring-teal/30" : ""}`}>
                <div className="flex items-center justify-between border-b border-line px-5 py-3"><span className="font-semibold text-ink">{fmtDay(zoned(d, "12:00", tz), tz)}</span>{isToday && <Badge tone="teal">Today</Badge>}</div>
                {items.length === 0 ? <p className="px-5 py-4 text-sm text-muted">Nothing booked.</p> : (
                  <ul className="divide-y divide-line">
                    {items.map((it) => it.k === "s" ? (
                      <li key={`s${it.x.svc.id}${it.t}`}>
                        <button type="button" onClick={() => setRoster({ svc: it.x.svc, start: it.t })} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-cloud">
                          <span className="w-16 shrink-0 text-sm font-semibold text-ink">{fmtTime(it.t, tz)}</span>
                          <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: it.x.svc.color }} />
                          <span className="min-w-0 flex-1"><span className="block font-semibold text-ink">{it.x.svc.name}</span><span className="block text-[13px] text-muted">Class · {it.x.svc.duration} min{it.x.staff ? ` · ${it.x.staff}` : ""}</span></span>
                          <span className="text-right text-sm"><span className="font-semibold text-ink">{(it.x.capacity ?? 0) - (it.x.spots ?? 0)}</span><span className="text-muted">/{it.x.capacity}</span><span className="block text-[12px] text-muted">booked</span></span>
                        </button>
                      </li>
                    ) : (() => { const b = it.b, c = data.contacts.find((x) => x.id === b.contact_id), svc = data.services.find((x) => x.id === b.service_id); return (
                      <li key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <span className="w-16 shrink-0 text-sm font-semibold text-ink">{fmtTime(it.t, tz)}</span>
                        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: svc?.color ?? "#cfd6e6" }} />
                        <span className="min-w-0 flex-1"><span className="block font-semibold text-ink">{c ? <Link href={`/contacts/${c.id}`} className="hover:text-teal-d">{c.name}</Link> : "Unknown"}</span><span className="block text-[13px] text-muted">{svc?.name ?? "Service"}{b.staff ? ` · ${b.staff}` : ""}{b.source === "online" ? " · online" : ""}</span></span>
                        <StatusActions b={b} />
                      </li>); })())}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      </>)}
      {newB && <BookingModal onClose={() => setNewB(false)} />}
      {roster && <Roster svc={roster.svc} start={roster.start} onClose={() => setRoster(null)} />}
    </div>
  );
}
