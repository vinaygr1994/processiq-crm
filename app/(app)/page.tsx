"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { NewLeadModal } from "@/components/flowModals";
import { AddContactModal, ImportModal } from "@/components/forms";
import { AiButton, Badge, Button, Card, Empty } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { aiToday } from "@/lib/ai";
import { nowMs } from "@/lib/clock";
import { dueLabel, money, timeAgo, todayStr } from "@/lib/format";
import { isOpen } from "@/lib/stages";
import { useStages } from "@/lib/useStages";

const DAY = 86400000;
const toneDot = { info: "bg-teal", warn: "bg-sun", won: "bg-emerald-500", skip: "bg-[#c4cbdb]" } as const;

export default function TodayPage() {
  const { data, update, add, toast } = useCrm();
  const { stages } = useStages();
  const [modal, setModal] = useState<"lead" | "contact" | "import" | null>(null);
  const [quickTask, setQuickTask] = useState("");
  const [ai, setAi] = useState<{ items: string[]; live: boolean } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const today = todayStr();
  const contactById = useMemo(() => new Map(data.contacts.map((c) => [c.id, c])), [data.contacts]);

  const v = useMemo(() => {
    const now = nowMs();
    const wk = now - 7 * DAY;
    const deals = data.deals;
    const leads7 = deals.filter((d) => new Date(d.created_at).getTime() >= wk);
    // average first reply = speed-to-lead log time minus lead creation time
    const replies = deals.flatMap((d) => {
      const l = data.autolog.find((x) => x.deal_id === d.id && x.key === `speed:${d.id}`);
      return l ? [Math.max(0, new Date(l.created_at).getTime() - new Date(d.created_at).getTime())] : [];
    });
    const avgReply = replies.length ? replies.reduce((a, b) => a + b, 0) / replies.length : null;
    const upcoming = data.visits.filter((x) => x.status === "scheduled" && new Date(x.starts_at).getTime() >= now);
    const quoted = deals.filter((d) => d.stage === "quoted");
    const won = deals.filter((d) => d.stage === "won" || d.stage === "completed");
    const sent = data.autolog.filter((l) => l.tone !== "skip" && /\bsent\b/i.test(l.message)).length;
    const funnel = stages.map((s) => ({ ...s, n: deals.filter((d) => d.stage === s.id).length }));
    const sources = [...new Set(deals.map((d) => d.source || "Other"))].map((src) => {
      const ds = deals.filter((d) => (d.source || "Other") === src);
      const ids = new Set(ds.map((d) => d.id));
      const visits = new Set(data.visits.filter((x) => ids.has(x.deal_id) && x.status !== "cancelled").map((x) => x.deal_id)).size;
      const q = ds.filter((d) => d.quote_sent_at || ["quoted", "won", "completed"].includes(d.stage)).length;
      const w = ds.filter((d) => d.stage === "won" || d.stage === "completed");
      return { src, leads: ds.length, visits, quotes: q, won: w.length, revenue: w.reduce((a, d) => a + d.value, 0), rate: ds.length ? Math.round((w.length / ds.length) * 100) : 0 };
    }).sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
    const open = data.tasks.filter((t) => !t.done);
    const overdue = open.filter((t) => t.due_date && t.due_date < today);
    const dueToday = open.filter((t) => t.due_date === today);
    const later = open.filter((t) => !t.due_date || t.due_date > today).sort((a, b) => (a.due_date ?? "9").localeCompare(b.due_date ?? "9")).slice(0, 3);
    const stale = deals.filter((d) => isOpen(d.stage) && d.stage !== "new" && now - new Date(d.stage_at).getTime() > 5 * DAY)
      .map((d) => ({ deal: d, days: Math.floor((now - new Date(d.stage_at).getTime()) / DAY) })).sort((a, b) => b.days - a.days).slice(0, 4);
    return { leads7, avgReply, upcoming, quoted, quotedSum: quoted.reduce((a, d) => a + d.value, 0), won, wonSum: won.reduce((a, d) => a + d.value, 0), sent, funnel, sources, overdue, dueToday, later, stale };
  }, [data, today]);

  const log = useMemo(() => data.autolog.filter((l) => l.tone !== "skip").slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8), [data.autolog]);
  const dueNow = [...v.overdue, ...v.dueToday];
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const replyText = v.avgReply === null ? "—" : v.avgReply < 60000 ? "< 1 min" : v.avgReply < 3600000 ? `${Math.round(v.avgReply / 60000)} min` : `${(v.avgReply / 3600000).toFixed(1)} h`;
  const maxN = Math.max(1, ...v.funnel.map((f) => f.n));

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
        stale: v.stale.map((s) => ({ deal: s.deal.title, who: name(s.deal.contact_id), days: s.days, value: s.deal.value })),
        fresh: v.leads7.slice(0, 5).map((d) => ({ name: name(d.contact_id), company: d.project, days: Math.floor((nowMs() - new Date(d.created_at).getTime()) / DAY) })),
      });
      setAi({ items: r.result.items, live: r.live });
    } catch (e) { toast((e as Error).message, "error"); }
    setAiBusy(false);
  }

  if (!data.contacts.length && !data.deals.length) {
    return (
      <div className="space-y-6">
        <h1 className="text-[1.75rem] font-semibold sm:text-3xl">{greet}.</h1>
        <Card><Empty icon="home" title="No leads yet" text="Add your first lead and watch the reply, call task and follow-ups happen on their own." action={<div className="flex gap-2"><Button onClick={() => setModal("lead")}>Add a lead</Button><Button variant="soft" onClick={() => setModal("import")}>Import CSV</Button></div>} /></Card>
        {modal === "lead" && <NewLeadModal onClose={() => setModal(null)} />}
        {modal === "import" && <ImportModal onClose={() => setModal(null)} />}
      </div>
    );
  }

  const Kpi = ({ label, value, sub, href }: { label: string; value: string; sub: string; href?: string }) => {
    const body = <Card className={`h-full ${href ? "transition hover:border-[#cfd6e6]" : ""}`}><div className="text-sm font-semibold text-muted">{label}</div><div className="mt-1 font-display text-[1.9rem] font-semibold leading-tight text-ink">{value}</div><div className="text-sm text-muted">{sub}</div></Card>;
    return href ? <Link href={href}>{body}</Link> : body;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] font-semibold sm:text-3xl">{greet}.</h1>
          <p className="mt-1 text-muted">{dueNow.length ? `${dueNow.length} thing${dueNow.length === 1 ? "" : "s"} to do today. The rest is on autopilot.` : "Nothing urgent. Autopilot is handling the follow-ups."}</p>
        </div>
        <Button icon="plus" onClick={() => setModal("lead")}>New lead</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="New leads (7 days)" value={String(v.leads7.length)} sub={`${data.deals.length} jobs in total`} href="/pipeline" />
        <Kpi label="Average first reply" value={replyText} sub="Sent automatically" href="/automations" />
        <Kpi label="Visits coming up" value={String(v.upcoming.length)} sub={v.upcoming[0] ? `Next: ${new Date(v.upcoming[0].starts_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}` : "None booked"} href="/pipeline" />
        <Kpi label="Quotes out" value={money(v.quotedSum)} sub={`${v.quoted.length} waiting for a decision`} href="/pipeline" />
        <Kpi label="Revenue won" value={money(v.wonSum)} sub={`${v.won.length} job${v.won.length === 1 ? "" : "s"}`} />
        <Kpi label="Messages sent for you" value={String(v.sent)} sub="No one had to remember" href="/automations" />
        <Kpi label="To do today" value={String(dueNow.length)} sub={v.overdue.length ? `${v.overdue.length} overdue` : "All on track"} />
        <Kpi label="Needs attention" value={String(v.stale.length)} sub="Jobs gone quiet" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <h2 className="mb-4 text-lg font-semibold">Where your leads are</h2>
          <ul className="space-y-2.5">
            {v.funnel.map((f) => (
              <li key={f.id} className="grid grid-cols-[110px_1fr_28px] items-center gap-3 text-sm sm:grid-cols-[130px_1fr_28px]">
                <span className="font-medium text-ink">{f.label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-cloud"><span className={`block h-full rounded-full ${f.dot}`} style={{ width: `${(f.n / maxN) * 100}%` }} /></span>
                <span className="text-right font-semibold text-ink">{f.n}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">What autopilot did</h2><Link href="/automations" className="text-sm font-semibold text-teal-d hover:underline">See all</Link></div>
          {log.length === 0 ? <p className="text-muted">Add a lead to see it work.</p> : (
            <ol className="space-y-3">
              {log.map((l) => {
                const c = (() => { const d = data.deals.find((x) => x.id === l.deal_id); return d?.contact_id ? contactById.get(d.contact_id) : null; })();
                return (
                  <li key={l.id} className="flex gap-3 text-sm">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${toneDot[l.tone]}`} />
                    <div className="min-w-0 flex-1"><div className="text-ink">{l.message}</div><div className="text-[12.5px] text-muted">{c ? `${c.name} · ` : ""}{timeAgo(l.created_at)}</div></div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">Which lead sources pay off</h2>
        <p className="mb-4 text-sm text-muted">So you know where to spend your ad money.</p>
        <div className="-mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="border-b border-line text-[12.5px] uppercase tracking-wide text-muted"><th className="py-2 pr-3 font-semibold">Source</th><th className="px-2 font-semibold">Leads</th><th className="px-2 font-semibold">Visits</th><th className="px-2 font-semibold">Quotes</th><th className="px-2 font-semibold">Won</th><th className="px-2 font-semibold">Close rate</th><th className="pl-2 text-right font-semibold">Revenue</th></tr></thead>
            <tbody className="divide-y divide-line">
              {v.sources.map((s) => (
                <tr key={s.src}><td className="py-2.5 pr-3 font-semibold text-ink">{s.src}</td><td className="px-2">{s.leads}</td><td className="px-2">{s.visits}</td><td className="px-2">{s.quotes}</td><td className="px-2">{s.won}</td><td className="px-2">{s.rate}%</td><td className="pl-2 text-right font-display font-semibold text-ink">{money(s.revenue)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <h2 className="mb-1 text-lg font-semibold">Your to-do list</h2>
          {dueNow.length === 0 && v.later.length === 0 && <p className="py-4 text-muted">You&apos;re all caught up.</p>}
          <ul className="divide-y divide-line">
            {[...dueNow, ...v.later].map((t) => {
              const c = t.contact_id ? contactById.get(t.contact_id) : null;
              const late = !!t.due_date && t.due_date < today;
              return (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <button onClick={() => update("tasks", t.id, { done: true })} aria-label={`Mark “${t.title}” done`} className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-[#cfd6e6] text-transparent transition hover:border-teal hover:bg-teal-t hover:text-teal"><Icon name="check" className="size-3.5" /></button>
                  <div className="min-w-0 flex-1"><div className="truncate font-medium text-ink">{t.title}</div>{c && <Link href={`/contacts/${c.id}`} className="text-[13px] text-muted hover:text-teal-d hover:underline">{c.name}</Link>}</div>
                  <span className={`shrink-0 text-[13px] font-semibold ${late ? "text-rose" : "text-muted"}`}>{dueLabel(t.due_date)}</span>
                </li>
              );
            })}
          </ul>
          <form onSubmit={addQuick} className="mt-4 flex gap-2">
            <input className="field" value={quickTask} onChange={(e) => setQuickTask(e.target.value)} placeholder="Add a task for today and press Enter" aria-label="New task" />
            <Button type="submit" variant="soft" icon="plus" aria-label="Add task" className="!px-4"><span className="sr-only">Add</span></Button>
          </form>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Gone quiet</h2><Badge tone="sun">{v.stale.length}</Badge></div>
            {v.stale.length === 0 ? <p className="text-muted">Every job has moved recently.</p> : (
              <ul className="space-y-2.5">{v.stale.map(({ deal, days }) => (
                <li key={deal.id}><Link href={`/pipeline?deal=${deal.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 transition hover:bg-cloud">
                  <span className="min-w-0"><span className="block truncate font-semibold text-ink">{contactById.get(deal.contact_id ?? "")?.name ?? deal.title}</span><span className="block truncate text-[13px] text-muted">{deal.project} · {money(deal.value)}</span></span>
                  <span className="shrink-0 text-[13px] font-semibold text-[#9a5a00]">{days}d</span></Link></li>
              ))}</ul>
            )}
          </Card>
          <Card className="!border-transparent bg-gradient-to-br from-white to-iris-t/50">
            <div className="mb-2 flex items-center gap-2"><Icon name="sparkle" className="size-5 text-iris" /><h2 className="text-lg font-semibold">AI helper</h2></div>
            {!ai ? (<><p className="mb-4 text-muted">Get three quick suggestions based on your tasks and jobs.</p><AiButton onClick={suggest} busy={aiBusy}>What should I do today?</AiButton></>) : (
              <>
                <ul className="mb-3 space-y-2.5">{ai.items.map((x, i) => <li key={i} className="flex gap-2.5"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-iris text-[11px] font-bold text-white">{i + 1}</span><span className="text-ink">{x}</span></li>)}</ul>
                {!ai.live && <p className="mb-3 text-[13px] text-muted">Sample suggestions. Add an Anthropic API key for personalised ones.</p>}
                <button onClick={suggest} className="text-sm font-semibold text-teal-d hover:underline" disabled={aiBusy}>{aiBusy ? "Thinking…" : "Refresh"}</button>
              </>
            )}
          </Card>
        </div>
      </div>

      {modal === "lead" && <NewLeadModal onClose={() => setModal(null)} />}
      {modal === "contact" && <AddContactModal onClose={() => setModal(null)} />}
      {modal === "import" && <ImportModal onClose={() => setModal(null)} />}
    </div>
  );
}
