"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { Field } from "./ui";
import { MERGE_TAGS } from "@/lib/engine/merge";
import { useStages } from "@/lib/useStages";
import { useCrm } from "@/lib/store";
import { STAGES } from "@/lib/stages";
import { customTag } from "@/lib/engine/merge";
import type { Cond, CondField, CondOp, Step, Trigger, TriggerType } from "@/lib/engine/types";
import { uid } from "@/lib/engine/types";

export const TRIGGERS: { id: TriggerType; label: string }[] = [
  { id: "lead_created", label: "A new lead arrives" },
  { id: "stage_changed", label: "A deal moves to a stage" },
  { id: "visit_booked", label: "A visit is booked" },
  { id: "visit_done", label: "A visit result is saved" },
  { id: "visit_no_show", label: "A visit is marked no-show" },
  { id: "quote_sent", label: "A quote is sent" },
  { id: "contact_created", label: "A new contact is added" },
  { id: "tag_added", label: "A contact gets a tag" },
  { id: "audience", label: "Audience (one-time send)" },
  { id: "segment", label: "A contact joins a smart segment" },
  { id: "form_submitted", label: "A form is submitted" },
  { id: "booking_made", label: "A class or appointment is booked" },
  { id: "booking_checked_in", label: "A client checks in" },
  { id: "booking_no_show", label: "A client doesn't show" },
];
export const triggerText = (t: Trigger, name: (id: string) => string = (id) => STAGES.find((s) => s.id === id)?.label ?? id) => {
  const base = TRIGGERS.find((x) => x.id === t.type)?.label ?? t.type;
  if (t.type === "stage_changed") return `${base}: ${name(t.stage ?? "")}`;
  if (t.type === "lead_created" && t.source) return `${base} from ${t.source}`;
  if (t.type === "tag_added") return `${base}: ${t.tag || "(choose a tag)"}`;
  if (t.type === "audience") return t.tag ? `Audience: tagged ${t.tag}` : "Audience: everyone with an email";
  return base;
};

const FIELDS: { id: CondField; label: string }[] = [
  { id: "deal.stage", label: "Deal stage" }, { id: "deal.source", label: "Lead source" }, { id: "deal.project", label: "Interested in" }, { id: "deal.value", label: "Deal amount" },
  { id: "deal.rep", label: "Rep" }, { id: "deal.budget", label: "Budget" }, { id: "contact.email", label: "Email" }, { id: "contact.phone", label: "Phone" },
  { id: "contact.tags", label: "Tags" }, { id: "contact.company", label: "Company" }, { id: "contact.source", label: "Contact source" }, { id: "contact.unsubscribed", label: "Unsubscribed (true/false)" }, { id: "visit.status", label: "Visit status" }, { id: "visit.priority", label: "Visit priority" },
];
const OPS: { id: CondOp; label: string }[] = [
  { id: "is", label: "is" }, { id: "is_not", label: "is not" }, { id: "contains", label: "contains" }, { id: "gt", label: "is more than" }, { id: "lt", label: "is less than" }, { id: "empty", label: "is empty" }, { id: "not_empty", label: "is not empty" },
];

export function CondEditor({ cond, onChange }: { cond: Cond; onChange: (c: Cond) => void }) {
  const { stages: STAGES } = useStages();
  const noVal = cond.op === "empty" || cond.op === "not_empty";
  const opts = cond.field === "deal.stage" ? STAGES.map((s) => [s.id, s.label]) : cond.field === "visit.status" ? [["scheduled", "Scheduled"], ["done", "Done"], ["no_show", "No-show"], ["cancelled", "Cancelled"]] : cond.field === "visit.priority" ? [["hot", "Hot"], ["warm", "Warm"], ["cold", "Cold"]] : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className="field !w-auto !py-2" value={cond.field} onChange={(e) => onChange({ ...cond, field: e.target.value as CondField, value: "" })} aria-label="Field">{FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
      <select className="field !w-auto !py-2" value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value as CondOp })} aria-label="Condition">{OPS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
      {!noVal && (opts
        ? <select className="field !w-auto !py-2" value={cond.value ?? ""} onChange={(e) => onChange({ ...cond, value: e.target.value })} aria-label="Value"><option value="">Choose…</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        : <input className="field !w-40 !py-2" value={cond.value ?? ""} onChange={(e) => onChange({ ...cond, value: e.target.value })} placeholder="value" aria-label="Value" />)}
    </div>
  );
}

