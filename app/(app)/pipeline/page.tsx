"use client";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DealModal } from "@/components/DealModal";
import { BookVisitModal, LostModal, NewLeadModal, QuoteModal, VisitResultModal } from "@/components/flowModals";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, Button, Card, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { useFlow } from "@/lib/flow";
import { money } from "@/lib/format";
import { useStages } from "@/lib/useStages";
import { PRIORITIES, columnOf, pipelineOf, weighted, type PStage } from "@/lib/pipelines";
import type { Deal, Visit } from "@/lib/types";

type Pending = { kind: "visit" | "result" | "quote" | "lost"; deal: Deal; visit?: Visit };
type Sort = "name" | "value" | "close" | "stage" | "owner" | "created";
const DAY = 86_400_000;
const short = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
const compact = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `$${Math.round(n / 1000)}k` : money(n));

function Board() {
  const { data, me, can, team, update, toast } = useCrm();
  const { pipelines } = useStages();
  const flow = useFlow();
  const router = useRouter();
  const sp = useSearchParams();
  const openId = sp.get("deal");
  const [pid, setPid] = useState(pipelines[0].id);
  const pipe = pipelines.find((p) => p.id === pid) ?? pipelines[0];
  const [view, setView] = useState<"board" | "table">("board");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState(() => (can("seeAll") ? "" : "_me"));
  const [sel, setSel] = useState<string[]>([]);
  const [prio, setPrio] = useState("");
  const [showClosed, setShowClosed] = useState(true);
  const [sort, setSort] = useState<{ by: Sort; dir: 1 | -1 }>({ by: "created", dir: -1 });
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [now] = useState(() => Date.now());
  const today = new Date(now).toISOString().slice(0, 10);
  const contacts = useMemo(() => new Map(data.contacts.map((c) => [c.id, c])), [data.contacts]);
  const owners = [...new Set([...team, ...data.deals.map((d) => d.rep)].filter(Boolean))].sort();

  const deals = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.deals.filter((d) => {
      if (pipelineOf(d, pipelines).id !== pipe.id) return false;
      if (owner && (owner === "_none" ? d.rep : owner === "_me" ? d.rep !== me.name : d.rep !== owner)) return false;
      if (prio && d.priority !== prio) return false;
      if (!s) return true;
      const c = d.contact_id ? contacts.get(d.contact_id) : null;
      return [d.title, d.project, d.source, c?.name ?? "", c?.company ?? "", c?.email ?? ""].some((v) => v.toLowerCase().includes(s));
    });
  }, [data.deals, pipelines, pipe.id, owner, prio, q, contacts, me.name]);

  const stats = useMemo(() => {
    const open = deals.filter((d) => columnOf(d, pipelines).kind === "open");
    const month = today.slice(0, 7);
    const won = deals.filter((d) => columnOf(d, pipelines).kind === "won");
    const lost = deals.filter((d) => columnOf(d, pipelines).kind === "lost");
    const recent = (d: Deal) => now - new Date(d.stage_at).getTime() < 90 * DAY;
    const wr = won.filter(recent).length, lr = lost.filter(recent).length;
    return {
      open: open.length, value: open.reduce((a, d) => a + (d.value || 0), 0), forecast: open.reduce((a, d) => a + weighted(d, pipelines), 0),
      closing: open.filter((d) => d.close_date?.startsWith(month)).reduce((a, d) => a + (d.value || 0), 0),
      wonMonth: won.filter((d) => d.stage_at.startsWith(month)).reduce((a, d) => a + (d.value || 0), 0),
      winRate: wr + lr ? Math.round((wr / (wr + lr)) * 100) : null,
    };
  }, [deals, pipelines, today, now]);

  const nextVisit = (id: string) => data.visits.filter((v) => v.deal_id === id && v.status === "scheduled").sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

  function drop(deal: Deal, to: PStage) {
    if (columnOf(deal, pipelines).id === to.id) return;
    if (to.kind === "lost") return setPending({ kind: "lost", deal });
    if (to.kind === "won") return void (to.id === "completed" ? flow.complete(deal) : flow.markWon(deal, undefined, to.id));
    if (to.id === "visit_booked") return setPending({ kind: "visit", deal });
    if (to.id === "quoted") return setPending({ kind: "quote", deal });
    if (to.id === "visit_done") { const v = nextVisit(deal.id); if (v) return setPending({ kind: "result", deal, visit: v }); }
    void flow.moveSimple(deal, to.id);
  }

  const card = (d: Deal) => {
    const c = d.contact_id ? contacts.get(d.contact_id) : null;
    const v = nextVisit(d.id);
    const overdue = d.close_date && d.close_date < today && columnOf(d, pipelines).kind === "open";
    const days = Math.floor((now - new Date(d.stage_at).getTime()) / DAY);
    const p = PRIORITIES.find((x) => x.id === d.priority);
    return (
      <li key={d.id} draggable onDragStart={() => setDrag(d.id)} onDragEnd={() => { setDrag(null); setOver(null); }}
        className={`cursor-grab rounded-2xl border border-line bg-white p-3.5 shadow-[0_1px_2px_rgba(17,26,46,.04)] transition hover:border-[#cfd6e6] hover:shadow-md active:cursor-grabbing ${drag === d.id ? "opacity-40" : ""}`}>
        <button onClick={() => router.push(`/pipeline?deal=${d.id}`)} className="block w-full text-left">
          <div className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 font-semibold leading-snug text-ink">{d.title}</span>
            {p && <span className={`mt-1 size-2 shrink-0 rounded-full ${p.id === "high" ? "bg-rose" : p.id === "medium" ? "bg-sun" : "bg-[#b3bdd2]"}`} title={`${p.label} priority`} />}
          </div>
          <div className="mt-0.5 truncate text-[13px] text-muted">{c ? `${c.name}${c.company ? ` · ${c.company}` : ""}` : "No contact"}</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="font-display text-[15px] font-semibold text-ink">{d.value ? money(d.value) : <span className="text-[13px] font-medium text-muted">No amount</span>}</span>
            {d.close_date && <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${overdue ? "bg-rose-t text-rose" : "bg-cloud text-body"}`}>{overdue ? "Overdue " : ""}{short(d.close_date)}</span>}
          </div>
          {v && <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-sun-t px-2.5 py-0.5 text-xs font-semibold text-[#9a5a00]"><Icon name="calendar" className="size-3" />{new Date(v.starts_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</div>}
        </button>
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2 text-[12px] text-muted">
          <span className="flex min-w-0 items-center gap-1.5">{d.rep ? <><Avatar name={d.rep} size="size-5 text-[9px]" /><span className="truncate">{d.rep}</span></> : "Unassigned"}</span>
          <span title="Days in this stage">{days}d</span>
        </div>
      </li>
    );
  };

  const sorted = useMemo(() => {
    const val = (d: Deal) => sort.by === "name" ? d.title.toLowerCase() : sort.by === "value" ? d.value || 0 : sort.by === "close" ? d.close_date ?? "9999" : sort.by === "stage" ? pipe.stages.indexOf(columnOf(d, pipelines)) : sort.by === "owner" ? d.rep : d.created_at;
    return [...deals].filter((d) => showClosed || columnOf(d, pipelines).kind === "open").sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [deals, sort, pipe.stages, pipelines, showClosed]);
  const th = (by: Sort, label: string, right = false) => (
    <th className={`px-3 py-3 font-semibold ${right ? "text-right" : ""}`}><button type="button" onClick={() => setSort({ by, dir: sort.by === by ? (sort.dir === 1 ? -1 : 1) : 1 })} className="inline-flex items-center gap-1 hover:text-ink">{label}{sort.by === by && <span aria-hidden>{sort.dir === 1 ? "↑" : "↓"}</span>}</button></th>
  );

  const columns = pipe.stages.filter((s) => showClosed || s.kind === "open");

  return (
    <div className="space-y-5">
      <PageHeader title="Deals" sub="Track every opportunity from first contact to closed." action={<Button icon="plus" onClick={() => setAdding(true)}>Create deal</Button>} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[["Open deals", String(stats.open)], ["Pipeline value", compact(stats.value)], ["Weighted forecast", compact(Math.round(stats.forecast))], ["Closing this month", compact(stats.closing)], ["Win rate (90 days)", stats.winRate === null ? "–" : `${stats.winRate}%`]].map(([l, v]) => (
          <Card key={l} className="!p-4"><div className="text-[13px] font-medium text-muted">{l}</div><div className="mt-0.5 font-display text-2xl font-semibold text-ink">{v}</div></Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {pipelines.length > 1 && <select className="field !h-10 !w-auto !py-0 font-semibold" aria-label="Pipeline" value={pipe.id} onChange={(e) => setPid(e.target.value)}>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs"><Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field !h-10 !py-0 !pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deals" aria-label="Search deals" /></div>
        <select className="field !h-10 !w-auto !py-0" aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">All owners</option><option value="_me">My deals</option><option value="_none">Unassigned</option>{owners.map((o) => <option key={o}>{o}</option>)}</select>
        <select className="field !h-10 !w-auto !py-0" aria-label="Priority" value={prio} onChange={(e) => setPrio(e.target.value)}><option value="">Any priority</option>{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        <label className="flex items-center gap-2 px-1 text-sm font-medium text-body"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />Show closed</label>
        <div className="ml-auto inline-flex rounded-full bg-white p-1 ring-1 ring-line" role="tablist" aria-label="View">
          {(["board", "table"] as const).map((v) => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${view === v ? "bg-ink text-white" : "text-body hover:bg-cloud"}`}>{v}</button>)}
        </div>
      </div>

      {view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
          <div className="grid min-w-max grid-flow-col auto-cols-[272px] gap-3">
            {columns.map((s) => {
              const list = deals.filter((d) => columnOf(d, pipelines).id === s.id).sort((a, b) => b.stage_at.localeCompare(a.stage_at));
              const sum = list.reduce((a, d) => a + (d.value || 0), 0);
              return (
                <section key={s.id} aria-label={s.label}
                  onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                  onDrop={() => { const d = data.deals.find((x) => x.id === drag); if (d) drop(d, s); setDrag(null); setOver(null); }}
                  className={`flex min-h-[420px] flex-col rounded-3xl border p-2.5 transition ${over === s.id ? "border-teal bg-teal-t/50" : "border-line bg-[#f8f9fc]"}`}>
                  <header className={`mb-2.5 rounded-2xl border-t-[3px] bg-white px-3 py-2.5 ${s.kind === "won" ? "border-emerald-500" : s.kind === "lost" ? "border-slate-400" : "border-teal"}`}>
                    <div className="flex items-center gap-2"><h2 className="truncate text-[14px] font-semibold text-ink">{s.label}</h2><span className="ml-auto rounded-full bg-cloud px-2 py-0.5 text-xs font-bold text-body">{list.length}</span></div>
                    <div className="mt-0.5 flex items-center justify-between text-[12.5px] text-muted"><span className="font-semibold text-ink">{money(sum)}</span>{s.kind === "open" && <span title="Weighted by the stage's win probability">{s.prob}% · {compact(Math.round(sum * s.prob / 100))}</span>}</div>
                  </header>
                  <ul className="flex flex-1 flex-col gap-2">{list.map(card)}</ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <>
        {sel.length > 0 && (
          <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-sm text-white shadow-lg">
            <span className="font-semibold">{sel.length} selected</span>
            {can("assign") && <select className="h-9 rounded-full border-0 bg-white/10 px-3 text-sm font-semibold text-white [&>option]:text-ink" aria-label="Assign to" value="" onChange={async (e) => { const n = e.target.value === "_none" ? "" : e.target.value; for (const id of sel) await update("deals", id, { rep: n }); toast(`${sel.length} deal${sel.length === 1 ? "" : "s"} ${n ? `assigned to ${n}` : "unassigned"}`); setSel([]); }}><option value="" disabled>Assign to…</option><option value="_none">Nobody</option>{team.map((n) => <option key={n}>{n}</option>)}</select>}
            {can("write") && <select className="h-9 rounded-full border-0 bg-white/10 px-3 text-sm font-semibold text-white [&>option]:text-ink" aria-label="Set priority" value="" onChange={async (e) => { for (const id of sel) await update("deals", id, { priority: e.target.value }); toast("Priority updated"); setSel([]); }}><option value="" disabled>Set priority…</option>{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>}
            <button onClick={() => setSel([])} className="ml-auto rounded-full px-3 py-1.5 font-semibold hover:bg-white/15">Clear</button>
          </div>
        )}
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-line bg-[#f8f9fc] text-left text-[13px] text-muted"><tr><th className="w-10 py-3 pl-4"><input type="checkbox" aria-label="Select all" className="size-4 accent-[#0b8a8a]" checked={sorted.length > 0 && sorted.every((d) => sel.includes(d.id))} onChange={(e) => setSel(e.target.checked ? sorted.map((d) => d.id) : [])} /></th>{th("name", "Deal")}<th className="px-3 py-3 font-semibold">Contact</th>{th("stage", "Stage")}{th("value", "Amount", true)}{th("close", "Close date")}{th("owner", "Owner")}<th className="px-3 py-3 font-semibold">Source</th>{th("created", "Created")}</tr></thead>
              <tbody className="divide-y divide-line">
                {sorted.length === 0 && <tr><td colSpan={9} className="px-5 py-8 text-center text-muted">No deals match.</td></tr>}
                {sorted.map((d) => {
                  const c = d.contact_id ? contacts.get(d.contact_id) : null, st = columnOf(d, pipelines);
                  const overdue = d.close_date && d.close_date < today && st.kind === "open";
                  return (
                    <tr key={d.id} className={`cursor-pointer hover:bg-cloud ${sel.includes(d.id) ? "bg-teal-t/30" : ""}`} onClick={() => router.push(`/pipeline?deal=${d.id}`)}>
                      <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${d.title}`} className="size-4 accent-[#0b8a8a]" checked={sel.includes(d.id)} onChange={() => setSel(sel.includes(d.id) ? sel.filter((x) => x !== d.id) : [...sel, d.id])} /></td>
                      <td className="px-3 py-3"><div className="font-semibold text-ink">{d.title}</div>{d.project && <div className="text-[12.5px] text-muted">{d.project}</div>}</td>
                      <td className="px-3 py-3">{c ? <Link href={`/contacts/${c.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-teal-d hover:underline">{c.name}</Link> : "–"}{c?.company && <div className="text-[12.5px] text-muted">{c.company}</div>}</td>
                      <td className="px-3 py-3"><Badge tone={st.kind === "won" ? "green" : st.kind === "lost" ? "gray" : "iris"}>{st.label}</Badge></td>
                      <td className="px-3 py-3 text-right font-semibold text-ink">{d.value ? money(d.value) : "–"}</td>
                      <td className={`px-3 py-3 ${overdue ? "font-semibold text-rose" : ""}`}>{d.close_date ? short(d.close_date) : "–"}</td>
                      <td className="px-3 py-3">{d.rep || <span className="text-muted">Unassigned</span>}</td>
                      <td className="px-3 py-3 text-muted">{d.source || "–"}</td>
                      <td className="px-3 py-3 text-muted">{new Date(d.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                    </tr>
                  );
                })}
              </tbody>
              {sorted.length > 0 && <tfoot className="border-t border-line bg-[#f8f9fc] text-sm"><tr><td className="px-3 py-3 font-semibold" colSpan={4}>{sorted.length} deal{sorted.length === 1 ? "" : "s"}</td><td className="px-3 py-3 text-right font-semibold">{money(sorted.reduce((a, d) => a + (d.value || 0), 0))}</td><td colSpan={4} /></tr></tfoot>}
            </table>
          </div>
        </Card>
        </>
      )}

      {adding && <NewLeadModal pipelineId={pipe.id} onClose={() => setAdding(false)} />}
      {openId && <DealModal dealId={openId} onClose={() => router.replace("/pipeline")} />}
      {pending?.kind === "visit" && <BookVisitModal deal={pending.deal} onClose={() => setPending(null)} />}
      {pending?.kind === "result" && pending.visit && <VisitResultModal visit={pending.visit} onClose={() => setPending(null)} />}
      {pending?.kind === "quote" && <QuoteModal deal={pending.deal} onClose={() => setPending(null)} />}
      {pending?.kind === "lost" && <LostModal deal={pending.deal} onClose={() => setPending(null)} />}
    </div>
  );
}

export default function PipelinePage() {
  return <Suspense><Board /></Suspense>;
}
