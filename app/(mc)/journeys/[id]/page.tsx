"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, createContext, useContext, useEffect, useMemo, useState, type DragEvent } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, Field, Modal } from "@/components/ui";
import { CondEditor, StepBody } from "@/components/WorkflowEditor";
import { EmailEditor } from "@/components/EmailEditor";
import { useCrm } from "@/lib/store";
import { useStages } from "@/lib/useStages";
import { SOURCES } from "@/lib/stages";
import { isDemo } from "@/lib/config";
import { emailVars, parseDesign, renderDesign } from "@/lib/emailDesign";
import { branches, uid, type Cond, type Path, type Step, type Trigger } from "@/lib/engine/types";
import type { EmailLog, WorkflowRun } from "@/lib/types";
import {
  ACTIVITIES, ENTRY, GROUP_TONE, activityOf, allSteps, emailStats, findStep, inPath, isJourney, journeyStats, mapList, mapStep, posKey, removeStep, waitingAt,
  type Group, type ListPath,
} from "@/lib/journeys";

type Sel = "entry" | "goal" | string | null;
const LINE = "h-0.5 w-6 shrink-0 bg-[#cfd6e6]";
const getList = (steps: Step[], lp: ListPath): Step[] => {
  let l = steps;
  for (const [id, k] of lp) { const s = l.find((x) => x.id === id); l = (s && branches(s)?.[k]) || []; }
  return l;
};
const lpKey = (lp: ListPath) => lp.map(([a, b]) => `${a}:${b}`).join("/");


/* ---------- Canvas (top-level so drag-and-drop targets stay mounted) ---------- */
interface CanvasCtx {
  steps: Step[]; runs: WorkflowRun[]; emails: EmailLog[]; waiting: Map<string, number>; sel: Sel; hot: string | null;
  setSel: (s: Sel) => void; setHot: (f: (h: string | null) => string | null) => void; setAdding: (a: { lp: ListPath; index: number }) => void;
  onDrop: (e: DragEvent, lp: ListPath, index: number) => void; stageName: (id: string) => string;
}
const Ctx = createContext<CanvasCtx | null>(null);
const useC = () => useContext(Ctx)!;

function Plus({ lp, index }: { lp: ListPath; index: number }) {
  const { hot, setHot, setAdding, onDrop } = useC();
  const key = `${lpKey(lp)}#${index}`;
  return (
    <div className="flex shrink-0 items-center">
      <div className={LINE} />
      <button type="button" aria-label="Add an activity here" onClick={() => setAdding({ lp, index })}
        onDragOver={(e) => { e.preventDefault(); if (hot !== key) setHot(() => key); }} onDragLeave={() => setHot((h) => (h === key ? null : h))} onDrop={(e) => onDrop(e, lp, index)}
        className={`grid size-8 shrink-0 place-items-center rounded-full border-2 border-dashed text-sm font-bold transition ${hot === key ? "scale-125 border-teal bg-teal-t text-teal-d" : "border-[#cfd6e6] bg-white text-muted hover:border-teal hover:text-teal-d"}`}>+</button>
      <div className={LINE} />
    </div>
  );
}