const TYPES: { id: string; label: string; icon: string; hint: string; make: () => Step }[] = [
  { id: "email", label: "Send an email", icon: "mail", hint: "To the contact", make: () => ({ id: uid(), type: "email", subject: "", body: "Hi {{first}},\n\n" }) },
  { id: "sms", label: "Send a text", icon: "phone", hint: "SMS to the contact", make: () => ({ id: uid(), type: "sms", body: "Hi {{first}}, " }) },
  { id: "wait", label: "Wait", icon: "clock", hint: "Pause the workflow", make: () => ({ id: uid(), type: "wait", mode: "delay", amount: 1, unit: "days" }) },
  { id: "task", label: "Create a task", icon: "check", hint: "For you or the rep", make: () => ({ id: uid(), type: "task", title: "Call {{name}}", days: 0 }) },
  { id: "notify", label: "Alert the owner", icon: "alert", hint: "Log and email you", make: () => ({ id: uid(), type: "notify", message: "" }) },
  { id: "stage", label: "Move to a stage", icon: "pipeline", hint: "Change the deal stage", make: () => ({ id: uid(), type: "stage", stage: "contacted" }) },
  { id: "tag", label: "Add or remove a tag", icon: "tag", hint: "On the contact", make: () => ({ id: uid(), type: "tag", tag: "" }) },
  { id: "assign", label: "Assign a rep", icon: "users", hint: "Round robin", make: () => ({ id: uid(), type: "assign" }) },
  { id: "if", label: "If / else", icon: "chevron", hint: "Branch on a condition", make: () => ({ id: uid(), type: "if", cond: { field: "deal.value", op: "gt", value: "10000" }, then: [], else: [] }) },
  { id: "noshow", label: "Mark visit no-show", icon: "x", hint: "Visit workflows only", make: () => ({ id: uid(), type: "noshow" }) },
  { id: "log", label: "Add a note to the log", icon: "note", hint: "Shows in Activity", make: () => ({ id: uid(), type: "log", message: "" }) },
];
const meta = (s: Step) => TYPES.find((t) => t.id === s.type)!;

function Tags({ onPick }: { onPick: (t: string) => void }) {
  const { settings } = useCrm();
  const extra = (settings?.custom_fields ?? []).map((f) => customTag(f.label));
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Insert a merge tag">
      {[...MERGE_TAGS, ...extra].map((t) => <button key={t} type="button" onClick={() => onPick(`{{${t}}}`)} className="rounded-full bg-cloud px-2 py-0.5 text-[11.5px] font-semibold text-muted hover:bg-teal-t hover:text-teal-d">{`{{${t}}}`}</button>)}
    </div>
  );
}

