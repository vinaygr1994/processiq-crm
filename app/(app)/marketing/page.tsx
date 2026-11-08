"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Card, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { isJourney, journeyStats } from "@/lib/journeys";
import { audienceText } from "@/lib/sendEmail";

const DAY = 86_400_000;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

export default function MarketingHome() {
  const { data } = useCrm();
  const [since] = useState(() => Date.now() - 30 * DAY);
  const m = useMemo(() => {
    const sent = data.emails.filter((e) => e.status !== "failed" && new Date(e.created_at).getTime() >= since);
    const opened = sent.filter((e) => e.opened_at || e.clicked_at).length, clicked = sent.filter((e) => e.clicked_at).length;
    const reachable = data.contacts.filter((c) => c.email && !c.unsubscribed).length;
    const unsub = data.contacts.filter((c) => c.unsubscribed).length;
    const days = Array.from({ length: 14 }, (_, i) => {
      const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (13 - i));
      const end = start.getTime() + DAY;
      return { d: start, n: data.emails.filter((e) => e.status !== "failed" && +new Date(e.created_at) >= +start && +new Date(e.created_at) < end).length };
    });
    return { sent: sent.length, opened, clicked, reachable, unsub, days };
  }, [data.emails, data.contacts, since]);
  const max = Math.max(1, ...m.days.map((d) => d.n));
  const journeys = data.workflows.filter(isJourney);
  const running = journeys.filter((j) => j.active);
  const sends = [...data.campaigns].sort((a, b) => (b.sent_at ?? b.created_at).localeCompare(a.sent_at ?? a.created_at)).slice(0, 5);

  const actions: [string, string, string, string][] = [
    ["/marketing/send", "Send an email", "To one person, a list or everyone", "send"],
    ["/journeys", "Build a journey", "Automated multi-step emails and texts", "route"],
    ["/emails?tab=templates", "Design a template", "Drag-and-drop email builder", "mail"],
    ["/marketing/forms", "Build a form", "Sign-ups and landing pages", "note"],
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Marketing" sub="Emails, lists, journeys and results in one place." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map(([href, t, s, icon]) => (
          <Link key={href} href={href} className="group flex items-start gap-3 rounded-3xl border border-line bg-white p-4 transition hover:border-teal hover:shadow-md">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-t text-teal-d"><Icon name={icon} className="size-5" /></span>
            <span><span className="block font-semibold text-ink group-hover:text-teal-d">{t}</span><span className="block text-[13px] text-muted">{s}</span></span>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["Emails sent", String(m.sent), "Last 30 days"], ["Open rate", pct(m.opened, m.sent), `${m.opened} opened`], ["Click rate", pct(m.clicked, m.sent), `${m.clicked} clicked`], ["Reachable contacts", String(m.reachable), `${m.unsub} unsubscribed`]].map(([l, v, s]) => (
          <Card key={l} className="!p-5"><div className="text-sm font-medium text-muted">{l}</div><div className="mt-1 font-display text-3xl font-semibold text-ink">{v}</div><div className="mt-0.5 text-[13px] text-muted">{s}</div></Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Emails sent per day</h2><span className="text-[13px] text-muted">Last 14 days</span></div>
          <div className="flex h-40 items-end gap-1.5" role="img" aria-label={`Emails sent per day over the last 14 days: ${m.days.map((d) => d.n).join(", ")}`}>
            {m.days.map((d, i) => (
              <div key={i} className="group relative flex flex-1 flex-col items-center justify-end">
                <span className="pointer-events-none absolute -top-6 hidden rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-white group-hover:block">{d.n}</span>
                <div className="w-full rounded-t-md bg-teal/80 transition group-hover:bg-teal" style={{ height: `${d.n ? Math.max(6, (d.n / max) * 100) : 2}%`, opacity: d.n ? 1 : 0.25 }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11.5px] text-muted"><span>{m.days[0].d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><span>Today</span></div>
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Journeys</h2><Link href="/journeys" className="text-sm font-semibold text-teal-d hover:underline">All journeys</Link></div>
          {journeys.length === 0 ? <p className="text-sm text-muted">No journeys yet. <Link href="/journeys" className="font-semibold text-teal-d hover:underline">Build your first one</Link>.</p> : (
            <ul className="divide-y divide-line">
              {(running.length ? running : journeys).slice(0, 5).map((j) => {
                const s = journeyStats(data.workflow_runs.filter((r) => r.workflow_id === j.id));
                return (
                  <li key={j.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/journeys/${j.id}`} className="min-w-0 truncate text-sm font-semibold text-ink hover:text-teal-d">{j.name}</Link>
                    <span className="flex shrink-0 items-center gap-2 text-[13px] text-muted">{s.active} in · {s.entered} total <Badge tone={j.active ? "teal" : "gray"}>{j.active ? "Running" : "Draft"}</Badge></span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4"><h2 className="font-semibold">Recent sends</h2><Link href="/emails" className="text-sm font-semibold text-teal-d hover:underline">All sends</Link></div>
        {sends.length === 0 ? <p className="border-t border-line px-5 py-6 text-sm text-muted">Nothing sent yet. <Link href="/marketing/send" className="font-semibold text-teal-d hover:underline">Send your first email</Link>.</p> : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-[13px] text-muted"><tr><th className="px-5 py-2.5 font-semibold">Email</th><th className="px-3 py-2.5 font-semibold">Audience</th><th className="px-3 py-2.5 text-right font-semibold">Sent</th><th className="px-3 py-2.5 text-right font-semibold">Opened</th><th className="px-5 py-2.5 text-right font-semibold">Clicked</th></tr></thead>
              <tbody className="divide-y divide-line">
                {sends.map((c) => {
                  const e = data.emails.filter((x) => x.campaign_id === c.id && x.status !== "failed");
                  const o = e.filter((x) => x.opened_at || x.clicked_at).length, k = e.filter((x) => x.clicked_at).length;
                  return (
                    <tr key={c.id}>
                      <td className="px-5 py-3"><div className="font-semibold text-ink">{c.name}</div><div className="text-[13px] text-muted">{c.sent_at ? new Date(c.sent_at).toLocaleDateString() : "Draft"}</div></td>
                      <td className="px-3 py-3 text-muted">{audienceText(c.audience)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{c.sent_count}</td>
                      <td className="px-3 py-3 text-right">{pct(o, e.length)}</td>
                      <td className="px-5 py-3 text-right">{pct(k, e.length)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
