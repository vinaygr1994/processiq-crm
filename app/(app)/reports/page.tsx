"use client";
import { useMemo, useState } from "react";
import { Card, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { useStages } from "@/lib/useStages";
import { money } from "@/lib/format";
import { columnOf, pipelineOf, weighted } from "@/lib/pipelines";

const DAY = 86_400_000;
const RANGES = [["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last 12 months"], ["ytd", "This year"]] as const;
const compact = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `$${Math.round(n / 1000)}k` : money(Math.round(n)));
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

function Bars({ rows, fmt = compact, label }: { rows: { k: string; v: number; v2?: number }[]; fmt?: (n: number) => string; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="flex h-48 items-end gap-2" role="img" aria-label={`${label}: ${rows.map((r) => `${r.k} ${fmt(r.v)}`).join(", ")}`}>
      {rows.map((r) => (
        <div key={r.k} className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-[11px] font-semibold text-ink opacity-0 transition group-hover:opacity-100">{fmt(r.v)}</span>
          <div className="relative w-full overflow-hidden rounded-t-lg bg-teal/15" style={{ height: `${Math.max(2, (r.v / max) * 100)}%` }}>
            {r.v2 !== undefined && <div className="absolute inset-x-0 bottom-0 bg-teal" style={{ height: `${r.v ? (r.v2 / r.v) * 100 : 0}%` }} />}
            {r.v2 === undefined && <div className="absolute inset-0 bg-teal" />}
          </div>
          <span className="text-[11px] text-muted">{r.k}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const { data } = useCrm();
  const { pipelines } = useStages();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("90");
  const [now] = useState(() => Date.now());
  const from = range === "ytd" ? new Date(new Date(now).getFullYear(), 0, 1).getTime() : now - Number(range) * DAY;

  const r = useMemo(() => {
    const kind = (d: (typeof data.deals)[number]) => columnOf(d, pipelines).kind;
    const inRange = (iso: string) => +new Date(iso) >= from;
    const won = data.deals.filter((d) => kind(d) === "won" && inRange(d.stage_at));
    const lost = data.deals.filter((d) => kind(d) === "lost" && inRange(d.stage_at));
    const created = data.deals.filter((d) => inRange(d.created_at));
    const open = data.deals.filter((d) => kind(d) === "open");
    const revenue = won.reduce((a, d) => a + (d.value || 0), 0);
    const cycle = won.length ? Math.round(won.reduce((a, d) => a + (+new Date(d.stage_at) - +new Date(d.created_at)), 0) / won.length / DAY) : null;

    const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth() - (11 - i)); return d; });
    const byMonth = months.map((m) => {
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
      return { k: m.toLocaleDateString(undefined, { month: "short" }), v: data.deals.filter((d) => kind(d) === "won" && d.stage_at.startsWith(key)).reduce((a, d) => a + (d.value || 0), 0) };
    });
    const ahead = Array.from({ length: 6 }, (_, i) => { const d = new Date(now); d.setDate(1); d.setMonth(d.getMonth() + i); return d; });
    const forecast = ahead.map((m) => {
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
      const list = open.filter((d) => (d.close_date ?? "").startsWith(key));
      return { k: m.toLocaleDateString(undefined, { month: "short" }), v: list.reduce((a, d) => a + (d.value || 0), 0), v2: list.reduce((a, d) => a + weighted(d, pipelines), 0) };
    });
    const noDate = open.filter((d) => !d.close_date);

    const main = pipelines[0];
    const funnel = main.stages.filter((s) => s.kind === "open").map((s) => {
      const list = open.filter((d) => pipelineOf(d, pipelines).id === main.id && columnOf(d, pipelines).id === s.id);
      return { s, n: list.length, v: list.reduce((a, d) => a + (d.value || 0), 0), w: list.reduce((a, d) => a + weighted(d, pipelines), 0) };
    });

    const group = (key: (d: (typeof data.deals)[number]) => string) => {
      const m = new Map<string, { created: number; won: number; lost: number; revenue: number; open: number }>();
      for (const d of data.deals) {
        const k = key(d) || "Not set", e = m.get(k) ?? { created: 0, won: 0, lost: 0, revenue: 0, open: 0 };
        if (inRange(d.created_at)) e.created++;
        if (kind(d) === "won" && inRange(d.stage_at)) { e.won++; e.revenue += d.value || 0; }
        if (kind(d) === "lost" && inRange(d.stage_at)) e.lost++;
        if (kind(d) === "open") e.open += d.value || 0;
        m.set(k, e);
      }
      return [...m.entries()].filter(([, e]) => e.created || e.won || e.lost || e.open).sort((a, b) => b[1].revenue - a[1].revenue || b[1].created - a[1].created);
    };
    const reasons = new Map<string, number>();
    lost.forEach((d) => reasons.set(d.lost_reason || "No reason given", (reasons.get(d.lost_reason || "No reason given") ?? 0) + 1));

    const emails = data.emails.filter((e) => e.status !== "failed" && inRange(e.created_at)).length;
    const meetings = data.visits.filter((v) => v.status === "done" && inRange(v.starts_at)).length + data.bookings.filter((b) => b.status === "checked_in" && inRange(b.starts_at)).length;
    const tasksDone = data.tasks.filter((t) => t.done && inRange(t.created_at)).length;
    const calls = data.activities.filter((a) => a.kind === "call" && inRange(a.created_at)).length;

    return { won, lost, created, revenue, cycle, byMonth, forecast, noDate, funnel, sources: group((d) => d.source), reps: group((d) => d.rep), reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]), emails, meetings, tasksDone, calls,
      pipeline: open.reduce((a, d) => a + (d.value || 0), 0), weightedTotal: open.reduce((a, d) => a + weighted(d, pipelines), 0) };
  }, [data, pipelines, from, now]);

  const fmax = Math.max(1, ...r.funnel.map((f) => f.v));
  const table = (rows: [string, { created: number; won: number; lost: number; revenue: number; open: number }][], first: string) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="border-b border-line text-left text-[13px] text-muted"><tr><th className="py-2.5 pr-3 font-semibold">{first}</th><th className="px-3 py-2.5 text-right font-semibold">New deals</th><th className="px-3 py-2.5 text-right font-semibold">Won</th><th className="px-3 py-2.5 text-right font-semibold">Win rate</th><th className="px-3 py-2.5 text-right font-semibold">Revenue</th><th className="py-2.5 pl-3 text-right font-semibold">Open pipeline</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.length === 0 && <tr><td colSpan={6} className="py-4 text-muted">No data in this period.</td></tr>}
          {rows.map(([k, e]) => <tr key={k}><td className="py-2.5 pr-3 font-semibold text-ink">{k}</td><td className="px-3 py-2.5 text-right">{e.created}</td><td className="px-3 py-2.5 text-right">{e.won}</td><td className="px-3 py-2.5 text-right">{pct(e.won, e.won + e.lost)}</td><td className="px-3 py-2.5 text-right font-semibold">{money(e.revenue)}</td><td className="py-2.5 pl-3 text-right">{money(e.open)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" sub="Sales performance, forecast and team activity."
        action={<select className="field !h-11 !w-auto font-semibold" aria-label="Date range" value={range} onChange={(e) => setRange(e.target.value as typeof range)}>{RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>} />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[["Revenue won", compact(r.revenue)], ["Deals won", String(r.won.length)], ["Win rate", pct(r.won.length, r.won.length + r.lost.length)], ["Average deal", r.won.length ? compact(r.revenue / r.won.length) : "–"], ["Sales cycle", r.cycle === null ? "–" : `${r.cycle} days`], ["New deals", String(r.created.length)]].map(([l, v]) => (
          <Card key={l} className="!p-4"><div className="text-[13px] font-medium text-muted">{l}</div><div className="mt-0.5 font-display text-2xl font-semibold text-ink">{v}</div></Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Revenue won by month</h2><span className="text-[13px] text-muted">Last 12 months</span></div><Bars rows={r.byMonth} label="Revenue won by month" /></Card>
        <Card>
          <div className="mb-1 flex items-center justify-between"><h2 className="font-semibold">Forecast by expected close</h2><span className="text-[13px] text-muted">Next 6 months</span></div>
          <p className="mb-3 text-[13px] text-muted"><span className="mr-1 inline-block size-2.5 rounded-sm bg-teal align-middle" />Weighted <span className="ml-3 mr-1 inline-block size-2.5 rounded-sm bg-teal/20 align-middle" />Total{r.noDate.length ? ` · ${r.noDate.length} open deal${r.noDate.length === 1 ? " has" : "s have"} no close date` : ""}</p>
          <Bars rows={r.forecast} label="Forecast by month" />
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">Pipeline: {pipelines[0].name}</h2><span className="text-sm text-muted">{compact(r.pipeline)} open · {compact(r.weightedTotal)} weighted</span></div>
        <ul className="space-y-2.5">
          {r.funnel.map((f) => (
            <li key={f.s.id} className="grid grid-cols-[140px_1fr_150px] items-center gap-3 text-sm">
              <span className="truncate font-medium text-ink">{f.s.label} <span className="text-muted">({f.n})</span></span>
              <span className="h-3 overflow-hidden rounded-full bg-cloud"><span className="block h-full rounded-full bg-gradient-to-r from-teal to-iris" style={{ width: `${(f.v / fmax) * 100}%` }} /></span>
              <span className="text-right"><span className="font-semibold text-ink">{money(f.v)}</span> <span className="text-[12px] text-muted">{f.s.prob}%</span></span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card><h2 className="mb-3 font-semibold">Lead sources</h2>{table(r.sources, "Source")}</Card>
        <Card><h2 className="mb-3 font-semibold">Team performance</h2>{table(r.reps, "Owner")}</Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Why deals were lost</h2>
          {r.reasons.length === 0 ? <p className="text-sm text-muted">No lost deals in this period.</p> : (
            <ul className="space-y-2">{r.reasons.map(([k, n]) => <li key={k} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm"><span className="text-ink">{k}</span><span className="font-semibold">{n}</span><span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-cloud"><span className="block h-full bg-rose/70" style={{ width: `${(n / r.lost.length) * 100}%` }} /></span></li>)}</ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Activity</h2>
          <div className="grid grid-cols-2 gap-3">
            {[["Emails sent", r.emails], ["Meetings and visits held", r.meetings], ["Calls logged", r.calls], ["Tasks completed", r.tasksDone]].map(([l, v]) => <div key={l as string} className="rounded-2xl bg-cloud p-4"><div className="font-display text-2xl font-semibold text-ink">{v}</div><div className="text-[13px] text-muted">{l}</div></div>)}
          </div>
        </Card>
      </div>
    </div>
  );
}
