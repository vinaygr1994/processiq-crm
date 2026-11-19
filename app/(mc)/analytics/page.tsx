"use client";
// Analytics Builder: email, journey and subscriber reporting, like SFMC's Reports and Journey Analytics.
import { Fragment, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { DateRangePicker } from "@/components/DateRangePicker";
import { useCrm } from "@/lib/store";
import { resolveRange, type Custom, type RangeId } from "@/lib/dateRange";
import { nowMs } from "@/lib/clock";
import { toCsv } from "@/lib/csv";
import type { EmailLog } from "@/lib/types";

type Tab = "overview" | "emails" | "journeys" | "subscribers";
const TABS: [Tab, string][] = [["overview", "Overview"], ["emails", "Email performance"], ["journeys", "Journey performance"], ["subscribers", "Subscriber health"]];
const DAY = 86_400_000;
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(a / b < 0.1 && a ? 1 : 0)}%` : "–");
const opened = (e: EmailLog) => !!(e.opened_at || e.clicked_at);

interface Stat { sent: number; failed: number; opens: number; clicks: number }
const zero = (): Stat => ({ sent: 0, failed: 0, opens: 0, clicks: 0 });
function tally(s: Stat, e: EmailLog) {
  if (e.status === "failed") { s.failed++; return; }
  s.sent++;
  if (opened(e)) s.opens++;
  if (e.clicked_at) s.clicks++;
}

function download(name: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Kpi({ label, value, note, tone }: { label: string; value: string | number; note?: string; tone?: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-white px-4 py-3.5">
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className={`mt-1 text-[24px] font-semibold leading-none tabular-nums ${tone ?? "text-ink"}`}>{value}</div>
      {note && <div className="mt-1.5 text-[12px] text-muted">{note}</div>}
    </div>
  );
}

/** Sent (light), opened (teal) and clicked (iris) per day or week. */
function Trend({ rows }: { rows: { k: string; sent: number; opens: number; clicks: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.sent));
  const every = Math.ceil(rows.length / 10);
  return (
    <div>
      <div className="flex h-44 items-end gap-[3px]" role="img" aria-label={`Sends over time: ${rows.map((r) => `${r.k} ${r.sent} sent, ${r.opens} opened`).join("; ")}`}>
        {rows.map((r) => (
          <div key={r.k} className="group relative flex h-full flex-1 items-end" title={`${r.k}: ${r.sent} sent · ${r.opens} opened · ${r.clicks} clicked`}>
            <div className="relative w-full rounded-t-[3px] bg-[#e3e8f1]" style={{ height: `${r.sent ? Math.max(3, (r.sent / max) * 100) : 0}%` }}>
              <div className="absolute inset-x-0 bottom-0 rounded-t-[3px] bg-teal" style={{ height: `${r.sent ? (r.opens / r.sent) * 100 : 0}%` }} />
              <div className="absolute inset-x-0 bottom-0 bg-iris" style={{ height: `${r.sent ? (r.clicks / r.sent) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px] text-[10.5px] text-muted">{rows.map((r, i) => <span key={r.k} className="flex-1 truncate text-center">{i % every === 0 ? r.k : ""}</span>)}</div>
      <div className="mt-3 flex flex-wrap gap-4 text-[12.5px] text-muted">
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-[#e3e8f1]" />Sent</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-teal" />Opened</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-iris" />Clicked</span>
      </div>
    </div>
  );
}

function RateBar({ a, b, tone = "bg-teal" }: { a: number; b: number; tone?: string }) {
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eef1f6]"><div className={`h-full ${tone}`} style={{ width: `${b ? Math.min(100, (a / b) * 100) : 0}%` }} /></div>;
}