export function StepBody({ step, set }: { step: Step; set: (s: Step) => void }) {
  const { stages: STAGES } = useStages();
  const num = "field !w-20 !py-2";
  if (step.type === "email") return (
    <div className="space-y-2.5">
      <Field label="Subject"><input className="field" value={step.subject} onChange={(e) => set({ ...step, subject: e.target.value })} /></Field>
      <Field label="Message"><textarea className="field !min-h-[130px]" value={step.body} onChange={(e) => set({ ...step, body: e.target.value })} /></Field>
      <Tags onPick={(t) => set({ ...step, body: step.body + t })} />
      <label className="flex items-center gap-2 pt-1 text-sm"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={!!step.marketing} onChange={(e) => set({ ...step, marketing: e.target.checked })} />Marketing email (adds an unsubscribe link and skips people who unsubscribed)</label>
    </div>
  );
  if (step.type === "sms") return (<div><Field label="Text message"><textarea className="field !min-h-[90px]" value={step.body} onChange={(e) => set({ ...step, body: e.target.value })} /></Field><Tags onPick={(t) => set({ ...step, body: step.body + t })} /></div>);
  if (step.type === "task") return (
    <div className="space-y-2.5"><Field label="Task"><input className="field" value={step.title} onChange={(e) => set({ ...step, title: e.target.value })} /></Field>
      <div className="flex items-center gap-2 text-sm">Due in <input className={num} type="number" min={0} value={step.days} onChange={(e) => set({ ...step, days: Math.max(0, Number(e.target.value) || 0) })} /> day(s)</div><Tags onPick={(t) => set({ ...step, title: step.title + t })} /></div>
  );
  if (step.type === "notify") return (<div><Field label="Alert message" hint="Shown in Activity and emailed to your owner alert address."><input className="field" value={step.message} onChange={(e) => set({ ...step, message: e.target.value })} /></Field><Tags onPick={(t) => set({ ...step, message: step.message + t })} /></div>);
  if (step.type === "log") return (<Field label="Note"><input className="field" value={step.message} onChange={(e) => set({ ...step, message: e.target.value })} /></Field>);
  if (step.type === "stage") return (<Field label="Move the deal to"><select className="field" value={step.stage} onChange={(e) => set({ ...step, stage: e.target.value })}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>);
  if (step.type === "tag") return (
    <div className="flex flex-wrap items-center gap-2 text-sm"><select className="field !w-auto !py-2" value={step.remove ? "remove" : "add"} onChange={(e) => set({ ...step, remove: e.target.value === "remove" })}><option value="add">Add tag</option><option value="remove">Remove tag</option></select>
      <input className="field !w-48 !py-2" value={step.tag} onChange={(e) => set({ ...step, tag: e.target.value.toLowerCase() })} placeholder="e.g. hot-lead" /></div>
  );
  if (step.type === "assign") return <p className="text-sm text-muted">Gives the deal to the next rep in turn (from Settings → Team). Skipped if a rep is already set.</p>;
  if (step.type === "noshow") return <p className="text-sm text-muted">Marks the meeting as a no-show and moves the deal back to Contacted.</p>;
  if (step.type === "wait") {
    const mode = step.mode;
    return (
      <div className="space-y-2.5 text-sm">
        <select className="field !w-auto !py-2" value={mode} onChange={(e) => { const m = e.target.value; set(m === "delay" ? { id: step.id, type: "wait", mode: "delay", amount: 1, unit: "days" } : m === "time" ? { id: step.id, type: "wait", mode: "time", time: "09:00" } : { id: step.id, type: "wait", mode: "until", ref: "visit_start", offset: -1440, late: "skip" }); }}>
          <option value="delay">For a set time</option><option value="time">Until a time of day</option><option value="until">Until before or after an event</option></select>
        {step.mode === "delay" && (<div className="flex items-center gap-2"><input className={num} type="number" min={1} value={step.amount} onChange={(e) => set({ ...step, amount: Math.max(1, Number(e.target.value) || 1) })} />
          <select className="field !w-auto !py-2" value={step.unit} onChange={(e) => set({ ...step, unit: e.target.value as "minutes" | "hours" | "days" })}><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option></select></div>)}
        {step.mode === "time" && (<div className="flex items-center gap-2">Next time it is <input className="field !w-32 !py-2" type="time" value={step.time} onChange={(e) => set({ ...step, time: e.target.value })} /> (your time zone)</div>)}
        {step.mode === "until" && (<div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2"><input className={num} type="number" value={Math.abs(Math.round(step.offset / 60))} onChange={(e) => set({ ...step, offset: (step.offset < 0 ? -1 : 1) * Math.abs(Number(e.target.value) || 0) * 60 })} /> hours
            <select className="field !w-auto !py-2" value={step.offset < 0 ? "before" : "after"} onChange={(e) => set({ ...step, offset: (e.target.value === "before" ? -1 : 1) * Math.abs(step.offset) })}><option value="before">before</option><option value="after">after</option></select>
            <select className="field !w-auto !py-2" value={step.ref} onChange={(e) => set({ ...step, ref: e.target.value as "visit_start" | "quote_sent" })}><option value="visit_start">the visit starts</option><option value="quote_sent">the quote was sent</option></select></div>
          <div className="flex flex-wrap items-center gap-2">If that time has already passed: <select className="field !w-auto !py-2" value={step.late} onChange={(e) => set({ ...step, late: e.target.value as "skip" | "run" | "stop" })}><option value="skip">skip the next step</option><option value="run">carry on straight away</option><option value="stop">stop the workflow</option></select></div></div>)}
      </div>
    );
  }
  return null;
}

