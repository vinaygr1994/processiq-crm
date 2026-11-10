"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, ConfirmModal, Empty, Field, Modal, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { DAYS, DAYS_LONG, money } from "@/lib/bookings";
import type { ClassSlot, Service } from "@/lib/types";

type Draft = Omit<Service, "id" | "created_at">;
const COLORS = ["#0b8a8a", "#2f7fd0", "#5a5bef", "#ec5b7f", "#ffad4d", "#16a34a"];
const blank = (kind: Service["kind"]): Draft => ({ name: "", kind, duration: kind === "class" ? 50 : 60, price: 0, capacity: kind === "class" ? 12 : 1, color: COLORS[kind === "class" ? 3 : 0], description: "", staff: [], schedule: kind === "class" ? [{ day: 1, time: "18:00", staff: "" }] : [], active: true });

function ServiceModal({ svc, kind, onClose }: { svc?: Service; kind: Service["kind"]; onClose: () => void }) {
  const { add, update, settings, toast } = useCrm();
  const [f, setF] = useState<Draft>(() => (svc ? { ...svc } : blank(kind)));
  const [err, setErr] = useState("");
  const reps = settings?.reps ?? [];
  const setSlot = (i: number, p: Partial<ClassSlot>) => setF({ ...f, schedule: f.schedule.map((s, k) => (k === i ? { ...s, ...p } : s)) });
  async function save() {
    if (!f.name.trim()) return setErr("Give it a name.");
    if (f.kind === "class" && !f.schedule.length) return setErr("Add at least one time to the class timetable.");
    const row = { ...f, name: f.name.trim(), duration: Math.max(5, Math.round(f.duration)), capacity: f.kind === "class" ? Math.max(1, Math.round(f.capacity)) : 1, price: Math.max(0, f.price) };
    try {
      if (svc) await update("services", svc.id, row); else if (!(await add("services", row))) return;
      toast("Saved"); onClose();
    } catch { setErr("Couldn't save. Run supabase/migrations/010_bookings.sql in Supabase first."); }
  }
  return (
    <Modal title={svc ? `Edit ${svc.name}` : f.kind === "class" ? "New class" : "New appointment type"} onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="Name"><input className="field" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={f.kind === "class" ? "e.g. Strength class" : "e.g. Free consultation"} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Length (minutes)"><input type="number" min={5} step={5} className="field" value={f.duration} onChange={(e) => setF({ ...f, duration: Number(e.target.value) })} /></Field>
          <Field label="Price" hint="0 = free"><input type="number" min={0} step="0.01" className="field" value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} /></Field>
          {f.kind === "class" && <Field label="Spots per class"><input type="number" min={1} className="field" value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} /></Field>}
        </div>
        <Field label="Description (shown on the booking page)"><textarea className="field !min-h-[70px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        {f.kind === "class" ? (
          <div>
            <div className="mb-2 text-sm font-semibold text-ink">Weekly timetable</div>
            <div className="space-y-2">
              {f.schedule.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select className="field !w-36" aria-label="Day" value={s.day} onChange={(e) => setSlot(i, { day: Number(e.target.value) })}>{DAYS_LONG.map((d, k) => <option key={d} value={k}>{d}</option>)}</select>
                  <input type="time" className="field !w-32" aria-label="Time" value={s.time} onChange={(e) => setSlot(i, { time: e.target.value })} />
                  {reps.length > 0 && <select className="field !w-40" aria-label="Instructor" value={s.staff} onChange={(e) => setSlot(i, { staff: e.target.value })}><option value="">Any instructor</option>{reps.map((r) => <option key={r}>{r}</option>)}</select>}
                  <button type="button" onClick={() => setF({ ...f, schedule: f.schedule.filter((_, k) => k !== i) })} aria-label="Remove time" className="grid size-9 place-items-center rounded-full text-muted hover:bg-rose-t hover:text-rose"><Icon name="x" className="size-4" /></button>
                </div>
              ))}
            </div>
            <Button type="button" size="sm" variant="soft" icon="plus" className="mt-2" onClick={() => setF({ ...f, schedule: [...f.schedule, { day: 1, time: "09:00", staff: "" }] })}>Add a time</Button>
          </div>
        ) : reps.length > 0 && (
          <div>
            <div className="mb-2 text-sm font-semibold text-ink">Who can do it</div>
            <div className="flex flex-wrap gap-1.5">{reps.map((r) => { const on = f.staff.includes(r); return <button key={r} type="button" aria-pressed={on} onClick={() => setF({ ...f, staff: on ? f.staff.filter((x) => x !== r) : [...f.staff, r] })} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? "border-teal bg-teal-t text-teal-d" : "border-line bg-white"}`}>{r}</button>; })}</div>
            <p className="mt-1.5 text-[12.5px] text-muted">None selected means anyone on your team.</p>
          </div>
        )}
        <div className="flex items-center gap-3"><span className="text-sm font-semibold">Colour</span>{COLORS.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={f.color === c} onClick={() => setF({ ...f, color: c })} className={`size-7 rounded-full ring-offset-2 ${f.color === c ? "ring-2 ring-ink" : ""}`} style={{ background: c }} />)}</div>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Can be booked</label>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2"><Button variant="soft" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></div>
      </div>
    </Modal>
  );
}

export default function ServicesPage() {
  const { data, remove, toast } = useCrm();
  const [edit, setEdit] = useState<{ svc?: Service; kind: Service["kind"] } | null>(null);
  const [del, setDel] = useState<Service | null>(null);
  const group = (k: Service["kind"]) => data.services.filter((s) => s.kind === k);
  const block = (k: Service["kind"], title: string, text: string) => (
    <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">{title}</h2><Button size="sm" variant="soft" icon="plus" onClick={() => setEdit({ kind: k })}>{k === "class" ? "New class" : "New appointment type"}</Button></div>
      {group(k).length === 0 ? <Card><p className="text-sm text-muted">{text}</p></Card> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {group(k).map((s) => (
            <Card key={s.id} className="!p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><button type="button" onClick={() => setEdit({ svc: s, kind: s.kind })} className="font-semibold text-ink hover:text-teal-d">{s.name}</button>{!s.active && <Badge>Hidden</Badge>}</div>
                  <div className="text-[13px] text-muted">{s.duration} min · {money(s.price)}{s.kind === "class" ? ` · ${s.capacity} spots` : ""}</div>
                  {s.kind === "class" && <div className="mt-1.5 flex flex-wrap gap-1">{s.schedule.map((x, i) => <span key={i} className="rounded-full bg-cloud px-2 py-0.5 text-[12px] font-semibold text-body">{DAYS[x.day]} {x.time}</span>)}</div>}
                </div>
                <button type="button" onClick={() => setDel(s)} aria-label={`Delete ${s.name}`} className="text-[#b3bdd2] hover:text-rose"><Icon name="trash" className="size-[18px]" /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
  return (
    <div className="space-y-8">
      <PageHeader title="Services and classes" sub="What clients can book: one-to-one appointments and group classes with a weekly timetable." />
      {data.services.length === 0 && <Card><Empty icon="calendar" title="Add what people can book" text="For example a free consultation, a personal training session or a weekly yoga class." /></Card>}
      {block("appointment", "Appointments", "One-to-one bookings such as consultations, treatments or sessions.")}
      {block("class", "Classes", "Group classes with a set number of spots and a weekly timetable.")}
      {edit && <ServiceModal svc={edit.svc} kind={edit.kind} onClose={() => setEdit(null)} />}
      {del && <ConfirmModal title={`Delete “${del.name}”?`} text="Past bookings stay in the schedule history. It can't be booked any more." onClose={() => setDel(null)} onConfirm={async () => { await remove("services", del.id); setDel(null); toast("Deleted"); }} />}
    </div>
  );
}