function ReportsInner() {
  const { data, reload } = useCrm();
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = TABS.some(([t]) => t === params.get("tab")) ? (params.get("tab") as Tab) : "overview";
  const [rangeId, setRangeId] = useState<RangeId>("30");
  const [custom, setCustom] = useState<Custom>({ from: "", to: "" });
  const [tests, setTests] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [now] = useState(() => nowMs());
  const range = resolveRange(rangeId, custom, now);

  const r = useMemo(() => {
    const inR = (iso?: string | null) => { if (!iso) return false; const t = +new Date(iso); return t >= range.from && t < range.to; };
    const inPrev = (iso: string) => { const t = +new Date(iso); return t >= range.prevFrom && t < range.from; };
    const keep = (e: EmailLog) => e.status !== "demo" && (tests || e.status !== "test");
    const emails = data.emails.filter((e) => keep(e) && inR(e.created_at));
    const prev = data.emails.filter((e) => keep(e) && inPrev(e.created_at));
    const total = zero(); emails.forEach((e) => tally(total, e));
    const before = zero(); prev.forEach((e) => tally(before, e));

    const runs = new Map(data.workflow_runs.map((x) => [x.id, x]));
    const wfs = new Map(data.workflows.map((w) => [w.id, w]));
    const camps = new Map(data.campaigns.map((c) => [c.id, c]));

    // One row per send: an Email Studio send, a journey email step, a test, or a one-off email from the CRM.
    type Row = Stat & { key: string; name: string; sub: string; type: "Send" | "Journey" | "Test" | "One-off"; last: string; href?: string };
    const rows = new Map<string, Row>();
    for (const e of emails) {
      const run = e.run_id ? runs.get(e.run_id) : undefined;
      const wf = run ? wfs.get(run.workflow_id) : undefined;
      const c = e.campaign_id ? camps.get(e.campaign_id) : undefined;
      const key = e.status === "test" ? `test:${e.subject}` : c ? `c:${c.id}` : wf ? `j:${wf.id}:${e.step_id ?? e.subject}` : `o:${e.subject}`;
      let row = rows.get(key);
      if (!row) {
        row = { ...zero(), key, last: e.created_at,
          name: c?.name || e.subject || "(no subject)",
          sub: e.status === "test" ? "Test send" : c ? e.subject : wf ? `${wf.name}` : "Sent from the CRM",
          type: e.status === "test" ? "Test" : c ? "Send" : wf ? "Journey" : "One-off",
          href: wf ? `/journeys/${wf.id}` : undefined };
        if (wf) row.name = e.subject;
        rows.set(key, row);
      }
      tally(row, e);
      if (e.created_at > row.last) row.last = e.created_at;
    }
    const sends = [...rows.values()].sort((a, b) => b.last.localeCompare(a.last));

    // Trend buckets: days for up to ~5 weeks, weeks beyond that.
    const end = Number.isFinite(range.to) ? range.to : now;
    const span = end - range.from, step = span > 35 * DAY ? 7 * DAY : DAY;
    const start = new Date(range.from); start.setHours(0, 0, 0, 0);
    const buckets: { k: string; from: number; sent: number; opens: number; clicks: number }[] = [];
    for (let t = +start; t < end && buckets.length < 120; t += step) buckets.push({ k: new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }), from: t, sent: 0, opens: 0, clicks: 0 });
    for (const e of emails) {
      if (e.status === "failed") continue;
      const t = +new Date(e.created_at);
      const b = buckets.findLast((x) => x.from <= t);
      if (b) { b.sent++; if (opened(e)) b.opens++; if (e.clicked_at) b.clicks++; }
    }

    // Journeys: who entered in the range, where they are now, and what their emails did.
    const journeys = data.workflows.map((w) => {
      const rs = data.workflow_runs.filter((x) => x.workflow_id === w.id && inR(x.created_at));
      const ids = new Set(data.workflow_runs.filter((x) => x.workflow_id === w.id).map((x) => x.id));
      const em = emails.filter((e) => e.run_id && ids.has(e.run_id));
      const st = zero(); em.forEach((e) => tally(st, e));
      const steps = new Map<string, Stat & { subject: string }>();
      for (const e of em) { const k = e.step_id ?? e.subject; const s = steps.get(k) ?? { ...zero(), subject: e.subject }; tally(s, e); steps.set(k, s); }
      const order = (w.steps.length ? JSON.stringify(w.steps) : "");
      const stepList = [...steps.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([k, s]) => ({ k, ...s }));
      return { w, entered: rs.length, active: rs.filter((x) => x.status === "active").length, done: rs.filter((x) => x.status === "done").length,
        goal: rs.filter((x) => x.status === "stopped" && /goal|exit/i.test(x.note)).length, stopped: rs.filter((x) => x.status === "stopped" && !/goal|exit/i.test(x.note)).length, ...st, steps: stepList };
    }).filter((j) => j.entered || j.sent || j.w.active).sort((a, b) => b.entered - a.entered || b.sent - a.sent);

    // Subscribers
    const withEmail = data.contacts.filter((c) => c.email);
    const status = (c: (typeof withEmail)[number]) => c.email_status === "bounced" ? "Bounced" : c.email_status === "complaint" ? "Complained" : c.unsubscribed ? "Unsubscribed" : "Active";
    const counts = { Active: 0, Unsubscribed: 0, Bounced: 0, Complained: 0 } as Record<string, number>;
    withEmail.forEach((c) => counts[status(c)]++);
    const unsubs = withEmail.filter((c) => c.unsubscribed && inR(c.unsub_at));
    const reasons = new Map<string, number>();
    unsubs.forEach((c) => { const k = c.unsub_reason?.trim() || "No reason given"; reasons.set(k, (reasons.get(k) ?? 0) + 1); });
    const newSubs = withEmail.filter((c) => inR(c.created_at)).length;
    return { total, before, sends, buckets, journeys, counts, subTotal: withEmail.length, unsubs: unsubs.length, reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]), newSubs, suppressed: data.suppressions.length };
  }, [data, range.from, range.to, range.prevFrom, tests, now]);

  const t = r.total, p = r.before;
  const delta = (a: number, b: number, bA: number, bB: number) => {
    if (!b || !bB) return undefined;
    const d = (a / b - bA / bB) * 100;
    return `${d >= 0 ? "+" : ""}${d.toFixed(1)} pts vs previous period`;
  };
  const setTab = (id: Tab) => router.replace(`/analytics?tab=${id}`);

  const exportEmails = () => download(`email-performance-${range.label.replace(/\s+/g, "-")}.csv`, [
    ["Email", "Detail", "Type", "Sent", "Failed", "Unique opens", "Open rate", "Unique clicks", "Click rate", "Click-to-open", "Last sent"],
    ...r.sends.map((s) => [s.name, s.sub, s.type, s.sent, s.failed, s.opens, pct(s.opens, s.sent), s.clicks, pct(s.clicks, s.sent), pct(s.clicks, s.opens), new Date(s.last).toLocaleString()]),
  ]);
  const exportJourneys = () => download(`journey-performance-${range.label.replace(/\s+/g, "-")}.csv`, [
    ["Journey", "Status", "Entered", "In journey", "Completed", "Exited (goal or exit criteria)", "Emails sent", "Open rate", "Click rate"],
    ...r.journeys.map((j) => [j.w.name, j.w.active ? "Running" : "Stopped", j.entered, j.active, j.done, j.goal, j.sent, pct(j.opens, j.sent), pct(j.clicks, j.sent)]),
  ]);

  return (
    <div>
      <PageHeader title="Reports" sub={`Email, journey and subscriber results for ${range.label}.`}
        action={<div className="flex flex-wrap items-center gap-2">
          <DateRangePicker id={rangeId} custom={custom} onId={setRangeId} onCustom={setCustom} />
          <label className="flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-[13px] text-ink"><input type="checkbox" checked={tests} onChange={(e) => setTests(e.target.checked)} />Include test sends</label>
          <button type="button" onClick={() => reload()} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-ink hover:bg-cloud">Refresh</button>
        </div>} />

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`pill -mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13.5px] font-semibold ${tab === id ? "border-teal-d text-teal-d" : "border-transparent text-muted hover:text-ink"}`}>{l}</button>)}
      </div>

      {tab === "overview" && (<div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Kpi label="Sent" value={t.sent} note={p.sent ? `${p.sent} in the previous period` : undefined} />
          <Kpi label="Delivered" value={pct(t.sent, t.sent + t.failed)} note={t.failed ? `${t.failed} failed` : "No failed sends"} />
          <Kpi label="Open rate" value={pct(t.opens, t.sent)} note={delta(t.opens, t.sent, p.opens, p.sent) ?? `${t.opens} unique opens`} tone="text-teal-d" />
          <Kpi label="Click rate" value={pct(t.clicks, t.sent)} note={delta(t.clicks, t.sent, p.clicks, p.sent) ?? `${t.clicks} unique clicks`} tone="text-iris" />
          <Kpi label="Click-to-open" value={pct(t.clicks, t.opens)} note="Clicks among people who opened" />
          <Kpi label="Unsubscribes" value={r.unsubs} note={pct(r.unsubs, t.sent) + " of sent"} tone={r.unsubs ? "text-rose" : undefined} />
        </div>
        <Card>
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Sends, opens and clicks</h2><span className="text-[12.5px] text-muted">{r.buckets.length && r.buckets[1] && r.buckets[1].from - r.buckets[0].from > DAY ? "By week" : "By day"}</span></div>
          {t.sent ? <Trend rows={r.buckets} /> : <Empty icon="chart" title="No emails sent in this period" text="Pick a longer date range, or send an email from Email Studio or a journey." />}
        </Card>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="!p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3"><h2 className="font-semibold">Top emails by open rate</h2><button onClick={() => setTab("emails")} className="text-[13px] font-semibold text-teal-d hover:underline">All emails</button></div>
            {r.sends.filter((s) => s.sent).length ? <ul className="divide-y divide-line">{[...r.sends].filter((s) => s.sent).sort((a, b) => b.opens / b.sent - a.opens / a.sent || b.sent - a.sent).slice(0, 5).map((s) => (
              <li key={s.key} className="px-5 py-3"><div className="flex items-baseline justify-between gap-3"><span className="truncate text-[14px] font-semibold text-ink">{s.name}</span><span className="shrink-0 text-[13px] tabular-nums text-ink">{pct(s.opens, s.sent)}</span></div>
                <div className="mt-1.5"><RateBar a={s.opens} b={s.sent} /></div><div className="mt-1 text-[12px] text-muted">{s.type} · {s.sent} sent · {s.clicks} clicked</div></li>
            ))}</ul> : <p className="px-5 py-6 text-sm text-muted">Nothing sent yet in this period.</p>}
          </Card>
          <Card className="!p-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3"><h2 className="font-semibold">Journeys</h2><button onClick={() => setTab("journeys")} className="text-[13px] font-semibold text-teal-d hover:underline">Journey performance</button></div>
            {r.journeys.length ? <ul className="divide-y divide-line">{r.journeys.slice(0, 5).map((j) => (
              <li key={j.w.id} className="flex items-center gap-3 px-5 py-3"><div className="min-w-0 flex-1"><div className="truncate text-[14px] font-semibold text-ink">{j.w.name}</div><div className="text-[12px] text-muted">{j.entered} entered · {j.active} in journey · {j.sent} emails · {pct(j.opens, j.sent)} opened</div></div>
                <Badge tone={j.w.active ? "green" : "gray"}>{j.w.active ? "Running" : "Stopped"}</Badge></li>
            ))}</ul> : <p className="px-5 py-6 text-sm text-muted">No journeys have run in this period.</p>}
          </Card>
        </div>
        <p className="text-[12.5px] text-muted">Opens are counted when an email&apos;s images load. Apple Mail Privacy Protection can open emails automatically, and some apps block images, so open rates are an estimate. Clicks are exact.</p>
      </div>)}

      {tab === "emails" && (r.sends.length === 0 ? <Card><Empty icon="mail" title="No emails in this period" text="Every send, journey email and one-off email shows up here with its opens and clicks." /></Card> : (
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3"><span className="text-[13px] text-muted">{r.sends.length} email{r.sends.length === 1 ? "" : "s"} · unique opens and clicks per person</span><button onClick={exportEmails} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal-d hover:underline"><Icon name="download" className="size-4" />Export CSV</button></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-[13.5px]">
            <thead className="bg-cloud text-[12px] font-semibold text-muted"><tr>
              <th className="px-5 py-2.5">Email</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5 text-right">Sent</th><th className="px-3 py-2.5 text-right">Opens</th><th className="w-32 px-3 py-2.5">Open rate</th><th className="px-3 py-2.5 text-right">Clicks</th><th className="px-3 py-2.5 text-right">Click rate</th><th className="px-5 py-2.5 text-right">Last sent</th>
            </tr></thead>
            <tbody className="divide-y divide-line">{r.sends.map((s) => (
              <tr key={s.key} className="align-top">
                <td className="max-w-[320px] px-5 py-3"><div className="truncate font-semibold text-ink">{s.href ? <Link href={s.href} className="hover:underline">{s.name}</Link> : s.name}</div><div className="truncate text-[12.5px] text-muted">{s.sub}</div></td>
                <td className="px-3 py-3"><Badge tone={s.type === "Journey" ? "iris" : s.type === "Send" ? "teal" : "gray"}>{s.type}</Badge></td>
                <td className="px-3 py-3 text-right tabular-nums">{s.sent}{s.failed ? <div className="text-[12px] text-rose">{s.failed} failed</div> : null}</td>
                <td className="px-3 py-3 text-right tabular-nums">{s.opens}</td>
                <td className="px-3 py-3"><div className="mb-1 tabular-nums">{pct(s.opens, s.sent)}</div><RateBar a={s.opens} b={s.sent} /></td>
                <td className="px-3 py-3 text-right tabular-nums">{s.clicks}</td>
                <td className="px-3 py-3 text-right tabular-nums">{pct(s.clicks, s.sent)}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right text-[12.5px] text-muted">{new Date(s.last).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
              </tr>))}</tbody>
          </table></div>
        </Card>))}

      {tab === "journeys" && (r.journeys.length === 0 ? <Card><Empty icon="route" title="No journey activity in this period" text="Activate a journey in Journey Builder and its entries, exits and email results appear here." action={<Link href="/journeys" className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-semibold text-white">Open Journey Builder</Link>} /></Card> : (
        <Card className="!p-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3"><span className="text-[13px] text-muted">Entries in this period. Select a journey to see each email.</span><button onClick={exportJourneys} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal-d hover:underline"><Icon name="download" className="size-4" />Export CSV</button></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-[13.5px]">
            <thead className="bg-cloud text-[12px] font-semibold text-muted"><tr>
              <th className="px-5 py-2.5">Journey</th><th className="px-3 py-2.5 text-right">Entered</th><th className="px-3 py-2.5 text-right">In journey</th><th className="px-3 py-2.5 text-right">Completed</th><th className="px-3 py-2.5 text-right">Exited early</th><th className="px-3 py-2.5 text-right">Emails sent</th><th className="px-3 py-2.5 text-right">Open rate</th><th className="px-5 py-2.5 text-right">Click rate</th>
            </tr></thead>
            <tbody className="divide-y divide-line">{r.journeys.map((j) => (
              <Fragment key={j.w.id}>
                <tr className="cursor-pointer hover:bg-cloud/60" onClick={() => setOpen(open === j.w.id ? null : j.w.id)} aria-expanded={open === j.w.id}>
                  <td className="px-5 py-3"><div className="flex items-center gap-2"><Icon name="down" className={`size-3.5 text-muted transition ${open === j.w.id ? "" : "-rotate-90"}`} /><span className="font-semibold text-ink">{j.w.name}{(j.w.trigger.version ?? 1) > 1 ? ` · v${j.w.trigger.version}` : ""}</span><Badge tone={j.w.active ? "green" : "gray"}>{j.w.active ? "Running" : "Stopped"}</Badge></div></td>
                  <td className="px-3 py-3 text-right tabular-nums">{j.entered}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{j.active}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{j.done}</td>
                  <td className="px-3 py-3 text-right tabular-nums" title="Left at a goal, exit criteria or an Exit activity">{j.goal}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{j.sent}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{pct(j.opens, j.sent)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{pct(j.clicks, j.sent)}</td>
                </tr>
                {open === j.w.id && <tr><td colSpan={8} className="bg-cloud/50 px-5 py-3">
                  {j.steps.length ? <ol className="space-y-2.5">{j.steps.map((s, i) => (
                    <li key={s.k} className="grid grid-cols-[24px_1fr_repeat(3,90px)] items-center gap-3 text-[13px]">
                      <span className="grid size-6 place-items-center rounded-full bg-iris-t text-[11.5px] font-semibold text-iris">{i + 1}</span>
                      <span className="truncate font-medium text-ink">{s.subject}</span>
                      <span className="text-right tabular-nums text-muted">{s.sent} sent</span>
                      <span className="text-right tabular-nums text-teal-d">{pct(s.opens, s.sent)} open</span>
                      <span className="text-right tabular-nums text-iris">{pct(s.clicks, s.sent)} click</span>
                    </li>))}</ol> : <p className="text-[13px] text-muted">No emails sent by this journey in this period.</p>}
                  <Link href={`/journeys/${j.w.id}`} className="mt-3 inline-block text-[13px] font-semibold text-teal-d hover:underline">Open in Journey Builder</Link>
                </td></tr>}
              </Fragment>))}</tbody>
          </table></div>
        </Card>))}

      {tab === "subscribers" && (<div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Contacts with email" value={r.subTotal} note={`${r.newSubs} added in this period`} />
          <Kpi label="Active" value={r.counts.Active} note={pct(r.counts.Active, r.subTotal) + " of contacts"} tone="text-teal-d" />
          <Kpi label="Unsubscribed" value={r.counts.Unsubscribed} note={`${r.unsubs} in this period`} />
          <Kpi label="Bounced" value={r.counts.Bounced} note="Hard bounces are never emailed again" tone={r.counts.Bounced ? "text-rose" : undefined} />
          <Kpi label="Spam complaints" value={r.counts.Complained} note={`${r.suppressed} on the suppression list`} tone={r.counts.Complained ? "text-rose" : undefined} />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-semibold">Subscriber status</h2>
            <div className="flex h-3 overflow-hidden rounded-full bg-[#eef1f6]">{(["Active", "Unsubscribed", "Bounced", "Complained"] as const).map((k, i) => <div key={k} className={["bg-teal", "bg-[#9aa6bd]", "bg-sun", "bg-rose"][i]} style={{ width: `${r.subTotal ? (r.counts[k] / r.subTotal) * 100 : 0}%` }} title={`${k}: ${r.counts[k]}`} />)}</div>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-[13px]">{(["Active", "Unsubscribed", "Bounced", "Complained"] as const).map((k, i) => <li key={k} className="flex items-center gap-2"><i className={`size-2.5 rounded-sm ${["bg-teal", "bg-[#9aa6bd]", "bg-sun", "bg-rose"][i]}`} />{k}<span className="ml-auto tabular-nums text-muted">{r.counts[k]}</span></li>)}</ul>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Why people unsubscribed</h2>
            {r.reasons.length ? <ul className="space-y-2.5">{r.reasons.map(([k, n]) => <li key={k}><div className="flex justify-between text-[13px]"><span className="text-ink">{k}</span><span className="tabular-nums text-muted">{n}</span></div><div className="mt-1"><RateBar a={n} b={r.unsubs} tone="bg-[#9aa6bd]" /></div></li>)}</ul>
              : <p className="text-sm text-muted">No unsubscribes in this period.</p>}
          </Card>
        </div>
        <p className="text-[13px] text-muted">Manage individual addresses in <Link href="/audience?tab=subscribers" className="font-semibold text-teal-d hover:underline">Contact Builder → All Subscribers</Link>.</p>
      </div>)}
    </div>
  );
}

export default function ReportsPage() {
  return <Suspense fallback={null}><ReportsInner /></Suspense>;
}