function NodeCard({ s, pos }: { s: Step; pos: number[] }) {
  const { steps, emails, waiting, sel, setSel, stageName } = useC();
  const a = activityOf(s), here = waiting.get(posKey(pos)) ?? 0;
  const st = s.type === "email" ? emailStats(emails, s.id) : null;
  const summary =
    s.type === "email" ? s.subject || "No subject yet" :
    s.type === "sms" ? s.body.slice(0, 40) :
    s.type === "wait" ? (s.mode === "delay" ? `${s.amount} ${s.amount === 1 ? s.unit.replace(/s$/, "") : s.unit}` : s.mode === "time" ? `Until ${s.time}` : "Until an event") :
    s.type === "tag" ? s.tag || "Choose a tag" : s.type === "task" ? s.title : s.type === "stage" ? stageName(s.stage) :
    s.type === "split" ? `${s.paths.length} paths` : s.type === "ab" ? s.paths.map((p) => `${p.pct ?? 0}%`).join(" / ") :
    s.type === "engage" ? `${s.event === "click" ? "Clicked" : "Opened"}: ${(findStep(steps, s.ref) as { subject?: string } | null)?.subject || "choose an email"}` :
    s.type === "notify" || s.type === "log" ? s.message || "…" : a.hint;
  return (
    <button type="button" draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", "mv:" + s.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={() => setSel(s.id)}
      className={`relative w-48 shrink-0 cursor-pointer rounded-2xl border bg-white p-3 text-left shadow-sm transition hover:shadow-md ${sel === s.id ? "border-teal ring-4 ring-teal/15" : "border-line"}`}>
      <div className="flex items-center gap-2">
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${GROUP_TONE[a.group]}`}><Icon name={a.icon} className="size-4" /></span>
        <span className="truncate text-[13.5px] font-semibold text-ink">{a.label}</span>
      </div>
      <div className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-muted">{summary}</div>
      {st && st.sent > 0 && <div className="mt-2 flex gap-2 text-[11.5px] font-semibold"><span className="text-ink">{st.sent} sent</span><span className="text-teal-d">{Math.round((st.opened / st.sent) * 100)}% open</span><span className="text-iris">{Math.round((st.clicked / st.sent) * 100)}% click</span></div>}
      {here > 0 && <span className="absolute -right-2 -top-2 rounded-full bg-sun px-2 py-0.5 text-[11px] font-bold text-ink shadow">{here} here</span>}
    </button>
  );
}

function Lane({ list, lp, prefix }: { list: Step[]; lp: ListPath; prefix: number[] }) {
  const { runs } = useC();
  return (
    <div className="flex items-center">
      <Plus lp={lp} index={0} />
      {list.map((s, i) => {
        const pos = [...prefix, i], br = branches(s);
        return (
          <Fragment key={s.id}>
            {br ? (
              <div className="flex shrink-0 items-center">
                <NodeCard s={s} pos={pos} />
                <div className={LINE} />
                <div className="flex flex-col gap-3 rounded-2xl border-x-2 border-[#cfd6e6] py-1">
                  {br.map((b, k) => {
                    const p = s.type === "if" ? null : (s as { paths: Path[] }).paths[k];
                    const label = s.type === "if" ? (k === 0 ? "Yes" : "No") : p?.label ?? `Path ${k + 1}`;
                    const live = inPath(runs, [...pos, k]);
                    return (
                      <div key={k} className="flex items-center">
                        <span className="shrink-0 rounded-r-full bg-iris-t px-2.5 py-1 text-[12px] font-semibold text-iris">{label}{s.type === "ab" && p?.pct !== undefined ? ` · ${p.pct}%` : ""}{live ? ` · ${live} here` : ""}</span>
                        <Lane list={b} lp={[...lp, [s.id, k]]} prefix={[...pos, k]} />
                        <div className="h-0.5 min-w-4 flex-1 bg-[#cfd6e6]" />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : <NodeCard s={s} pos={pos} />}
            <Plus lp={lp} index={i + 1} />
          </Fragment>
        );
      })}
    </div>
  );
}

function PathsEditor({ s, setStep }: { s: Extract<Step, { type: "split" | "ab" }>; setStep: (s: Step) => void }) {
  const setPaths = (paths: Path[]) => setStep({ ...s, paths } as Step);
  const total = s.paths.reduce((a, p) => a + (p.pct ?? 0), 0);
  return (
    <div className="space-y-3">
      {s.paths.map((p, k) => {
        const last = s.type === "split" && k === s.paths.length - 1 && !p.cond;
        return (
          <div key={p.id} className="rounded-xl border border-line p-3">
            <div className="flex items-center gap-2">
              <input className="field !h-9 !py-1 text-sm font-semibold" value={p.label} aria-label="Path name" onChange={(e) => setPaths(s.paths.map((x) => (x.id === p.id ? { ...x, label: e.target.value } : x)))} />
              {s.type === "ab" && <><input type="number" min={0} max={100} className="field !h-9 !w-20 !py-1 text-sm" aria-label="Percent" value={p.pct ?? 0} onChange={(e) => setPaths(s.paths.map((x) => (x.id === p.id ? { ...x, pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } : x)))} /><span className="text-sm text-muted">%</span></>}
              {s.paths.length > 2 && !last && <button type="button" onClick={() => setPaths(s.paths.filter((x) => x.id !== p.id))} aria-label="Remove path" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-rose-t hover:text-rose">×</button>}
            </div>
            {s.type === "split" && (last ? <p className="mt-2 text-[13px] text-muted">Everyone who doesn&apos;t match a path above.</p> : <div className="mt-2"><CondEditor cond={p.cond ?? { field: "contact.tags", op: "is", value: "" }} onChange={(c) => setPaths(s.paths.map((x) => (x.id === p.id ? { ...x, cond: c } : x)))} /></div>)}
            {p.steps.length > 0 && <p className="mt-2 text-[12.5px] text-muted">{p.steps.length} activit{p.steps.length === 1 ? "y" : "ies"} on this path.</p>}
          </div>
        );
      })}
      {s.paths.length < 5 && <Button type="button" size="sm" variant="soft" icon="plus" onClick={() => {
        const np: Path = s.type === "ab" ? { id: uid(), label: `Version ${String.fromCharCode(65 + s.paths.length)}`, pct: 0, steps: [] } : { id: uid(), label: `Path ${s.paths.length}`, cond: { field: "contact.tags", op: "is", value: "" }, steps: [] };
        setPaths(s.type === "split" ? [...s.paths.slice(0, -1), np, s.paths[s.paths.length - 1]] : [...s.paths, np]);
      }}>Add a path</Button>}
      {s.type === "ab" && <p className={`text-sm font-medium ${total === 100 ? "text-teal-d" : "text-rose"}`}>Total {total}%{total !== 100 ? " (must be 100%)" : ""}</p>}
      {s.type === "split" && <p className="text-[13px] text-muted">People take the first path they match, checked from top to bottom.</p>}
    </div>
  );
}

export default function JourneyPage() {
  const { id } = useParams<{ id: string }>();
  const { data, ready, update, toast, settings } = useCrm();
  const { stages, name: stageName } = useStages();
  const saved = data.workflows.find((w) => w.id === id);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<Trigger>({ type: "contact_created" });
  const [exit, setExit] = useState<Cond[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState<Sel>("entry");
  const [adding, setAdding] = useState<{ lp: ListPath; index: number } | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copy the saved journey into the editor once it has loaded
    if (saved && !loaded) { setName(saved.name); setTrigger(saved.trigger); setExit(saved.exit); setSteps(saved.steps); setLoaded(true); }
  }, [saved, loaded]);

  const runs = useMemo(() => data.workflow_runs.filter((r) => r.workflow_id === id), [data.workflow_runs, id]);
  const waiting = useMemo(() => waitingAt(runs), [runs]);
  const stats = journeyStats(runs);
  const emails = data.emails;

  if (!ready) return null;
  if (!saved || !isJourney(saved)) return <Card><p>That journey doesn&apos;t exist. <Link href="/journeys" className="font-semibold text-teal-d hover:underline">Back to journeys</Link></p></Card>;

  const edit = (next: Step[]) => { setSteps(next); setDirty(true); };
  const insert = (lp: ListPath, index: number, s: Step) => { edit(mapList(steps, lp, (l) => [...l.slice(0, index), s, ...l.slice(index)])); setSel(s.id); };
  const move = (sid: string, lp: ListPath, index: number) => {
    if (lp.some(([x]) => x === sid)) return toast("A split can't be moved inside itself");
    const s = findStep(steps, sid); if (!s) return;
    const target = getList(steps, lp), old = target.findIndex((x) => x.id === sid);
    const at = old >= 0 && old < index ? index - 1 : index;
    const without = removeStep(steps, sid);
    edit(mapList(without, lp, (l) => [...l.slice(0, at), s, ...l.slice(at)])); setSel(sid);
  };
  const onDrop = (e: DragEvent, lp: ListPath, index: number) => {
    e.preventDefault(); setHot(null);
    const d = e.dataTransfer.getData("text/plain");
    if (d.startsWith("act:")) { const a = ACTIVITIES.find((x) => x.key === d.slice(4)); if (a) insert(lp, index, a.make()); }
    else if (d.startsWith("mv:")) move(d.slice(3), lp, index);
  };
  const setStep = (s: Step) => edit(mapStep(steps, s.id, () => s));

  function check(): string[] {
    const p: string[] = [];
    if ((trigger.type === "tag_added") && !trigger.tag) p.push("Choose the tag that starts this journey.");
    if (trigger.type === "stage_changed" && !trigger.stage) p.push("Choose the stage that starts this journey.");
    if (trigger.type === "segment" && !data.segments.some((s) => s.id === trigger.segment)) p.push("Choose the smart segment that starts this journey.");
    if (!steps.length) p.push("Add at least one activity.");
    for (const s of allSteps(steps)) {
      if (s.type === "email" && (!s.subject.trim() || (!parseDesign(s.body) && !s.body.trim()))) p.push("Every email needs a subject and content.");
      if (s.type === "engage" && !findStep(steps, s.ref)) p.push("An engagement split needs an email to check.");
      if (s.type === "ab" && s.paths.reduce((a, x) => a + (x.pct ?? 0), 0) !== 100) p.push("Random split percentages must add up to 100.");
      if (s.type === "tag" && !s.tag.trim()) p.push("A tag activity has no tag.");
    }
    return [...new Set(p)];
  }
  async function save() {
    await update("workflows", saved!.id, { name: name.trim() || "Untitled journey", trigger, exit, steps });
    setDirty(false); toast("Journey saved");
  }
  async function toggle() {
    if (!saved!.active) {
      const p = check(); setProblems(p);
      if (p.length) return;
      await update("workflows", saved!.id, { name: name.trim() || "Untitled journey", trigger, exit, steps, active: true, activated_at: new Date().toISOString() });
      setDirty(false); toast("Journey is running");
    } else { await update("workflows", saved!.id, { active: false }); toast("Journey paused. Nobody new enters and waiting people stay where they are."); }
  }

  /* ---------- Config panel ---------- */
  const selected = sel && sel !== "entry" && sel !== "goal" ? findStep(steps, sel) : null;
  const emailSteps = allSteps(steps).filter((s): s is Extract<Step, { type: "email" }> => s.type === "email");
  const tags = [...new Set(data.contacts.flatMap((c) => c.tags))].sort();
  const audienceCount = data.contacts.filter((c) => c.email && !c.unsubscribed && (!trigger.tag || c.tags.includes(trigger.tag))).length;
  const setTrig = (t: Trigger) => { setTrigger(t); setDirty(true); };

  const panel = (() => {
    if (sel === "entry") return (
      <div className="space-y-4">
        <h3 className="font-semibold">Entry source</h3>
        <p className="-mt-2 text-sm text-muted">Who enters this journey, and when.</p>
        <Field label="People enter when">
          <select className="field" value={trigger.type} onChange={(e) => setTrig({ type: e.target.value as Trigger["type"] })}>
            {["Contacts", "Bookings", "Deals", "Sales visits"].map((g) => <optgroup key={g} label={g}>{ENTRY.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>)}
          </select>
        </Field>
        <p className="text-[13px] text-muted">{ENTRY.find((x) => x.id === trigger.type)?.hint}</p>
        {(trigger.type === "tag_added" || trigger.type === "audience") && (
          <Field label={trigger.type === "audience" ? "Only contacts with this tag (optional)" : "Tag"}>
            <input className="field" list="journey-tags" value={trigger.tag ?? ""} onChange={(e) => setTrig({ ...trigger, tag: e.target.value.toLowerCase().trim() })} placeholder={trigger.type === "audience" ? "Leave empty for everyone" : "e.g. newsletter"} />
            <datalist id="journey-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
        )}
        {trigger.type.startsWith("booking_") && (
          <Field label="Service or class">
            <select className="field" value={trigger.service ?? ""} onChange={(e) => setTrig({ ...trigger, service: e.target.value || undefined })}>
              <option value="">Any</option>{data.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
        {trigger.type === "form_submitted" && (
          <Field label="Form">
            <select className="field" value={trigger.form ?? ""} onChange={(e) => setTrig({ ...trigger, form: e.target.value || undefined })}>
              <option value="">Any form</option>{data.forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
        )}
        {trigger.type === "segment" && (
          <Field label="Smart segment">
            <select className="field" value={trigger.segment ?? ""} onChange={(e) => setTrig({ ...trigger, segment: e.target.value })}>
              <option value="" disabled>Choose a segment…</option>{data.segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {data.segments.length === 0 && <p className="mt-1.5 text-[13px] text-muted"><Link href="/marketing/lists" className="font-semibold text-teal-d hover:underline">Create a smart segment</Link> first.</p>}
          </Field>
        )}
        {trigger.type === "audience" && <div className="rounded-xl bg-teal-t px-4 py-3 text-teal-d"><span className="font-display text-2xl font-semibold">{audienceCount}</span> <span className="text-sm font-medium">contacts match right now</span></div>}
        {(trigger.type === "contact_created" || trigger.type === "lead_created") && (
          <Field label="Only from this source (optional)">
            <select className="field" value={trigger.source ?? ""} onChange={(e) => setTrig({ ...trigger, source: e.target.value || undefined })}><option value="">Any source</option>{SOURCES.map((x) => <option key={x}>{x}</option>)}</select>
          </Field>
        )}
        {trigger.type === "stage_changed" && (
          <Field label="Stage"><select className="field" value={trigger.stage ?? ""} onChange={(e) => setTrig({ ...trigger, stage: e.target.value })}><option value="" disabled>Choose…</option>{stages.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
        )}
        <p className="rounded-xl bg-cloud px-4 py-3 text-[13px] text-muted">Each person enters a journey once per event. Unsubscribed people never get marketing emails.</p>
      </div>
    );
    if (sel === "goal") return (
      <div className="space-y-4">
        <h3 className="font-semibold">Goal and exit</h3>
        <p className="-mt-2 text-sm text-muted">People leave the journey the moment any of these is true. Leavers who meet it count as &ldquo;goal met&rdquo;.</p>
        {exit.map((c, i) => (
          <div key={i} className="flex items-start gap-2 rounded-xl border border-line p-3">
            <div className="min-w-0 flex-1"><CondEditor cond={c} onChange={(n) => { setExit(exit.map((x, k) => (k === i ? n : x))); setDirty(true); }} /></div>
            <button type="button" onClick={() => { setExit(exit.filter((_, k) => k !== i)); setDirty(true); }} aria-label="Remove" className="grid size-8 place-items-center rounded-full text-muted hover:bg-rose-t hover:text-rose">×</button>
          </div>
        ))}
        <Button type="button" size="sm" variant="soft" icon="plus" onClick={() => { setExit([...exit, { field: "deal.stage", op: "is", value: "won" }]); setDirty(true); }}>Add a goal</Button>
        <p className="text-[13px] text-muted">Examples: the deal is Won, the contact has the tag &ldquo;customer&rdquo;, or the contact unsubscribed.</p>
      </div>
    );
    if (!selected) return <p className="text-sm text-muted">Click any activity on the canvas to set it up.</p>;
    const a = activityOf(selected);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className={`grid size-9 place-items-center rounded-lg ${GROUP_TONE[a.group]}`}><Icon name={a.icon} className="size-4" /></span>
          <h3 className="flex-1 font-semibold">{a.label}</h3>
          <button type="button" onClick={() => { edit(removeStep(steps, selected.id)); setSel(null); }} className="rounded-full px-3 py-1.5 text-sm font-semibold text-rose hover:bg-rose-t">Delete</button>
        </div>
        {branches(selected) && selected.type !== "if" && <p className="-mt-2 text-[13px] text-muted">Deleting a split also deletes everything on its paths.</p>}
        {selected.type === "email" && (() => {
          const d = parseDesign(selected.body);
          return (
            <div className="space-y-3">
              <Field label="Subject"><input className="field" value={selected.subject} onChange={(e) => setStep({ ...selected, subject: e.target.value })} placeholder="Subject line" /></Field>
              <div className="overflow-hidden rounded-xl border border-line bg-cloud">
                {d ? <iframe title="Email preview" sandbox="" className="pointer-events-none h-56 w-[200%] origin-top-left scale-50 border-0" srcDoc={renderDesign(d, emailVars({ name: "Sarah Collins", company: "" }, settings), { business: settings?.business_name, address: settings?.address }).html} />
                  : <p className="line-clamp-6 whitespace-pre-wrap p-3 text-[13px] text-body">{selected.body || "No content yet."}</p>}
              </div>
              <Button type="button" icon="mail" onClick={() => setEmailOpen(selected.id)}>Edit email content</Button>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-[#0b8a8a]" checked={!!selected.marketing} onChange={(e) => setStep({ ...selected, marketing: e.target.checked })} />Marketing email: adds your address and an unsubscribe link, and skips unsubscribed people.</label>
              {(() => { const st = emailStats(emails, selected.id); return st.sent ? <div className="grid grid-cols-3 gap-2 text-center">{[["Sent", st.sent], ["Opened", `${Math.round((st.opened / st.sent) * 100)}%`], ["Clicked", `${Math.round((st.clicked / st.sent) * 100)}%`]].map(([l, v]) => <div key={l as string} className="rounded-xl bg-cloud py-2"><div className="font-display text-lg font-semibold text-ink">{v}</div><div className="text-[12px] text-muted">{l}</div></div>)}</div> : null; })()}
            </div>
          );
        })()}
        {(selected.type === "split" || selected.type === "ab") && <PathsEditor s={selected} setStep={setStep} />}
        {selected.type === "engage" && (
          <div className="space-y-3">
            <Field label="Check this email">
              <select className="field" value={selected.ref} onChange={(e) => setStep({ ...selected, ref: e.target.value })}>
                <option value="" disabled>Choose an email…</option>{emailSteps.map((m) => <option key={m.id} value={m.id}>{m.subject || "(no subject)"}</option>)}
              </select>
            </Field>
            <Field label="Did they…">
              <select className="field" value={selected.event} onChange={(e) => setStep({ ...selected, event: e.target.value as "open" | "click" })}><option value="open">Open it</option><option value="click">Click a link in it</option></select>
            </Field>
            <p className="text-[13px] text-muted">Put a Wait before this split so people have time to open. Opens are approximate: some email apps open every message automatically, and some block tracking.</p>
            {isDemo && <p className="rounded-xl bg-sun-t px-3 py-2 text-[13px] text-[#7a4700]">Demo mode can&apos;t track real opens, so everyone takes the &ldquo;No&rdquo; path here.</p>}
          </div>
        )}
        {selected.type === "if" && <CondEditor cond={selected.cond} onChange={(c) => setStep({ ...selected, cond: c })} />}
        {!["email", "split", "ab", "engage", "if"].includes(selected.type) && <StepBody step={selected} set={setStep} />}
      </div>
    );
  })();

  const emailStep = emailOpen ? (findStep(steps, emailOpen) as Extract<Step, { type: "email" }> | null) : null;
  const groups: Group[] = ["Messages", "Timing", "Flow control", "Actions"];

  return (
    <div className="space-y-4 pb-16">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/journeys" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><Icon name="back" className="size-4" />Journeys</Link>
        <input className="field !h-10 min-w-0 flex-1 !py-1 font-display text-lg font-semibold sm:max-w-md" aria-label="Journey name" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
        <Badge tone={saved.active ? "teal" : "gray"}>{saved.active ? "Running" : "Draft"}</Badge>
        <div className="ml-auto flex gap-2">
          <Button variant="soft" onClick={save} disabled={!dirty}>{dirty ? "Save" : "Saved"}</Button>
          <Button icon={saved.active ? undefined : "bolt"} onClick={toggle}>{saved.active ? "Pause" : "Activate"}</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {[["Entered", stats.entered], ["In journey", stats.active], ["Completed", stats.done], ["Goal met", stats.goal], ["Left early", stats.stopped]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl bg-white px-4 py-2 ring-1 ring-line"><span className="font-display text-lg font-semibold text-ink">{v}</span> <span className="text-[13px] text-muted">{l}</span></div>
        ))}
        {saved.active && dirty && <p className="self-center rounded-xl bg-sun-t px-3 py-2 text-[13px] text-[#7a4700]">Save to apply changes. People already in the journey continue from where they are.</p>}
      </div>
      {problems.length > 0 && <div role="alert" className="rounded-xl bg-rose-t px-4 py-3 text-sm text-rose"><strong>Fix these before activating:</strong><ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>}

      <Ctx.Provider value={{ steps, runs, emails, waiting, sel, hot, setSel, setHot, setAdding, onDrop, stageName }}>
      <div className={`grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)] ${sel ? "xl:grid-cols-[200px_minmax(0,1fr)_380px]" : ""}`}>
        <aside className="rounded-2xl border border-line bg-white p-3 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
          {groups.map((g) => (
            <div key={g} className="mb-3">
              <div className="mb-1.5 px-1 text-[12.5px] font-semibold text-muted">{g}</div>
              <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
                {ACTIVITIES.filter((a) => a.group === g).map((a) => (
                  <button key={a.key} type="button" draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", "act:" + a.key); e.dataTransfer.effectAllowed = "copy"; }}
                    onClick={() => insert([], steps.length, a.make())} title="Drag onto a + on the canvas, or click to add at the end"
                    className="flex cursor-grab items-center gap-2 rounded-xl border border-line bg-white px-2 py-2 text-left hover:border-teal active:cursor-grabbing">
                    <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${GROUP_TONE[a.group]}`}><Icon name={a.icon} className="size-3.5" /></span>
                    <span className="text-[13px] font-semibold leading-tight text-ink">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="px-1 text-[12px] text-muted">Drag onto a <strong>+</strong> on the canvas.</p>
        </aside>

        <div className="min-w-0 overflow-auto rounded-2xl border border-line bg-[radial-gradient(#dfe4ee_1px,transparent_1px)] [background-size:18px_18px] p-6 lg:h-[calc(100vh-220px)]" style={{ minHeight: 460 }}>
          <div className="flex w-max items-center">
            <button type="button" onClick={() => setSel("entry")} className={`w-48 shrink-0 rounded-2xl border bg-ink p-3 text-left text-white shadow-sm ${sel === "entry" ? "ring-4 ring-teal/30" : ""}`}>
              <div className="text-[12px] font-semibold text-white/60">Entry source</div>
              <div className="mt-0.5 text-[13.5px] font-semibold">{ENTRY.find((x) => x.id === trigger.type)?.label}</div>
              <div className="mt-1 text-[12px] text-white/70">{trigger.type === "form_submitted" ? data.forms.find((f) => f.id === trigger.form)?.name ?? "Any form" : trigger.type === "segment" ? data.segments.find((s) => s.id === trigger.segment)?.name ?? "Choose a segment" : trigger.tag ? `Tag: ${trigger.tag}` : trigger.stage ? stageName(trigger.stage) : trigger.source ?? ""}</div>
            </button>
            <Lane list={steps} lp={[]} prefix={[]} />
            <button type="button" onClick={() => setSel("goal")} className={`w-40 shrink-0 rounded-2xl border border-line bg-white p-3 text-left shadow-sm ${sel === "goal" ? "ring-4 ring-teal/30" : ""}`}>
              <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Icon name="check" className="size-4" /></span><span className="text-[13.5px] font-semibold text-ink">Goal and exit</span></div>
              <div className="mt-1.5 text-[12.5px] text-muted">{exit.length ? `${exit.length} goal${exit.length === 1 ? "" : "s"}` : "None set"}</div>
            </button>
          </div>
        </div>

        {sel && (
          <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-[400px] overflow-y-auto border-l border-line bg-white p-5 shadow-2xl xl:static xl:z-auto xl:max-h-[calc(100vh-220px)] xl:w-auto xl:max-w-none xl:rounded-2xl xl:border xl:shadow-none">
            <button type="button" onClick={() => setSel(null)} aria-label="Close panel" className="float-right grid size-8 place-items-center rounded-full text-muted hover:bg-cloud"><Icon name="x" className="size-4" /></button>
            {panel}
          </aside>
        )}
      </div>
      </Ctx.Provider>

      {adding && (
        <Modal title="Add an activity" onClose={() => setAdding(null)}>
          {groups.map((g) => (
            <div key={g} className="mb-4">
              <div className="mb-2 text-[13px] font-semibold text-muted">{g}</div>
              <div className="grid grid-cols-2 gap-2">
                {ACTIVITIES.filter((a) => a.group === g).map((a) => (
                  <button key={a.key} type="button" onClick={() => { insert(adding.lp, adding.index, a.make()); setAdding(null); }} className="flex items-start gap-2 rounded-xl border border-line p-2.5 text-left hover:border-teal">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${GROUP_TONE[a.group]}`}><Icon name={a.icon} className="size-4" /></span>
                    <span><span className="block text-sm font-semibold text-ink">{a.label}</span><span className="block text-[12px] text-muted">{a.hint}</span></span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Modal>
      )}
      {emailStep && (
        <Modal title="Edit email" onClose={() => setEmailOpen(null)} wide="xl">
          <EmailEditor subject={emailStep.subject} body={emailStep.body}
            onSubject={(subject) => setSteps((cur) => { setDirty(true); return mapStep(cur, emailStep.id, (s) => ({ ...s, subject }) as Step); })}
            onBody={(body) => setSteps((cur) => { setDirty(true); return mapStep(cur, emailStep.id, (s) => ({ ...s, body }) as Step); })}
            aiContact={{ name: "{{first_name}}", company: "{{company}}" }} />
          <div className="mt-4 flex justify-end"><Button onClick={() => setEmailOpen(null)}>Done</Button></div>
        </Modal>
      )}
    </div>
  );
}
