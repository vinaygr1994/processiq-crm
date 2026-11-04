"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, ConfirmModal, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { AUTOMATIONS } from "@/lib/automations";
import { isDemo } from "@/lib/config";
import { resetClock, skipAhead } from "@/lib/clock";
import { timeAgo } from "@/lib/format";

const tone = { info: "bg-teal-t text-teal-d", warn: "bg-sun-t text-[#9a5a00]", won: "bg-emerald-50 text-emerald-700", skip: "bg-cloud text-muted" } as const;
const chIcon = { email: "mail", task: "check", alert: "alert" } as const;

export default function AutomationsPage() {
  const { data, settings, saveSettings, toast } = useCrm();
  const [confirm, setConfirm] = useState(false);
  const off = settings?.automations_off ?? [];
  const log = data.autolog.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40);
  const deals = new Map(data.deals.map((d) => [d.id, d]));
  const contacts = new Map(data.contacts.map((c) => [c.id, c]));
  const toggle = (id: string) => saveSettings({ automations_off: off.includes(id) ? off.filter((x) => x !== id) : [...off, id] });
  const skip = (ms: number, label: string) => { skipAhead(ms); window.dispatchEvent(new Event("piq-clock")); toast(`Skipped ahead ${label}. Follow-ups that are due will fire now.`); };

  return (
    <div className="space-y-6">
      <PageHeader title="Autopilot" sub="12 automations that reply, remind and follow up for you, from enquiry to review." />

      {isDemo && (
        <Card className="!border-transparent bg-gradient-to-br from-teal-t/70 to-iris-t/60">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-xl"><h2 className="text-lg font-semibold">Try time travel</h2><p className="text-sm text-body">Demo only. Skip the clock forward to watch call-back chases, visit reminders and quote follow-ups fire. In your live CRM this happens in real time.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="soft" icon="clock" onClick={() => skip(3600000, "1 hour")}>+1 hour</Button>
              <Button variant="soft" icon="clock" onClick={() => skip(86400000, "1 day")}>+1 day</Button>
              <Button variant="soft" icon="clock" onClick={() => skip(7 * 86400000, "1 week")}>+1 week</Button>
              <Button variant="soft" onClick={() => setConfirm(true)}>Reset time</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {AUTOMATIONS.map((a) => {
          const on = !off.includes(a.id);
          const n = data.autolog.filter((l) => l.key.startsWith(a.id + ":") || l.key.startsWith(a.id.slice(0, 2) + ":")).length;
          return (
            <Card key={a.id} className={on ? "" : "opacity-60"}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-xl bg-teal-t text-teal-d"><Icon name={chIcon[a.channel]} className="size-4" /></span><Badge tone="gray">{a.stage}</Badge></div>
                <button role="switch" aria-checked={on} aria-label={`${a.title} ${on ? "on" : "off"}`} onClick={() => toggle(a.id)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-teal" : "bg-[#cfd6e6]"}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} /></button>
              </div>
              <h3 className="mt-3 font-display text-[1.05rem] font-semibold text-ink">{a.title}</h3>
              <p className="mt-1 text-sm text-body">{a.text}</p>
              {n > 0 && <p className="mt-2 text-[12.5px] font-semibold text-teal-d">{n} run{n === 1 ? "" : "s"} so far</p>}
            </Card>
          );
        })}
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Activity log</h2><span className="text-sm text-muted">Latest {log.length}</span></div>
        {log.length === 0 ? <p className="text-muted">Nothing yet. <Link href="/pipeline" className="font-semibold text-teal-d hover:underline">Add a lead</Link> to see autopilot work.</p> : (
          <ol className="divide-y divide-line">
            {log.map((l) => {
              const d = deals.get(l.deal_id ?? "");
              const c = d?.contact_id ? contacts.get(d.contact_id) : null;
              return (
                <li key={l.id} className="flex items-start gap-3 py-3 text-sm">
                  <span className={`mt-0.5 w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-bold ${tone[l.tone]}`}>{l.kind}</span>
                  <div className="min-w-0 flex-1"><div className="text-ink">{l.message}</div>{d && <Link href={`/pipeline?deal=${d.id}`} className="text-[13px] text-muted hover:text-teal-d hover:underline">{c?.name ?? d.title} · {d.project}</Link>}</div>
                  <span className="shrink-0 text-[12.5px] text-muted">{timeAgo(l.created_at)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
      {confirm && <ConfirmModal title="Reset the clock?" text="Time returns to now. Follow-ups already sent stay in the log." confirmLabel="Reset" onClose={() => setConfirm(false)} onConfirm={() => { resetClock(); window.dispatchEvent(new Event("piq-clock")); setConfirm(false); toast("Clock reset"); }} />}
    </div>
  );
}
