"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, Field, Modal, PageHeader } from "@/components/ui";
import { BookVisitModal, VisitResultModal } from "@/components/flowModals";
import { useCrm } from "@/lib/store";
import { nowMs } from "@/lib/clock";
import { downloadIcs } from "@/lib/ics";
import { todayStr } from "@/lib/format";
import type { Deal, Visit } from "@/lib/types";

const key = (d: Date) => todayStr(d);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d: Date) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7)); // Monday
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const VC = { scheduled: "bg-teal-t text-teal-d border-teal/30", done: "bg-emerald-50 text-emerald-700 border-emerald-200", no_show: "bg-rose-t text-[#b8264b] border-rose/30", cancelled: "bg-cloud text-muted border-line line-through" } as const;

type Ev = { id: string; at: number; kind: "visit" | "task"; label: string; sub: string; visit?: Visit; dealId?: string | null; contactId?: string | null; done?: boolean };

export default function CalendarPage() {
  const { data, settings, update } = useCrm();
  const today = new Date(nowMs());
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [view, setView] = useState<"month" | "week">("month");
  const [sel, setSel] = useState(key(today));
  const [rep, setRep] = useState("");
  const [result, setResult] = useState<Visit | null>(null);
  const [pick, setPick] = useState<Date | null>(null);
  const [book, setBook] = useState<{ deal: Deal; day: Date } | null>(null);

  const deals = useMemo(() => new Map(data.deals.map((d) => [d.id, d])), [data.deals]);
  const contacts = useMemo(() => new Map(data.contacts.map((c) => [c.id, c])), [data.contacts]);
  const events = useMemo(() => {
    const m = new Map<string, Ev[]>();
    const push = (e: Ev) => { const k = key(new Date(e.at)); m.set(k, [...(m.get(k) ?? []), e]); };
    for (const v of data.visits) {
      if (rep && v.rep !== rep) continue;
      const d = deals.get(v.deal_id), c = contacts.get(v.contact_id ?? d?.contact_id ?? "");
      push({ id: v.id, at: new Date(v.starts_at).getTime(), kind: "visit", label: c?.name ?? d?.title ?? "Visit", sub: `${d?.project ?? "Visit"}${v.rep ? ` · ${v.rep}` : ""}`, visit: v, dealId: v.deal_id, contactId: c?.id });
    }
    if (!rep) for (const t of data.tasks) if (t.due_date) push({ id: t.id, at: new Date(t.due_date + "T09:00:00").getTime(), kind: "task", label: t.title, sub: "Task", dealId: t.deal_id, contactId: t.contact_id, done: t.done });
    for (const [k, list] of m) m.set(k, list.sort((a, b) => a.at - b.at));
    return m;
  }, [data.visits, data.tasks, deals, contacts, rep]);

  const days = useMemo(() => {
    if (view === "week") { const s = startOfWeek(cursor); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1), s = startOfWeek(first);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), n = Math.ceil((((last.getTime() - s.getTime()) / 86400000) + 1) / 7) * 7;
    return Array.from({ length: n }, (_, i) => addDays(s, i));
  }, [cursor, view]);

  const move = (n: number) => setCursor(view === "week" ? addDays(cursor, 7 * n) : new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const goToday = () => { const t = new Date(nowMs()); setCursor(new Date(t.getFullYear(), t.getMonth(), t.getDate())); setSel(key(t)); };
  const title = view === "month" ? cursor.toLocaleDateString([], { month: "long", year: "numeric" }) : `${days[0].toLocaleDateString([], { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
  const selDate = new Date(sel + "T00:00:00");
  const selEvents = events.get(sel) ?? [];
  const reps = settings?.reps ?? [];
  const openJobs = data.deals.filter((d) => ["new", "contacted", "visit_booked", "visit_done"].includes(d.stage));

  return (
    <div className="space-y-5">
      <PageHeader title="Calendar" sub="Every visit and task in one place. Click a day to see it or book a visit." action={<Button icon="plus" onClick={() => setPick(selDate)}>Book a visit</Button>} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-line bg-white p-1">
          <button onClick={() => move(-1)} aria-label="Previous" className="grid size-9 place-items-center rounded-full hover:bg-cloud"><Icon name="chevron" className="size-4 rotate-180" /></button>
          <button onClick={goToday} className="h-9 rounded-full px-3 text-sm font-semibold hover:bg-cloud">Today</button>
          <button onClick={() => move(1)} aria-label="Next" className="grid size-9 place-items-center rounded-full hover:bg-cloud"><Icon name="chevron" className="size-4" /></button>
        </div>
        <h2 className="min-w-40 text-lg font-semibold" aria-live="polite">{title}</h2>
        <div className="ml-auto flex items-center gap-2">
          {reps.length > 0 && <select className="field !w-auto !py-2" value={rep} onChange={(e) => setRep(e.target.value)} aria-label="Filter by rep"><option value="">Everyone</option>{reps.map((r) => <option key={r}>{r}</option>)}</select>}
          <div className="flex rounded-full border border-line bg-white p-1" role="tablist">
            {(["month", "week"] as const).map((v) => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`h-9 rounded-full px-4 text-sm font-semibold capitalize ${view === v ? "bg-ink text-white" : "text-body hover:bg-cloud"}`}>{v}</button>)}
          </div>
        </div>
      </div>

      <Card className="!p-2 sm:!p-3">
        <div className="grid grid-cols-7 border-b border-line pb-1 text-center text-[11.5px] font-bold uppercase tracking-wider text-muted">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}</div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const k = key(d), list = events.get(k) ?? [], isToday = k === key(today), out = view === "month" && d.getMonth() !== cursor.getMonth();
            return (
              <button key={k} onClick={() => setSel(k)} aria-label={`${d.toDateString()}, ${list.length} item${list.length === 1 ? "" : "s"}`} aria-pressed={sel === k}
                className={`min-h-[72px] border-b border-r border-line/60 p-1 text-left align-top transition last:border-r-0 sm:p-1.5 ${view === "week" ? "sm:min-h-[260px]" : "sm:min-h-[104px]"} ${sel === k ? "bg-teal-t/50" : "hover:bg-cloud/70"} ${out ? "opacity-45" : ""}`}>
                <span className={`inline-grid size-6 place-items-center rounded-full text-[12.5px] font-semibold ${isToday ? "bg-ink text-white" : "text-ink"}`}>{d.getDate()}</span>
                <div className="mt-0.5 space-y-0.5">
                  {list.slice(0, view === "week" ? 8 : 3).map((e) => (
                    <div key={e.id} className={`hidden truncate rounded-md border px-1 py-0.5 text-[11px] font-semibold sm:block ${e.kind === "visit" ? VC[e.visit!.status] : e.done ? "border-line bg-cloud text-muted line-through" : "border-sun/30 bg-sun-t text-[#9a5a00]"}`}>{e.kind === "visit" ? hhmm(e.visit!.starts_at) + " " : ""}{e.label}</div>
                  ))}
                  {list.length > (view === "week" ? 8 : 3) && <div className="hidden text-[11px] font-semibold text-muted sm:block">+{list.length - (view === "week" ? 8 : 3)} more</div>}
                  {list.length > 0 && <div className="flex gap-0.5 sm:hidden">{list.slice(0, 4).map((e) => <span key={e.id} className={`size-1.5 rounded-full ${e.kind === "visit" ? "bg-teal" : "bg-sun"}`} />)}</div>}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{selDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</h2>
          <Button size="sm" variant="soft" icon="plus" onClick={() => setPick(selDate)}>Book a visit this day</Button>
        </div>
        {selEvents.length === 0 ? <p className="text-muted">Nothing scheduled.</p> : (
          <ul className="divide-y divide-line">
            {selEvents.map((e) => {
              const v = e.visit, d = e.dealId ? deals.get(e.dealId) : undefined;
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${e.kind === "visit" ? "bg-teal-t text-teal-d" : "bg-sun-t text-[#9a5a00]"}`}><Icon name={e.kind === "visit" ? "calendar" : "check"} className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-ink">{v ? `${hhmm(v.starts_at)} · ` : ""}{e.label}</div>
                    <div className="text-[13px] text-muted">{e.sub}{d ? <> · <Link href={`/pipeline?deal=${d.id}`} className="font-semibold text-teal-d hover:underline">Open job</Link></> : null}</div>
                  </div>
                  {v && <Badge tone={v.status === "done" ? "green" : v.status === "no_show" ? "rose" : v.status === "cancelled" ? "gray" : "teal"}>{v.status === "no_show" ? "No-show" : v.status[0].toUpperCase() + v.status.slice(1)}</Badge>}
                  {e.kind === "task" && <Button size="sm" variant="soft" onClick={() => update("tasks", e.id, { done: !e.done })}>{e.done ? "Reopen" : "Done"}</Button>}
                  {v?.status === "scheduled" && (<>
                    <Button size="sm" variant="soft" onClick={() => setResult(v)}>Log result</Button>
                    <Button size="sm" variant="ghost" icon="download" aria-label="Add to my calendar" onClick={() => downloadIcs({ id: v.id, start: v.starts_at, summary: `Visit: ${e.label}`, location: d?.address, description: d?.project })}>.ics</Button>
                  </>)}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {pick && (
        <Modal title="Book a visit" onClose={() => setPick(null)}>
          <Field label="Which job?" hint="Pick the job to book a visit for. You'll choose the time next.">
            <select className="field" defaultValue="" onChange={(e) => { const d = deals.get(e.target.value); if (d) { setBook({ deal: d, day: pick }); setPick(null); } }}>
              <option value="" disabled>Choose a job…</option>
              {openJobs.map((d) => <option key={d.id} value={d.id}>{contacts.get(d.contact_id ?? "")?.name ?? d.title} · {d.project}</option>)}
            </select>
          </Field>
          {openJobs.length === 0 && <p className="mt-3 text-sm text-muted">No open jobs yet. Add a lead first.</p>}
        </Modal>
      )}
      {book && <BookVisitModal deal={book.deal} day={book.day} onClose={() => setBook(null)} />}
      {result && <VisitResultModal visit={result} onClose={() => setResult(null)} />}
    </div>
  );
}
