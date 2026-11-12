"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { NewLeadModal } from "@/components/flowModals";
import { ImportModal } from "@/components/forms";
import { AiButton, Avatar, Badge, Button, Card, Empty } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { aiToday } from "@/lib/ai";
import { nowMs } from "@/lib/clock";
import { dueLabel, money, timeAgo, todayStr } from "@/lib/format";
import { columnOf, weighted } from "@/lib/pipelines";
import { useStages } from "@/lib/useStages";
import { DateRangePicker } from "@/components/DateRangePicker";
import { resolveRange, ymd, type Custom, type RangeId } from "@/lib/dateRange";

const DAY = 86400000;
const compact = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "")}k` : `$${Math.round(n)}`);

function Panel({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col rounded-[10px] border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,.04)] ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><h2 className="text-[14.5px] font-semibold">{title}</h2>{action}</div>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}
const more = "text-[13px] font-semibold text-teal-d hover:underline";

function Delta({ d }: { d: number | null }) {
  return d === null ? <span className="text-muted">No earlier data</span> : (
    <span><span className={`font-semibold ${d >= 0 ? "text-emerald-700" : "text-[#c42b52]"}`}>{d >= 0 ? "▲" : "▼"} {Math.abs(d)}%</span> <span className="text-muted">vs previous period</span></span>
  );
}
function Kpi({ label, value, sub, href }: { label: string; value: string; sub: React.ReactNode; href?: string }) {
  const body = (
    <div className={`h-full rounded-[10px] border border-line bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,.04)] ${href ? "transition hover:border-[#b9c2d6]" : ""}`}>
      <div className="text-[12.5px] font-semibold text-muted">{label}</div>
      <div className="mt-1 text-[26px] font-semibold leading-tight tracking-tight text-ink">{value}</div>
      <div className="mt-0.5 text-[12.5px]">{sub}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function HomePage() {
  const { data, update, add, toast, me, team } = useCrm();
  const { pipelines } = useStages();
  const [modal, setModal] = useState<"lead" | "import" | null>(null);
  const [rangeId, setRangeId] = useState<RangeId>("30");
  const [custom, setCustom] = useState<Custom>(() => { const n = nowMs(); return { from: ymd(n - 29 * DAY), to: ymd(n) }; });
  const [quickTask, setQuickTask] = useState("");
  const [ai, setAi] = useState<{ items: string[]; live: boolean } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const today = todayStr();
  const contactById = useMemo(() => new Map(data.contacts.map((c) => [c.id, c])), [data.contacts]);

  const v = useMemo(() => {
    const now = nowMs();
    const { from, to, prevFrom: prev } = resolveRange(rangeId, custom, now);
    const t = (iso: string) => new Date(iso).getTime();
    const kind = (d: (typeof data.deals)[number]) => columnOf(d, pipelines).kind;
    const open = data.deals.filter((d) => kind(d) === "open");
    const won = data.deals.filter((d) => kind(d) === "won");
    const lost = data.deals.filter((d) => kind(d) === "lost");
    const inP = <T,>(xs: T[], at: (x: T) => number) => xs.filter((x) => at(x) >= from && at(x) < to);
    const inPrev = <T,>(xs: T[], at: (x: T) => number) => xs.filter((x) => at(x) >= prev && at(x) < from);
    const sum = (xs: { value: number }[]) => xs.reduce((a, d) => a + (d.value || 0), 0);
    const wonNow = inP(won, (d) => t(d.stage_at)), wonPrev = inPrev(won, (d) => t(d.stage_at));
    const lostNow = inP(lost, (d) => t(d.stage_at));
    const newNow = inP(data.deals, (d) => t(d.created_at)), newPrev = inPrev(data.deals, (d) => t(d.created_at));
    const delta = (a: number, b: number) => (b === 0 ? (a === 0 ? null : 100) : Math.round(((a - b) / b) * 100));
    const closed = wonNow.length + lostNow.length;

    // revenue won per month, last 6 months
    const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth() - (5 - i)); return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: "short" }), total: 0, n: 0 }; });
    for (const d of won) { const x = new Date(d.stage_at); const m = months.find((y) => y.key === `${x.getFullYear()}-${x.getMonth()}`); if (m) { m.total += d.value || 0; m.n++; } }

    const main = pipelines[0];
    const funnel = main.stages.filter((s) => s.kind === "open").map((s) => { const ds = open.filter((d) => columnOf(d, pipelines).id === s.id); return { ...s, n: ds.length, total: sum(ds) }; });

    const sources = [...new Set(data.deals.map((d) => d.source || "Other"))].map((src) => {
      const ds = data.deals.filter((d) => (d.source || "Other") === src);
      const w = ds.filter((d) => kind(d) === "won");
      const cl = w.length + ds.filter((d) => kind(d) === "lost").length;
      return { src, leads: ds.length, won: w.length, revenue: sum(w), rate: cl ? Math.round((w.length / cl) * 100) : null };
    }).sort((a, b) => b.revenue - a.revenue || b.leads - a.leads).slice(0, 6);

    const owners = [...new Set([...team, ...data.deals.map((d) => d.rep)].filter(Boolean))].map((name) => ({
      name, open: sum(open.filter((d) => d.rep === name)), openN: open.filter((d) => d.rep === name).length, won: sum(wonNow.filter((d) => d.rep === name)),
    })).sort((a, b) => b.won - a.won || b.open - a.open).slice(0, 5);

    const tasks = data.tasks.filter((x) => !x.done).sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9"));
    const overdue = tasks.filter((x) => x.due_date && x.due_date < today);
    const attention = open.map((d) => {
      const quiet = Math.floor((now - t(d.stage_at)) / DAY);
      const late = !!d.close_date && d.close_date < today;
      return { deal: d, quiet, late };
    }).filter((x) => x.late || x.quiet >= 7).sort((a, b) => Number(b.late) - Number(a.late) || b.quiet - a.quiet).slice(0, 5);

    const upcoming = [
      ...data.visits.filter((x) => x.status === "scheduled" && t(x.starts_at) >= now).map((x) => ({ id: x.id, at: x.starts_at, title: "Meeting", who: contactById.get(x.contact_id ?? "")?.name ?? "", href: `/pipeline?deal=${x.deal_id}` })),
      ...data.bookings.filter((b) => b.status === "booked" && t(b.starts_at) >= now).map((b) => ({ id: b.id, at: b.starts_at, title: data.services.find((s) => s.id === b.service_id)?.name ?? "Booking", who: contactById.get(b.contact_id ?? "")?.name ?? "", href: "/bookings" })),
    ].sort((a, b) => a.at.localeCompare(b.at)).slice(0, 5);

    const feed = [
      ...data.autolog.filter((l) => l.tone !== "skip").map((l) => { const d = data.deals.find((x) => x.id === l.deal_id); return { id: l.id, at: l.created_at, text: l.message, who: contactById.get(d?.contact_id ?? "")?.name ?? "", icon: "bolt" }; }),
      ...data.activities.map((a) => ({ id: a.id, at: a.created_at, text: `${a.kind[0].toUpperCase()}${a.kind.slice(1)}: ${a.body}`, who: contactById.get(a.contact_id)?.name ?? "", icon: a.kind === "call" ? "phone" : a.kind === "meeting" ? "calendar" : "note" })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 7);

    return {
      open, openSum: sum(open), forecast: open.reduce((a, d) => a + weighted(d, pipelines), 0),
      wonSum: sum(wonNow), wonN: wonNow.length, wonDelta: delta(sum(wonNow), sum(wonPrev)),
      newN: newNow.length, newDelta: delta(newNow.length, newPrev.length),
      winRate: closed ? Math.round((wonNow.length / closed) * 100) : null, closed,
      months, funnel, sources, owners, tasks, overdue, attention, upcoming, feed, mainName: main.name,
    };
  }, [data, pipelines, rangeId, custom, today, team, contactById]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const period = resolveRange(rangeId, custom, nowMs()).label;

  async function addQuick(e: React.FormEvent) {
    e.preventDefault();
    if (!quickTask.trim()) return;
    await add("tasks", { title: quickTask.trim(), due_date: today, done: false, contact_id: null, deal_id: null });
    setQuickTask("");
  }
  async function suggest() {
    setAiBusy(true);
    try {
      const name = (id: string | null) => (id ? contactById.get(id)?.name ?? "" : "");
      const r = await aiToday({
        overdue: v.overdue.slice(0, 6).map((t) => ({ title: t.title, who: name(t.contact_id) })),
        stale: v.attention.map((s) => ({ deal: s.deal.title, who: name(s.deal.contact_id), days: s.quiet, value: s.deal.value })),
        fresh: v.open.filter((d) => nowMs() - new Date(d.created_at).getTime() < 7 * DAY).slice(0, 5).map((d) => ({ name: name(d.contact_id), company: d.project, days: Math.floor((nowMs() - new Date(d.created_at).getTime()) / DAY) })),
      });
      setAi({ items: r.result.items, live: r.live });
    } catch (e) { toast((e as Error).message, "error"); }
    setAiBusy(false);
  }

  if (!data.contacts.length && !data.deals.length) {
    return (
      <div>
        <h1 className="mb-5 text-[22px] font-semibold">{greet}{me.name ? `, ${me.name}` : ""}</h1>
        <Card><Empty icon="pipeline" title="Your CRM is ready" text="Add your first deal or import your contacts to see your dashboard come to life." action={<div className="flex gap-2"><Button onClick={() => setModal("lead")}>Add a deal</Button><Button variant="soft" onClick={() => setModal("import")}>Import contacts</Button></div>} /></Card>
        {modal === "lead" && <NewLeadModal onClose={() => setModal(null)} />}
        {modal === "import" && <ImportModal onClose={() => setModal(null)} />}
      </div>
    );
  }

  const maxMonth = Math.max(1, ...v.months.map((m) => m.total));
  const maxStage = Math.max(1, ...v.funnel.map((f) => f.total));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight">{greet}{me.name ? `, ${me.name}` : ""}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · {v.overdue.length ? `${v.overdue.length} overdue task${v.overdue.length === 1 ? "" : "s"}` : "No overdue tasks"}</p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker id={rangeId} custom={custom} onId={setRangeId} onCustom={setCustom} />
          <AiButton onClick={suggest} busy={aiBusy}>Suggest priorities</AiButton>
        </div>
      </div>

      {ai && (
        <div className="rounded-[10px] border border-[#d6d6fb] bg-[#f6f6ff] px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between"><span className="text-[13px] font-semibold text-[#4344c9]">Suggested priorities{ai.live ? "" : " (sample)"}</span><button onClick={() => setAi(null)} className="text-[13px] font-semibold text-muted hover:text-ink">Dismiss</button></div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">{ai.items.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Open pipeline" value={money(v.openSum)} sub={<span className="text-muted">{v.open.length} open deal{v.open.length === 1 ? "" : "s"}</span>} href="/pipeline" />
        <Kpi label="Weighted forecast" value={money(v.forecast)} sub={<span className="text-muted">By stage probability</span>} href="/reports" />
        <Kpi label="Revenue won" value={money(v.wonSum)} sub={<Delta d={v.wonDelta} />} href="/reports" />
        <Kpi label="New deals" value={String(v.newN)} sub={<Delta d={v.newDelta} />} href="/pipeline" />
        <Kpi label="Win rate" value={v.winRate === null ? "–" : `${v.winRate}%`} sub={<span className="text-muted">{v.closed} closed, {period}</span>} href="/reports" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Revenue won by month" className="lg:col-span-2" action={<Link href="/reports" className={more}>Open reports</Link>}>
          <div className="flex h-52 items-end gap-3" role="img" aria-label={`Revenue won by month: ${v.months.map((m) => `${m.label} ${money(m.total)}`).join(", ")}`}>
            {v.months.map((m) => (
              <div key={m.key} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${m.label}: ${money(m.total)} from ${m.n} deal${m.n === 1 ? "" : "s"}`}>
                <span className="text-[12px] font-semibold text-ink">{m.total ? compact(m.total) : ""}</span>
                <span className="w-full max-w-[72px] rounded-t-[4px] bg-teal transition group-hover:bg-teal-d" style={{ height: `${Math.max(m.total ? 4 : 1, (m.total / maxMonth) * 78)}%`, opacity: m.total ? 1 : .25 }} />
                <span className="text-[12px] text-muted">{m.label}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={`Pipeline by stage`} action={<Link href="/pipeline" className={more}>View deals</Link>}>
          <ul className="space-y-3">
            {v.funnel.map((f) => (
              <li key={f.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]"><span className="font-medium text-ink">{f.label} <span className="text-muted">· {f.n}</span></span><span className="font-semibold text-ink">{f.total ? money(f.total) : "–"}</span></div>
                <div className="h-2 overflow-hidden rounded-sm bg-[#eef1f6]"><div className="h-full rounded-sm bg-[#5a5bef]" style={{ width: `${(f.total / maxStage) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="My tasks" action={<Badge tone={v.overdue.length ? "rose" : "gray"}>{v.overdue.length ? `${v.overdue.length} overdue` : `${v.tasks.length} open`}</Badge>}>
          {v.tasks.length === 0 && <p className="pb-3 text-[13.5px] text-muted">You&apos;re all caught up.</p>}
          <ul className="-mx-1 divide-y divide-line">
            {v.tasks.slice(0, 6).map((t) => {
              const c = t.contact_id ? contactById.get(t.contact_id) : null;
              const late = !!t.due_date && t.due_date < today;
              return (
                <li key={t.id} className="flex items-center gap-2.5 px-1 py-2">
                  <button onClick={() => update("tasks", t.id, { done: true })} aria-label={`Mark “${t.title}” done`} className="pill grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-[#b9c2d6] text-transparent transition hover:border-teal hover:bg-teal-t hover:text-teal"><Icon name="check" className="size-3" /></button>
                  <div className="min-w-0 flex-1"><div className="truncate text-[13.5px] font-medium text-ink">{t.title}</div>{c && <Link href={`/contacts/${c.id}`} className="text-[12.5px] text-muted hover:text-teal-d hover:underline">{c.name}</Link>}</div>
                  <span className={`shrink-0 text-[12.5px] font-semibold ${late ? "text-[#c42b52]" : "text-muted"}`}>{dueLabel(t.due_date)}</span>
                </li>
              );
            })}
          </ul>
          <form onSubmit={addQuick} className="mt-3 flex gap-2">
            <input className="field" value={quickTask} onChange={(e) => setQuickTask(e.target.value)} placeholder="Add a task for today" aria-label="New task" />
            <Button type="submit" variant="soft">Add</Button>
          </form>
        </Panel>

        <Panel title="Deals needing attention" action={<Link href="/pipeline" className={more}>All deals</Link>}>
          {v.attention.length === 0 ? <p className="text-[13.5px] text-muted">Every open deal has moved in the last week and none are past their close date.</p> : (
            <ul className="-mx-1 divide-y divide-line">{v.attention.map(({ deal, quiet, late }) => (
              <li key={deal.id}><Link href={`/pipeline?deal=${deal.id}`} className="flex items-center justify-between gap-3 rounded px-1 py-2 hover:bg-cloud">
                <span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold text-ink">{deal.title}</span><span className="text-[12.5px] text-muted">{money(deal.value)} · {columnOf(deal, pipelines).label}</span></span>
                {late ? <Badge tone="rose">Past close date</Badge> : <Badge tone="sun">{quiet} days quiet</Badge>}
              </Link></li>
            ))}</ul>
          )}
        </Panel>

        <Panel title="Coming up" action={<Link href="/calendar" className={more}>Calendar</Link>}>
          {v.upcoming.length === 0 ? <p className="text-[13.5px] text-muted">No meetings or bookings scheduled.</p> : (
            <ul className="-mx-1 divide-y divide-line">{v.upcoming.map((u) => { const d = new Date(u.at); return (
              <li key={u.id}><Link href={u.href} className="flex items-center gap-3 rounded px-1 py-2 hover:bg-cloud">
                <span className="grid w-11 shrink-0 place-items-center rounded-md border border-line bg-[#f8f9fc] py-1 leading-tight"><span className="text-[10.5px] font-semibold text-[#c42b52]">{d.toLocaleDateString(undefined, { month: "short" })}</span><span className="text-[15px] font-semibold text-ink">{d.getDate()}</span></span>
                <span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold text-ink">{u.title}{u.who ? ` with ${u.who}` : ""}</span><span className="text-[12.5px] text-muted">{d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</span></span>
              </Link></li>
            ); })}</ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Lead sources" className="lg:col-span-1">
          <table className="w-full text-left text-[13px]">
            <thead><tr className="border-b border-line text-muted"><th className="pb-2 font-semibold">Source</th><th className="pb-2 text-right font-semibold">Deals</th><th className="pb-2 text-right font-semibold">Win rate</th><th className="pb-2 text-right font-semibold">Won</th></tr></thead>
            <tbody className="divide-y divide-line">{v.sources.map((s) => (
              <tr key={s.src}><td className="py-2 font-medium text-ink">{s.src}</td><td className="py-2 text-right">{s.leads}</td><td className="py-2 text-right">{s.rate === null ? "–" : `${s.rate}%`}</td><td className="py-2 text-right font-semibold text-ink">{s.revenue ? money(s.revenue) : "–"}</td></tr>
            ))}</tbody>
          </table>
        </Panel>

        <Panel title="Team performance" action={<Link href="/team" className={more}>Team</Link>}>
          {v.owners.length === 0 ? <p className="text-[13.5px] text-muted">Assign deals to team members to compare them here.</p> : (
            <table className="w-full text-left text-[13px]">
              <thead><tr className="border-b border-line text-muted"><th className="pb-2 font-semibold">Owner</th><th className="pb-2 text-right font-semibold">Open</th><th className="pb-2 text-right font-semibold">Won</th></tr></thead>
              <tbody className="divide-y divide-line">{v.owners.map((o) => (
                <tr key={o.name}><td className="py-2"><span className="inline-flex items-center gap-2 font-medium text-ink"><Avatar name={o.name} size="size-6 text-[10px]" />{o.name}</span></td><td className="py-2 text-right">{o.open ? money(o.open) : "–"} <span className="text-muted">({o.openN})</span></td><td className="py-2 text-right font-semibold text-ink">{o.won ? money(o.won) : "–"}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Panel>

        <Panel title="Recent activity" action={<Link href="/automations" className={more}>Automation log</Link>}>
          {v.feed.length === 0 ? <p className="text-[13.5px] text-muted">Notes, calls, emails and automated steps show up here.</p> : (
            <ol className="space-y-3">{v.feed.map((f) => (
              <li key={f.id} className="flex gap-2.5">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-[#eef1f6] text-muted"><Icon name={f.icon} className="size-3.5" /></span>
                <div className="min-w-0 flex-1"><div className="line-clamp-2 text-[13px] text-ink">{f.text}</div><div className="text-[12px] text-muted">{f.who ? `${f.who} · ` : ""}{timeAgo(f.at)}</div></div>
              </li>
            ))}</ol>
          )}
        </Panel>
      </div>

      {modal === "lead" && <NewLeadModal onClose={() => setModal(null)} />}
      {modal === "import" && <ImportModal onClose={() => setModal(null)} />}
    </div>
  );
}
