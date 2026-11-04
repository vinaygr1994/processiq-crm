"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, ConfirmModal, Empty, PageHeader } from "@/components/ui";
import { triggerText } from "@/components/WorkflowEditor";
import { useCrm } from "@/lib/store";
import { isDemo } from "@/lib/config";
import { resetClock, skipAhead } from "@/lib/clock";
import { timeAgo } from "@/lib/format";
import { STARTERS } from "@/lib/engine/starters";
import { uid } from "@/lib/engine/types";
import type { Workflow } from "@/lib/types";

const tone = { info: "bg-teal-t text-teal-d", warn: "bg-sun-t text-[#9a5a00]", won: "bg-emerald-50 text-emerald-700", skip: "bg-cloud text-muted" } as const;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const reId = (steps: Workflow["steps"]): Workflow["steps"] => steps.map((s) => (s.type === "if" ? { ...s, id: uid(), then: reId(s.then), else: reId(s.else) } : { ...s, id: uid() }));

export default function AutomationsPage() {
  const { data, update, add, removeMany, remove, toast } = useCrm();
  const router = useRouter();
  const [del, setDel] = useState<Workflow | null>(null);
  const [reset, setReset] = useState(false);
  const [picker, setPicker] = useState(false);
  const wfs = data.workflows.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const log = data.autolog.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 40);
  const deals = new Map(data.deals.map((d) => [d.id, d]));
  const contacts = new Map(data.contacts.map((c) => [c.id, c]));
  const runs = (id: string) => data.workflow_runs.filter((r) => r.workflow_id === id);
  const skip = (ms: number, label: string) => { skipAhead(ms); window.dispatchEvent(new Event("piq-clock")); toast(`Skipped ahead ${label}. Follow-ups that are due will fire now.`); };
  const toggle = (w: Workflow) => update("workflows", w.id, w.active ? { active: false } : { active: true, activated_at: new Date().toISOString() });

  const create = async (src?: (typeof STARTERS)[number]) => {
    const base = src ? clone(src) : { name: "New workflow", description: "", trigger: { type: "lead_created" as const }, steps: [], exit: [], template_id: "" };
    const row = await add("workflows", { name: base.name, description: base.description, trigger: base.trigger, steps: reId(base.steps), exit: base.exit, active: false, activated_at: new Date().toISOString(), template_id: "" });
    if (row) router.push(`/automations/${row.id}`);
  };
  const delWf = async (w: Workflow) => {
    const ids = runs(w.id).map((r) => r.id);
    if (ids.length) await removeMany("workflow_runs", ids);
    await remove("workflows", w.id);
    setDel(null); toast("Workflow deleted");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Workflows" sub="Build automations that reply, remind and follow up for you. Pick a trigger, add steps, switch it on." action={<Button icon="plus" onClick={() => setPicker(true)}>New workflow</Button>} />

      {isDemo && (
        <Card className="!border-transparent bg-gradient-to-br from-teal-t/70 to-iris-t/60">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-xl"><h2 className="text-lg font-semibold">Try time travel</h2><p className="text-sm text-body">Demo only. Skip the clock forward to watch waits finish and follow-ups fire. In your live CRM this happens in real time.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="soft" icon="clock" onClick={() => skip(3600000, "1 hour")}>+1 hour</Button>
              <Button variant="soft" icon="clock" onClick={() => skip(86400000, "1 day")}>+1 day</Button>
              <Button variant="soft" icon="clock" onClick={() => skip(7 * 86400000, "1 week")}>+1 week</Button>
              <Button variant="soft" onClick={() => setReset(true)}>Reset time</Button>
            </div>
          </div>
        </Card>
      )}

      {wfs.length === 0 ? (
        <Card><Empty icon="bolt" title="No workflows yet" text="Start from a ready-made workflow or build your own." action={<Button icon="plus" onClick={() => setPicker(true)}>New workflow</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {wfs.map((w) => {
            const r = runs(w.id);
            const live = r.filter((x) => x.status === "active").length;
            return (
              <Card key={w.id} className={w.active ? "" : "bg-cloud/60"}>
                <div className="flex items-start justify-between gap-3">
                  <Badge tone={w.active ? "teal" : "gray"}>{triggerText(w.trigger)}</Badge>
                  <button role="switch" aria-checked={w.active} aria-label={`${w.name} ${w.active ? "on" : "off"}`} onClick={() => toggle(w)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${w.active ? "bg-teal" : "bg-[#cfd6e6]"}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${w.active ? "left-[22px]" : "left-0.5"}`} /></button>
                </div>
                <h3 className="mt-3 font-display text-[1.05rem] font-semibold text-ink"><Link href={`/automations/${w.id}`} className="hover:text-teal-d hover:underline">{w.name}</Link></h3>
                <p className="mt-1 text-sm text-body">{w.description || `${w.steps.length} step${w.steps.length === 1 ? "" : "s"}`}</p>
                <div className="mt-3 flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold text-teal-d">{r.length} run{r.length === 1 ? "" : "s"}{live > 0 ? ` · ${live} waiting` : ""}</span>
                  <span className="flex gap-1">
                    <Link href={`/automations/${w.id}`} className="inline-flex h-8 items-center rounded-full px-3 font-semibold text-ink hover:bg-white">Edit</Link>
                    <button onClick={() => setDel(w)} aria-label={`Delete ${w.name}`} className="grid size-8 place-items-center rounded-full text-[#b3bdd2] hover:bg-rose-t hover:text-rose"><Icon name="trash" className="size-4" /></button>
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Activity log</h2><span className="text-sm text-muted">Latest {log.length}</span></div>
        {log.length === 0 ? <p className="text-muted">Nothing yet. <Link href="/pipeline" className="font-semibold text-teal-d hover:underline">Add a lead</Link> to see workflows work.</p> : (
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

      {picker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="New workflow">
          <div className="anim-fade absolute inset-0 bg-ink/40" onClick={() => setPicker(false)} />
          <div className="anim-pop relative flex max-h-[90dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4"><h2 className="text-lg font-semibold">New workflow</h2><button onClick={() => setPicker(false)} aria-label="Close" className="grid size-9 place-items-center rounded-full text-muted hover:bg-cloud"><Icon name="x" className="size-5" /></button></div>
            <div className="space-y-2 overflow-y-auto p-4">
              <button onClick={() => create()} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-[#b7c1d6] p-4 text-left hover:border-teal hover:bg-teal-t"><span className="grid size-10 place-items-center rounded-xl bg-teal-t text-teal-d"><Icon name="plus" className="size-5" /></span><span><span className="block font-semibold text-ink">Start from scratch</span><span className="text-sm text-muted">Pick a trigger and add your own steps.</span></span></button>
              <div className="px-1 pt-2 text-xs font-bold uppercase tracking-wider text-muted">Or start from a ready-made one</div>
              {STARTERS.map((s) => (
                <button key={s.template_id} onClick={() => create(s)} className="flex w-full items-start gap-3 rounded-2xl p-3 text-left hover:bg-cloud"><span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-cloud text-teal-d"><Icon name="bolt" className="size-4" /></span><span><span className="block font-semibold text-ink">{s.name}</span><span className="text-sm text-muted">{s.description}</span></span></button>
              ))}
            </div>
          </div>
        </div>
      )}
      {del && <ConfirmModal title={`Delete “${del.name}”?`} text="Any people still waiting in it will stop. Messages already sent stay in the log." onClose={() => setDel(null)} onConfirm={() => delWf(del)} />}
      {reset && <ConfirmModal title="Reset the clock?" text="Time returns to now. Follow-ups already sent stay in the log." confirmLabel="Reset" onClose={() => setReset(false)} onConfirm={() => { resetClock(); window.dispatchEvent(new Event("piq-clock")); setReset(false); toast("Clock reset"); }} />}
    </div>
  );
}