function AddMenu({ onAdd }: { onAdd: (s: Step) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex justify-center">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Add a step" className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#b7c1d6] bg-white px-3.5 py-1.5 text-sm font-semibold text-teal-d hover:border-teal hover:bg-teal-t"><Icon name="plus" className="size-4" />Add step</button>
      {open && (
        <div className="absolute top-full z-20 mt-2 grid w-[min(92vw,420px)] gap-1 rounded-2xl border border-line bg-white p-2 shadow-xl sm:grid-cols-2">
          {TYPES.map((t) => (
            <button key={t.id} type="button" onClick={() => { onAdd(t.make()); setOpen(false); }} className="flex items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-cloud">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-teal-t text-teal-d"><Icon name={t.icon} className="size-4" /></span>
              <span><span className="block text-sm font-semibold text-ink">{t.label}</span><span className="block text-[12px] text-muted">{t.hint}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StepList({ steps, onChange, nested = false }: { steps: Step[]; onChange: (s: Step[]) => void; nested?: boolean }) {
  const setAt = (i: number, s: Step) => onChange(steps.map((x, j) => (j === i ? s : x)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= steps.length) return; const c = steps.slice(); [c[i], c[j]] = [c[j], c[i]]; onChange(c); };
  const insert = (i: number, s: Step) => onChange([...steps.slice(0, i), s, ...steps.slice(i)]);
  return (
    <div className="space-y-0">
      {steps.map((s, i) => {
        const m = meta(s);
        return (
          <div key={s.id}>
            <div className="mx-auto h-5 w-px bg-[#cfd6e6]" aria-hidden />
            <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-teal-t text-teal-d"><Icon name={m.icon} className="size-4" /></span>
                <span className="font-display font-semibold text-ink">{m.label}</span>
                <span className="ml-auto flex items-center gap-0.5">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-cloud disabled:opacity-30"><Icon name="chevron" className="size-4 -rotate-90" /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Move down" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-cloud disabled:opacity-30"><Icon name="chevron" className="size-4 rotate-90" /></button>
                  <button type="button" onClick={() => onChange(steps.filter((_, j) => j !== i))} aria-label="Delete step" className="grid size-8 place-items-center rounded-lg text-[#b3bdd2] hover:bg-rose/10 hover:text-rose"><Icon name="trash" className="size-4" /></button>
                </span>
              </div>
              {s.type === "if" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">If</span><CondEditor cond={s.cond} onChange={(c) => setAt(i, { ...s, cond: c })} /></div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl bg-emerald-50/60 p-3"><div className="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-700">Then</div><StepList nested steps={s.then} onChange={(t) => setAt(i, { ...s, then: t })} /></div>
                    <div className="rounded-xl bg-sun-t/50 p-3"><div className="mb-1 text-xs font-bold uppercase tracking-wider text-[#9a5a00]">Otherwise</div><StepList nested steps={s.else} onChange={(t) => setAt(i, { ...s, else: t })} /></div>
                  </div>
                </div>
              ) : <StepBody step={s} set={(x) => setAt(i, x)} />}
            </div>
            <div className="mx-auto h-5 w-px bg-[#cfd6e6]" aria-hidden />
            <AddMenu onAdd={(n) => insert(i + 1, n)} />
          </div>
        );
      })}
      {steps.length === 0 && <div className={nested ? "" : "py-2"}><AddMenu onAdd={(n) => onChange([n])} /></div>}
    </div>
  );
}
