"use client";
import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import { Button, Field, Modal } from "./ui";
import { useCrm } from "@/lib/store";
import { useStages } from "@/lib/useStages";
import { SOURCES } from "@/lib/stages";
import { FIELDS, fieldDef, newRule, segCtx, segmentMembers } from "@/lib/segments";
import { isJourney } from "@/lib/journeys";
import type { Segment, SegmentRule } from "@/lib/types";

export function useSegCtx() {
  const { data } = useCrm();
  const [now] = useState(() => Date.now());
  return useMemo(() => segCtx(data.emails, data.deals, data.workflow_runs, now), [data.emails, data.deals, data.workflow_runs, now]);
}

function RuleRow({ r, set, onRemove }: { r: SegmentRule; set: (r: SegmentRule) => void; onRemove?: () => void }) {
  const { data } = useCrm();
  const { stages } = useStages();
  const f = fieldDef(r.field);
  const tags = useMemo(() => [...new Set(data.contacts.flatMap((c) => c.tags))].sort(), [data.contacts]);
  const groups = [...new Set(FIELDS.map((x) => x.group))];
  const noValue = f.kind === "bool" || ["set", "not_set"].includes(r.op);
  let value: React.ReactNode = null;
  if (!noValue) {
    if (f.kind === "tag") value = <select className="field" value={r.value} onChange={(e) => set({ ...r, value: e.target.value })} aria-label="List"><option value="" disabled>Choose a list…</option>{tags.map((t) => <option key={t}>{t}</option>)}</select>;
    else if (f.kind === "stage") value = <select className="field" value={r.value} onChange={(e) => set({ ...r, value: e.target.value })} aria-label="Stage"><option value="" disabled>Choose a stage…</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>;
    else if (f.kind === "campaign") value = <select className="field" value={r.value} onChange={(e) => set({ ...r, value: e.target.value })} aria-label="Send"><option value="" disabled>Choose a send…</option>{data.campaigns.filter((c) => c.status === "sent").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>;
    else if (f.kind === "journey") value = <select className="field" value={r.value} onChange={(e) => set({ ...r, value: e.target.value })} aria-label="Journey"><option value="" disabled>Choose a journey…</option>{data.workflows.filter(isJourney).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>;
    else if (f.kind === "days") value = <div className="flex items-center gap-2"><input type="number" min={1} className="field !w-24" value={r.value} onChange={(e) => set({ ...r, value: e.target.value })} aria-label="Days" /><span className="text-sm text-muted">days</span></div>;
    else if (f.kind === "number") value = <input type="number" min={0} className="field" value={r.value} onChange={(e) => set({ ...r, value: e.target.value })} aria-label="Amount" />;
    else if (r.field === "source") value = <select className="field" value={r.value} onChange={(e) => set({ ...r, value: e.target.value })} aria-label="Source"><option value="" disabled>Choose…</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select>;
    else value = <input className="field" value={r.value} onChange={(e) => set({ ...r, value: e.target.value })} aria-label="Value" />;
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-3 sm:flex-row sm:items-center">
      <select className="field sm:!w-52" value={r.field} aria-label="Field" onChange={(e) => { const nf = fieldDef(e.target.value); set({ field: nf.id, op: nf.ops[0].id, value: nf.kind === "days" ? "30" : "" }); }}>
        {groups.map((g) => <optgroup key={g} label={g}>{FIELDS.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>)}
      </select>
      <select className="field sm:!w-48" value={r.op} aria-label="Condition" onChange={(e) => set({ ...r, op: e.target.value })}>{f.ops.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
      <div className="min-w-0 flex-1">{value}</div>
      {onRemove && <button type="button" onClick={onRemove} aria-label="Remove rule" className="grid size-9 shrink-0 place-items-center self-end rounded-full text-muted hover:bg-rose-t hover:text-rose sm:self-auto"><Icon name="x" className="size-4" /></button>}
    </div>
  );
}

export function SegmentModal({ seg, onClose }: { seg?: Segment; onClose: () => void }) {
  const { data, add, update, toast } = useCrm();
  const x = useSegCtx();
  const [name, setName] = useState(seg?.name ?? "");
  const [match, setMatch] = useState<"all" | "any">(seg?.match ?? "all");
  const [rules, setRules] = useState<SegmentRule[]>(seg?.rules?.length ? seg.rules : [{ field: "opened", op: "within", value: "30" }]);
  const [err, setErr] = useState("");
  const members = useMemo(() => segmentMembers(data.contacts, { match, rules }, x), [data.contacts, match, rules, x]);
  const emailable = members.filter((c) => c.email && !c.unsubscribed).length;

  async function save() {
    if (!name.trim()) return setErr("Give the segment a name.");
    if (rules.some((r) => !fieldDef(r.field).ops.some((o) => o.id === r.op))) return setErr("Check the rules.");
    try {
      if (seg) await update("segments", seg.id, { name: name.trim(), match, rules });
      else { const row = await add("segments", { name: name.trim(), match, rules }); if (!row) return; }
      toast(seg ? "Segment updated" : "Segment created"); onClose();
    } catch { setErr("Couldn't save. Run supabase/migrations/008_segments.sql in Supabase first."); }
  }

  return (
    <Modal title={seg ? "Edit smart segment" : "New smart segment"} onClose={onClose} wide="xl">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Field label="Segment name"><input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engaged in the last 30 days" /></Field>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            Include contacts who match
            <div className="inline-flex rounded-full bg-cloud p-1" role="radiogroup" aria-label="Match">
              {(["all", "any"] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={match === m} onClick={() => setMatch(m)} className={`rounded-full px-3 py-1 text-[13px] font-semibold ${match === m ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{m === "all" ? "all rules" : "any rule"}</button>)}
            </div>
          </div>
          <div className="space-y-2">
            {rules.map((r, i) => (
              <div key={i}>
                {i > 0 && <div className="py-1 pl-4 text-[12px] font-bold uppercase text-muted">{match === "all" ? "and" : "or"}</div>}
                <RuleRow r={r} set={(nr) => setRules(rules.map((x, k) => (k === i ? nr : x)))} onRemove={rules.length > 1 ? () => setRules(rules.filter((_, k) => k !== i)) : undefined} />
              </div>
            ))}
          </div>
          <Button type="button" size="sm" variant="soft" icon="plus" onClick={() => setRules([...rules, newRule()])}>Add a rule</Button>
        </div>
        <aside className="h-fit space-y-3 rounded-2xl bg-cloud p-4">
          <div><span className="font-display text-4xl font-semibold text-ink">{members.length}</span> <span className="text-sm font-medium text-muted">contacts match now</span></div>
          <div className="text-[13px] text-muted">{emailable} can be emailed</div>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {members.slice(0, 30).map((c) => <li key={c.id} className="truncate rounded-lg bg-white px-3 py-1.5 text-[13px]"><span className="font-semibold text-ink">{c.name}</span> <span className="text-muted">{c.email}</span></li>)}
            {members.length > 30 && <li className="px-1 text-[12.5px] text-muted">and {members.length - 30} more</li>}
          </ul>
          <p className="text-[12.5px] text-muted">The segment updates itself: people join and leave as they start or stop matching.</p>
        </aside>
      </div>
      {err && <p role="alert" className="mt-4 text-sm font-medium text-rose">{err}</p>}
      <div className="mt-6 flex justify-end gap-2"><Button variant="soft" onClick={onClose}>Cancel</Button><Button onClick={save}>Save segment</Button></div>
    </Modal>
  );
}
