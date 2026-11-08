"use client";
import { useMemo, useState } from "react";
import { Button, Field, Modal } from "./ui";
import { useCrm } from "@/lib/store";
import { storeDb } from "@/lib/storeDb";
import { appointmentSlots, bookingSettings, classSessions, createBooking, fmtTime, localDate, money, usableMembership } from "@/lib/bookings";

/** Staff-side booking: pick a client, a service and a time. Staff can book outside the online rules. */
export function BookingModal({ onClose, preset }: { onClose: () => void; preset?: { serviceId?: string; start?: number; contactId?: string } }) {
  const crm = useCrm();
  const { data, settings, toast } = crm;
  const tz = settings?.timezone;
  const [now] = useState(() => Date.now());
  const [contactId, setContactId] = useState(preset?.contactId ?? "");
  const [q, setQ] = useState("");
  const [serviceId, setServiceId] = useState(preset?.serviceId ?? data.services.find((s) => s.active)?.id ?? "");
  const [date, setDate] = useState(preset?.start ? localDate(preset.start, tz) : localDate(now, tz));
  const [start, setStart] = useState<number | null>(preset?.start ?? null);
  const [staff, setStaff] = useState("");
  const [useM, setUseM] = useState(true);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const svc = data.services.find((s) => s.id === serviceId);
  const bs = { ...bookingSettings(settings), lead_hours: -24 * 365 };
  const times = useMemo(() => {
    if (!svc) return [];
    return svc.kind === "class" ? classSessions(svc, date, 1, data.bookings, tz) : appointmentSlots(svc, date, bs, data.bookings, 0, tz, settings?.reps ?? []);
  }, [svc, date, data.bookings, tz, settings?.reps]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = q.trim().toLowerCase();
  const people = data.contacts.filter((c) => !s || [c.name, c.email, c.phone].some((v) => v.toLowerCase().includes(s))).slice(0, 8);
  const contact = data.contacts.find((c) => c.id === contactId);
  const m = contact ? usableMembership(contact.id, data.memberships, data.plans, localDate(now, tz)) : null;
  const plan = m ? data.plans.find((p) => p.id === m.plan_id) : null;

  async function save() {
    setErr("");
    if (!contactId) return setErr("Choose a client.");
    if (!svc) return setErr("Choose a service or class.");
    if (start === null) return setErr("Choose a time.");
    setBusy(true);
    try {
      await createBooking(storeDb(crm), { service: svc, start, staff: staff || undefined, contactId, source: "staff", note, useMembership: useM }, settings, now);
      toast("Booked"); onClose();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <Modal title="New booking" onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="Client">
          {contact ? (
            <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5"><span><span className="font-semibold">{contact.name}</span> <span className="text-sm text-muted">{contact.email}</span></span><button type="button" onClick={() => setContactId("")} className="text-sm font-semibold text-teal-d hover:underline">Change</button></div>
          ) : (
            <div className="space-y-2">
              <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients by name, email or phone" aria-label="Search clients" />
              <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-xl border border-line">{people.map((c) => <li key={c.id}><button type="button" onClick={() => setContactId(c.id)} className="w-full px-3.5 py-2 text-left text-sm hover:bg-cloud"><span className="font-semibold">{c.name}</span> <span className="text-muted">{c.email}</span></button></li>)}</ul>
            </div>
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Service or class">
            <select className="field" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setStart(null); }}>
              {data.services.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name} · {x.kind === "class" ? "class" : `${x.duration} min`}</option>)}
            </select>
          </Field>
          <Field label="Date"><input type="date" className="field" value={date} onChange={(e) => { setDate(e.target.value); setStart(null); }} /></Field>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold text-ink">Time</div>
          {times.length === 0 ? <p className="rounded-xl bg-cloud px-4 py-3 text-sm text-muted">{svc?.kind === "class" ? "This class doesn't run on that day." : "No free times inside opening hours that day. Change opening hours in Booking page."}</p> : (
            <div className="flex flex-wrap gap-1.5">
              {times.map((t) => <button key={t.start + t.staff} type="button" disabled={t.spots === 0} onClick={() => { setStart(t.start); setStaff(t.staff); }} aria-pressed={start === t.start}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${start === t.start ? "border-teal bg-teal text-white" : "border-line bg-white hover:border-teal"}`}>{fmtTime(t.start, tz)}{t.spots !== undefined ? ` · ${t.spots} left` : ""}{t.staff ? ` · ${t.staff}` : ""}</button>)}
            </div>
          )}
        </div>
        {m && plan && <label className="flex items-start gap-2 rounded-xl bg-teal-t/50 px-4 py-3 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-[#0b8a8a]" checked={useM} onChange={(e) => setUseM(e.target.checked)} /><span>Use their <strong>{plan.name}</strong>{m.credits !== null ? ` (${m.credits} left)` : ""}</span></label>}
        {!m && svc && svc.price > 0 && contact && <p className="text-sm text-muted">No active membership. Price: {money(svc.price)}, collected at the visit.</p>}
        <Field label="Note (optional)"><input className="field" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2"><Button variant="soft" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Booking…" : "Book"}</Button></div>
      </div>
    </Modal>
  );
}
