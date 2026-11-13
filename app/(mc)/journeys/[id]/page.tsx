"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { Button, Card, Field, Modal } from "@/components/ui";
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
  ACTIVITIES, CONTACT_FIELDS, ENTRY, GROUPS, GROUP_SOLID, GROUP_TONE, activityOf, allSteps, emailStats, findStep, inPath, isJourney, journeyStats,
  mapList, mapStep, posKey, posOfStep, removeStep, waitingAt, type ListPath,
} from "@/lib/journeys";

/* ---------- Helpers ---------- */
type Sel = "entry" | string | null;
type Dialog = null | "goal" | "exit" | "settings" | "validate" | "activate";
const LINE = "#c5cddd";
const getList = (steps: Step[], lp: ListPath): Step[] => {
  let l = steps;
  for (const [id, k] of lp) { const s = l.find((x) => x.id === id); l = (s && branches(s)?.[k]) || []; }
  return l;
};
const lpKey = (lp: ListPath) => lp.map(([a, b]) => `${a}:${b}`).join("/");
const ENTRY_ICON: Record<string, string> = { Contacts: "users", Deals: "pipeline", Bookings: "calendar", "Sales visits": "home" };
const entryIcon = (t: Trigger["type"]) =>
  t === "form_submitted" ? "note" : t === "segment" ? "layers" : t === "audience" ? "mail" : t === "tag_added" ? "tag" : ENTRY_ICON[ENTRY.find((x) => x.id === t)?.group ?? "Contacts"];
const fmtDate = (d: string) => { const t = new Date(d); return Number.isNaN(t.getTime()) ? d : t.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function summaryOf(s: Step, steps: Step[], stageName: (id: string) => string): string {
  switch (s.type) {
    case "email": return s.subject || "No subject yet";
    case "sms": return s.body.trim() || "No message yet";
    case "whatsapp": return s.template !== undefined ? `Template: ${s.template || "not chosen"}` : s.body.trim() || "No message yet";
    case "wait": return s.mode === "delay" ? `${s.amount} ${s.amount === 1 ? s.unit.replace(/s$/, "") : s.unit}` : s.mode === "time" ? `Until ${s.time}` : s.mode === "date" ? `Until ${fmtDate(s.date)}` : "Until an event";
    case "tag": return s.tag || "Choose a tag";
    case "task": return s.title;
    case "stage": return stageName(s.stage);
    case "split": return `${s.paths.length} paths`;
    case "ab": return s.paths.map((p) => `${p.pct ?? 0}%`).join(" / ");
    case "engage": return `${s.event === "click" ? "Clicked" : "Opened"}: ${(findStep(steps, s.ref) as { subject?: string } | null)?.subject || "choose an email"}`;
    case "join": { const t = findStep(steps, s.target); return t ? `Go to ${activityOf(t).label}` : "Choose where to go"; }
    case "update": { const f = CONTACT_FIELDS.find((x) => x.id === s.field); return `${f?.label ?? s.field} = ${s.value || "…"}`; }
    case "notify": case "log": return s.message || "…";
    default: return activityOf(s).hint;
  }
}

/* ---------- Canvas ---------- */
interface CanvasCtx {
  steps: Step[]; runs: WorkflowRun[]; emails: EmailLog[]; waiting: Map<string, number>; sel: Sel; hot: string | null; dragging: boolean;
  setSel: (s: Sel) => void; setHot: (f: (h: string | null) => string | null) => void; setAdding: (a: { lp: ListPath; index: number }) => void;
  onDrop: (e: DragEvent, lp: ListPath, index: number) => void; startDrag: (e: DragEvent, payload: string) => void; endDrag: () => void; stageName: (id: string) => string;
}
const Ctx = createContext<CanvasCtx | null>(null);
const useC = () => useContext(Ctx)!;

/** Horizontal connector, drawn at the height of a node's centre. */
const Wire = ({ w = 20, grow = false }: { w?: number; grow?: boolean }) => (
  <div className={`flex h-14 shrink-0 items-center ${grow ? "min-w-5 flex-1" : ""}`} style={grow ? undefined : { width: w }}><div className="h-0.5 w-full" style={{ background: LINE }} /></div>
);

function Drop({ lp, index }: { lp: ListPath; index: number }) {
  const { hot, setHot, setAdding, onDrop, dragging } = useC();
  const key = `${lpKey(lp)}#${index}`, on = hot === key;
  return (
    <div className="flex h-14 shrink-0 items-center">
      <div className="h-0.5 w-4" style={{ background: LINE }} />
      <button type="button" aria-label="Add an activity here" onClick={() => setAdding({ lp, index })}
        onDragOver={(e) => { e.preventDefault(); if (!on) setHot(() => key); }} onDragLeave={() => setHot((h) => (h === key ? null : h))} onDrop={(e) => onDrop(e, lp, index)}
        className={`pill grid shrink-0 place-items-center rounded-full border-2 border-dashed text-sm font-bold transition-all ${on ? "size-11 border-teal bg-teal-t text-teal-d" : dragging ? "size-9 border-teal/60 bg-white text-teal-d" : "size-7 border-[#c5cddd] bg-white text-muted opacity-70 hover:border-teal hover:text-teal-d hover:opacity-100"}`}>
        <Icon name="plus" className="size-3.5" />
      </button>
      <div className="h-0.5 w-4" style={{ background: LINE }} />
    </div>
  );
}

function NodeView({ s, pos }: { s: Step; pos: number[] }) {
  const { steps, emails, waiting, sel, setSel, stageName, startDrag, endDrag } = useC();
  const a = activityOf(s), here = waiting.get(posKey(pos)) ?? 0, on = sel === s.id;
  const st = s.type === "email" ? emailStats(emails, s.id) : null;
  return (
    <div className="flex w-[124px] shrink-0 flex-col items-center">
      <button type="button" draggable onDragStart={(e) => startDrag(e, "mv:" + s.id)} onDragEnd={endDrag} onClick={(e) => { e.stopPropagation(); setSel(s.id); }}
        aria-label={`${a.label}: ${summaryOf(s, steps, stageName)}`}
        className={`pill relative grid size-14 cursor-pointer place-items-center rounded-full text-white shadow-[0_4px_12px_rgba(17,26,46,.18)] transition hover:scale-105 ${on ? "ring-4 ring-offset-2 ring-[#2f7fd0]/50" : ""}`}
        style={{ background: GROUP_SOLID[a.group] }}>
        <Icon name={a.icon} className="size-6" />
        {here > 0 && <span className="absolute -right-2 -top-1.5 min-w-6 rounded-full bg-sun px-1.5 py-0.5 text-[11px] font-bold text-ink shadow">{here}</span>}
      </button>
      <div className="mt-2 w-full text-center">
        <div className="truncate text-[12.5px] font-semibold text-ink">{a.label}</div>
        <div className="line-clamp-2 text-[11.5px] leading-snug text-muted">{summaryOf(s, steps, stageName)}</div>
        {st && st.sent > 0 && <div className="mt-1 text-[11px] font-semibold"><span className="text-ink">{st.sent}</span> <span className="text-teal-d">{pct(st.opened, st.sent)}%o</span> <span className="text-iris">{pct(st.clicked, st.sent)}%c</span></div>}
      </div>
    </div>
  );
}

function PathLabel({ text }: { text: string }) {
  return <span className="absolute -top-2.5 left-1 max-w-[150px] truncate rounded bg-white px-1.5 text-[11.5px] font-semibold text-iris ring-1 ring-iris/25">{text}</span>;
}

function Lane({ list, lp, prefix }: { list: Step[]; lp: ListPath; prefix: number[] }) {
  const { runs } = useC();
  return (
    <div className="flex items-start">
      <Drop lp={lp} index={0} />
      {list.map((s, i) => {
        const pos = [...prefix, i], br = branches(s);
        return (
          <Fragment key={s.id}>
            {br ? (
              <div className="flex shrink-0 items-start">
                <NodeView s={s} pos={pos} />
                <Wire w={16} />
                <div className="flex flex-col">
                  {br.map((b, k) => {
                    const p = s.type === "if" ? null : (s as { paths: Path[] }).paths[k];
                    const live = inPath(runs, [...pos, k]);
                    const label = (s.type === "if" ? (k === 0 ? "Yes" : "No") : p?.label ?? `Path ${k + 1}`) + (s.type === "ab" && p?.pct !== undefined ? ` · ${p.pct}%` : "") + (live ? ` · ${live} in path` : "");
                    const first = k === 0, last = k === br.length - 1;
                    const vert = (side: "left" | "right") => (
                      <span className="absolute w-0.5" style={{ [side]: 0, background: LINE, top: first ? 27 : 0, bottom: last ? undefined : 0, height: last ? (first ? 0 : 29) : undefined }} />
                    );
                    return (
                      <div key={k} className={`relative flex items-start ${last ? "" : "pb-10"}`}>
                        {vert("left")}{vert("right")}
                        <div className="relative flex items-start"><PathLabel text={label} /><Wire w={22} /></div>
                        <Lane list={b} lp={[...lp, [s.id, k]]} prefix={[...pos, k]} />
                        <Wire grow />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : <NodeView s={s} pos={pos} />}
            <Drop lp={lp} index={i + 1} />
          </Fragment>
        );
      })}
    </div>
  );
}

/* ---------- Palette ---------- */
function Tile({ icon, label, tone, payload, onClick, title, onStart, onEnd }: { icon: string; label: string; tone: string; payload: string; onClick: () => void; title: string; onStart: (e: DragEvent, p: string) => void; onEnd: () => void }) {
  return (
    <button type="button" draggable onDragStart={(e) => onStart(e, payload)} onDragEnd={onEnd} onClick={onClick} title={title}
      className="flex cursor-grab flex-col items-center gap-1.5 rounded-lg border border-transparent px-1 py-2 text-center hover:border-line hover:bg-cloud active:cursor-grabbing">
      <span className={`grid size-10 place-items-center rounded-xl ${tone}`}><Icon name={icon} className="size-5" /></span>
      <span className="text-[11.5px] font-semibold leading-tight text-ink">{label}</span>
    </button>
  );
}
function Section({ title, children, closed = false }: { title: string; children: ReactNode; closed?: boolean }) {
  return (
    <details open={!closed} className="group border-b border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-[12.5px] font-bold text-ink hover:bg-cloud">{title}<Icon name="down" className="size-4 text-muted transition group-open:rotate-180" /></summary>
      <div className="grid grid-cols-3 gap-0.5 px-2 pb-3">{children}</div>
    </details>
  );
}

/* ---------- Paths editor for decision and random splits ---------- */
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
            {s.type === "split" && (last ? <p className="mt-2 text-[13px] text-muted">Remainder: everyone who doesn&apos;t match a path above.</p> : <div className="mt-2"><CondEditor cond={p.cond ?? { field: "contact.tags", op: "is", value: "" }} onChange={(c) => setPaths(s.paths.map((x) => (x.id === p.id ? { ...x, cond: c } : x)))} /></div>)}
          </div>
        );
      })}
      {s.paths.length < 10 && <Button type="button" size="sm" variant="soft" icon="plus" onClick={() => {
        const np: Path = s.type === "ab" ? { id: uid(), label: `Path ${s.paths.length + 1}`, pct: 0, steps: [] } : { id: uid(), label: `Path ${s.paths.length}`, cond: { field: "contact.tags", op: "is", value: "" }, steps: [] };
        setPaths(s.type === "split" ? [...s.paths.slice(0, -1), np, s.paths[s.paths.length - 1]] : [...s.paths, np]);
      }}>Add path</Button>}
      {s.type === "ab" && <p className={`text-sm font-medium ${total === 100 ? "text-teal-d" : "text-rose"}`}>Total {total}%{total !== 100 ? " (must be 100%)" : ""}</p>}
      {s.type === "split" && <p className="text-[13px] text-muted">Contacts are evaluated against each path from top to bottom and take the first one they match.</p>}
    </div>
  );
}

function CondList({ conds, onChange, empty, add }: { conds: Cond[]; onChange: (c: Cond[]) => void; empty: string; add: Cond }) {
  return (
    <div className="space-y-3">
      {conds.length === 0 && <p className="rounded-xl bg-cloud px-4 py-3 text-sm text-muted">{empty}</p>}
      {conds.map((c, i) => (
        <div key={i} className="flex items-start gap-2 rounded-xl border border-line p-3">
          {i > 0 && <span className="mt-2 text-[12px] font-bold text-muted">OR</span>}
          <div className="min-w-0 flex-1"><CondEditor cond={c} onChange={(n) => onChange(conds.map((x, k) => (k === i ? n : x)))} /></div>
          <button type="button" onClick={() => onChange(conds.filter((_, k) => k !== i))} aria-label="Remove" className="grid size-8 place-items-center rounded-full text-muted hover:bg-rose-t hover:text-rose">×</button>
        </div>
      ))}
      <Button type="button" size="sm" variant="soft" icon="plus" onClick={() => onChange([...conds, add])}>Add criteria</Button>
    </div>
  );
}

/* ---------- Page ---------- */
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
  const [sel, setSel] = useState<Sel>(null);
  const [adding, setAdding] = useState<{ lp: ListPath; index: number } | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [emailOpen, setEmailOpen] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [tab, setTab] = useState<"canvas" | "analytics">("canvas");
  const [q, setQ] = useState("");
  const [view, setView] = useState({ x: 40, y: 80, z: 1 });
  const vp = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copy the saved journey into the editor once it has loaded
    if (saved && !loaded) { setName(saved.name); setTrigger(saved.trigger); setExit(saved.exit); setSteps(saved.steps); setLoaded(true); }
  }, [saved, loaded]);

  /** Fit the whole journey on screen. On first load, never shrink below 85% so labels stay readable. */
  const fit = useCallback((readable = false) => {
    const r = vp.current?.getBoundingClientRect(), el = inner.current;
    if (!r || !el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const z = Math.max(readable ? 0.85 : 0.3, Math.min(1, (r.width - 80) / w, (r.height - 80) / h));
    setView({ z, x: Math.max(40, (r.width - w * z) / 2), y: Math.max(48, (r.height - h * z) / 2.4) });
  }, [setView]);
  useEffect(() => { if (loaded && tab === "canvas") { const t = setTimeout(() => fit(true), 60); return () => clearTimeout(t); } }, [loaded, tab, fit]);

  // Wheel pans the canvas; Ctrl/Cmd + wheel (or a pinch) zooms around the pointer.
  useEffect(() => {
    const el = vp.current; if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
        setView((v) => { const z = Math.max(0.3, Math.min(1.6, v.z * (e.deltaY < 0 ? 1.1 : 0.9))); return { z, x: px - ((px - v.x) * z) / v.z, y: py - ((py - v.y) * z) / v.z }; });
      } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [loaded, tab]);

  const runs = useMemo(() => data.workflow_runs.filter((r) => r.workflow_id === id), [data.workflow_runs, id]);
  const waiting = useMemo(() => waitingAt(runs), [runs]);
  const emails = data.emails;

  const edit = (next: Step[]) => { setSteps(next); setDirty(true); };
  const setStep = (s: Step) => edit(mapStep(steps, s.id, () => s));
  const del = (sid: string) => { edit(removeStep(steps, sid)); setSel(null); };

  // Delete / Backspace removes the selected activity (unless you're typing).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (dialog || emailOpen || !sel || sel === "entry" || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); setSteps((cur) => removeStep(cur, sel)); setDirty(true); setSel(null); }
      if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [sel, dialog, emailOpen]);

  if (!ready) return null;
  if (!saved || !isJourney(saved)) return <Card><p>That journey doesn&apos;t exist. <Link href="/journeys" className="font-semibold text-teal-d hover:underline">Back to journeys</Link></p></Card>;

  const stats = journeyStats(runs);
  const status = saved.active ? "Running" : runs.length ? "Paused" : "Draft";
  const version = trigger.version ?? 1;
  const insert = (lp: ListPath, index: number, s: Step) => { edit(mapList(steps, lp, (l) => [...l.slice(0, index), s, ...l.slice(index)])); setSel(s.id); };
  const move = (sid: string, lp: ListPath, index: number) => {
    if (lp.some(([x]) => x === sid)) return toast("A split can't be moved inside its own paths");
    const s = findStep(steps, sid); if (!s) return;
    const target = getList(steps, lp), old = target.findIndex((x) => x.id === sid);
    const at = old >= 0 && old < index ? index - 1 : index;
    edit(mapList(removeStep(steps, sid), lp, (l) => [...l.slice(0, at), s, ...l.slice(at)])); setSel(sid);
  };
  const setTrig = (t: Trigger) => { setTrigger(t); setDirty(true); };
  const startDrag = (e: DragEvent, payload: string) => { e.dataTransfer.setData("text/plain", payload); e.dataTransfer.effectAllowed = payload.startsWith("mv:") ? "move" : "copy"; setDragging(true); };
  const endDrag = () => { setDragging(false); setHot(null); };
  const onDrop = (e: DragEvent, lp: ListPath, index: number) => {
    e.preventDefault(); endDrag();
    const d = e.dataTransfer.getData("text/plain");
    if (d.startsWith("act:")) { const a = ACTIVITIES.find((x) => x.key === d.slice(4)); if (a) insert(lp, index, a.make()); }
    else if (d.startsWith("mv:")) move(d.slice(3), lp, index);
    else if (d.startsWith("entry:")) toast("Drop entry sources on the Entry Source at the start of the journey");
  };
  const setEntry = (t: Trigger["type"]) => { setTrig({ type: t, reentry: trigger.reentry, goal: trigger.goal, version: trigger.version }); setSel("entry"); };

  /* ---------- Validation ---------- */
  function validate() {
    const errors: string[] = [], warnings: string[] = [];
    if (trigger.type === "tag_added" && !trigger.tag) errors.push("Entry source: choose the tag that starts this journey.");
    if (trigger.type === "stage_changed" && !trigger.stage) errors.push("Entry source: choose the deal stage that starts this journey.");
    if (trigger.type === "segment" && !data.segments.some((s) => s.id === trigger.segment)) errors.push("Entry source: choose the smart segment.");
    if (!steps.length) errors.push("Add at least one activity to the canvas.");
    const all = allSteps(steps);
    for (const s of all) {
      const n = activityOf(s).label;
      if (s.type === "email" && (!s.subject.trim() || (!parseDesign(s.body) && !s.body.trim()))) errors.push(`${n}: every email needs a subject and content.`);
      if (s.type === "email" && !s.marketing) warnings.push(`${n} "${s.subject || "untitled"}" isn't marked as marketing, so it has no unsubscribe link and is sent even to unsubscribed people.`);
      if (s.type === "sms" && !s.body.trim()) errors.push("SMS: the message is empty.");
      if (s.type === "whatsapp" && (s.template !== undefined ? !s.template.trim() : !s.body.trim())) errors.push(s.template !== undefined ? "WhatsApp: enter the approved template name." : "WhatsApp: the message is empty.");
      if (s.type === "whatsapp" && s.template === undefined) warnings.push("WhatsApp free-text messages only deliver within 24 hours of the contact's last message. Use an approved template for first contact.");
      if (s.type === "engage" && !findStep(steps, s.ref)) errors.push("Engagement Split: choose the email to check.");
      if (s.type === "ab" && s.paths.reduce((a, x) => a + (x.pct ?? 0), 0) !== 100) errors.push("Random Split: path percentages must add up to 100.");
      if (s.type === "tag" && !s.tag.trim()) errors.push(`${n}: choose a tag.`);
      if (s.type === "wait" && s.mode === "date" && !s.date) errors.push("Wait Until Date: choose a date.");
      if (s.type === "update" && !CONTACT_FIELDS.find((f) => f.id === s.field)?.bool && !s.value.trim()) errors.push("Update Contact: enter the new value.");
      if (s.type === "join") {
        const to = posOfStep(steps, s.target), at = posOfStep(steps, s.id);
        if (!to) errors.push("Join: choose the activity to send people to.");
        else if (at && posKey(to) <= posKey(at) && !all.some((x) => x.type === "wait")) errors.push("Join: going back to an earlier activity needs a Wait in the loop, or people would loop forever.");
      }
    }
    if (!exit.length && !(trigger.goal?.length)) warnings.push("No goal or exit criteria. People stay until they reach the end of the journey.");
    return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
  }
  const v = validate();

  const persist = async (patch: Record<string, unknown> = {}) => {
    const bump = dirty && saved.active && runs.length > 0;
    const t = bump ? { ...trigger, version: version + 1 } : trigger;
    if (bump) setTrigger(t);
    await update("workflows", saved.id, { name: name.trim() || "Untitled journey", trigger: t, exit, steps, ...patch });
    setDirty(false);
    return bump;
  };
  async function save() { const bumped = await persist(); toast(bumped ? `Saved as version ${version + 1}. People already in the journey carry on from where they are.` : "Journey saved"); }
  async function activate() {
    if (v.errors.length) return setDialog("validate");
    await persist({ active: true, activated_at: saved!.activated_at && runs.length ? saved!.activated_at : new Date().toISOString() });
    setDialog(null); toast("Journey activated");
  }
  async function pause() { await update("workflows", saved!.id, { active: false }); toast("Journey paused. Nobody new enters and contacts already in it wait where they are."); }

  /* ---------- Inspector ---------- */
  const selected = sel && sel !== "entry" ? findStep(steps, sel) : null;
  const emailSteps = allSteps(steps).filter((s): s is Extract<Step, { type: "email" }> => s.type === "email");
  const tags = [...new Set(data.contacts.flatMap((c) => c.tags))].sort();
  const audienceCount = data.contacts.filter((c) => c.email && !c.unsubscribed && (!trigger.tag || c.tags.includes(trigger.tag))).length;
  const entryDef = ENTRY.find((x) => x.id === trigger.type);
  const entryDetail = trigger.type === "form_submitted" ? data.forms.find((f) => f.id === trigger.form)?.name ?? "Any form" : trigger.type === "segment" ? data.segments.find((s) => s.id === trigger.segment)?.name ?? "Choose a segment" : trigger.tag ? `Tag: ${trigger.tag}` : trigger.stage ? stageName(trigger.stage) : trigger.source ?? (trigger.type === "audience" ? "Everyone with an email" : "");

  const entryPanel = (
    <div className="space-y-4">
      <Field label="Entry source type">
        <select className="field" value={trigger.type} onChange={(e) => setEntry(e.target.value as Trigger["type"])}>
          {["Contacts", "Bookings", "Deals", "Sales visits"].map((g) => <optgroup key={g} label={g}>{ENTRY.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</optgroup>)}
        </select>
      </Field>
      <p className="-mt-2 text-[13px] text-muted">{entryDef?.hint}</p>
      {(trigger.type === "tag_added" || trigger.type === "audience") && (
        <Field label={trigger.type === "audience" ? "Only contacts with this tag (optional)" : "Tag"}>
          <input className="field" list="journey-tags" value={trigger.tag ?? ""} onChange={(e) => setTrig({ ...trigger, tag: e.target.value.toLowerCase().trim() })} placeholder={trigger.type === "audience" ? "Leave empty for everyone" : "e.g. newsletter"} />
          <datalist id="journey-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
      )}
      {trigger.type.startsWith("booking_") && (
        <Field label="Service or class"><select className="field" value={trigger.service ?? ""} onChange={(e) => setTrig({ ...trigger, service: e.target.value || undefined })}><option value="">Any</option>{data.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      )}
      {trigger.type === "form_submitted" && (
        <Field label="Form"><select className="field" value={trigger.form ?? ""} onChange={(e) => setTrig({ ...trigger, form: e.target.value || undefined })}><option value="">Any form</option>{data.forms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>
      )}
      {trigger.type === "segment" && (
        <Field label="Smart segment">
          <select className="field" value={trigger.segment ?? ""} onChange={(e) => setTrig({ ...trigger, segment: e.target.value })}><option value="" disabled>Choose a segment…</option>{data.segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          {data.segments.length === 0 && <p className="mt-1.5 text-[13px] text-muted"><Link href="/marketing/lists" className="font-semibold text-teal-d hover:underline">Create a smart segment</Link> first.</p>}
        </Field>
      )}
      {trigger.type === "audience" && <div className="rounded-xl bg-teal-t px-4 py-3 text-teal-d"><span className="font-display text-2xl font-semibold">{audienceCount}</span> <span className="text-sm font-medium">contacts match right now</span></div>}
      {(trigger.type === "contact_created" || trigger.type === "lead_created") && (
        <Field label="Only from this source (optional)"><select className="field" value={trigger.source ?? ""} onChange={(e) => setTrig({ ...trigger, source: e.target.value || undefined })}><option value="">Any source</option>{SOURCES.map((x) => <option key={x}>{x}</option>)}</select></Field>
      )}
      {trigger.type === "stage_changed" && (
        <Field label="Stage"><select className="field" value={trigger.stage ?? ""} onChange={(e) => setTrig({ ...trigger, stage: e.target.value })}><option value="" disabled>Choose…</option>{stages.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
      )}
      <p className="rounded-xl bg-cloud px-4 py-3 text-[13px] text-muted">Re-entry rules are in <button type="button" className="font-semibold text-teal-d hover:underline" onClick={() => setDialog("settings")}>Journey Settings</button>. Unsubscribed contacts never get marketing emails.</p>
    </div>
  );

  const stepPanel = (s: Step): ReactNode => {
    if (s.type === "email") {
      const d = parseDesign(s.body), st = emailStats(emails, s.id);
      return (
        <div className="space-y-3">
          <Field label="Subject line"><input className="field" value={s.subject} onChange={(e) => setStep({ ...s, subject: e.target.value })} placeholder="Subject line" /></Field>
          <div className={`overflow-hidden rounded-xl border border-line bg-cloud ${d ? "h-80" : ""}`}>
            {d ? <iframe title="Email preview" sandbox="" className="pointer-events-none h-[640px] w-[200%] origin-top-left scale-50 border-0" srcDoc={renderDesign(d, emailVars({ name: "Sarah Collins", company: "" }, settings), { business: settings?.business_name, address: settings?.address, unsubscribeUrl: s.marketing ? "#" : undefined }).html} />
              : <p className="line-clamp-6 whitespace-pre-wrap p-3 text-[13px] text-body">{s.body || "No content yet."}</p>}
          </div>
          <Button type="button" icon="mail" onClick={() => setEmailOpen(s.id)}>Edit email content</Button>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-[#0b8a8a]" checked={!!s.marketing} onChange={(e) => setStep({ ...s, marketing: e.target.checked })} />Commercial (marketing) email: adds your address and an unsubscribe link, and skips unsubscribed contacts.</label>
          {st.sent > 0 && <div className="grid grid-cols-3 gap-2 text-center">{[["Sent", st.sent], ["Opened", `${pct(st.opened, st.sent)}%`], ["Clicked", `${pct(st.clicked, st.sent)}%`]].map(([l, x]) => <div key={l as string} className="rounded-xl bg-cloud py-2"><div className="font-display text-lg font-semibold text-ink">{x}</div><div className="text-[12px] text-muted">{l}</div></div>)}</div>}
        </div>
      );
    }
    if (s.type === "whatsapp") {
      const tpl = s.template !== undefined;
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[[false, "Free text", "Only within 24 hours of their last message"], [true, "Approved template", "For first contact and marketing"]].map(([val, t, d]) => (
              <button key={String(val)} type="button" onClick={() => setStep({ ...s, template: val ? s.template ?? "" : undefined })} className={`rounded-xl border p-3 text-left ${tpl === val ? "border-teal bg-teal-t/50" : "border-line"}`}>
                <span className="block text-sm font-semibold text-ink">{t as string}</span><span className="block text-[12px] text-muted">{d as string}</span>
              </button>
            ))}
          </div>
          {tpl ? (
            <>
              <Field label="Template name" hint="Exactly as approved in WhatsApp Manager."><input className="field" value={s.template ?? ""} onChange={(e) => setStep({ ...s, template: e.target.value.trim() })} placeholder="e.g. appointment_reminder" /></Field>
              <Field label="Language code"><input className="field" value={s.lang ?? "en"} onChange={(e) => setStep({ ...s, lang: e.target.value.trim() })} placeholder="en, en_US, hi…" /></Field>
              <Field label="Template variables" hint="One per line, in order: line 1 fills {{1}}, line 2 fills {{2}}. Merge fields like {{first}} work."><textarea className="field !min-h-[90px]" value={(s.params ?? []).join("\n")} onChange={(e) => setStep({ ...s, params: e.target.value.split("\n") })} /></Field>
            </>
          ) : <StepBody step={{ id: s.id, type: "sms", body: s.body }} set={(x) => setStep({ ...s, body: (x as { body: string }).body })} />}
        </div>
      );
    }
    if (s.type === "join") return (
      <div className="space-y-3">
        <Field label="Send contacts to">
          <select className="field" value={s.target} onChange={(e) => setStep({ ...s, target: e.target.value })}>
            <option value="" disabled>Choose an activity…</option>
            {allSteps(steps).filter((x) => x.id !== s.id && x.type !== "join").map((x) => <option key={x.id} value={x.id}>{activityOf(x).label}: {summaryOf(x, steps, stageName).slice(0, 50)}</option>)}
          </select>
        </Field>
        <p className="text-[13px] text-muted">Contacts who reach this Join carry on from the chosen activity. Use it to merge paths back together, or to loop back (with a Wait in the loop).</p>
      </div>
    );
    if (s.type === "update") {
      const f = CONTACT_FIELDS.find((x) => x.id === s.field);
      return (
        <div className="space-y-3">
          <Field label="Field"><select className="field" value={s.field} onChange={(e) => { const nf = CONTACT_FIELDS.find((x) => x.id === e.target.value)!; setStep({ ...s, field: nf.id, value: nf.bool ? "true" : "" }); }}>{CONTACT_FIELDS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
          {f?.bool ? (
            <Field label="Set to"><select className="field" value={s.value} onChange={(e) => setStep({ ...s, value: e.target.value })}><option value="true">Yes (opted out)</option><option value="false">No (opted in)</option></select></Field>
          ) : <Field label="New value" hint="Merge fields like {{company}} work."><input className="field" value={s.value} onChange={(e) => setStep({ ...s, value: e.target.value })} /></Field>}
        </div>
      );
    }
    if (s.type === "split" || s.type === "ab") return <PathsEditor s={s} setStep={setStep} />;
    if (s.type === "engage") return (
      <div className="space-y-3">
        <Field label="Email to check"><select className="field" value={s.ref} onChange={(e) => setStep({ ...s, ref: e.target.value })}><option value="" disabled>Choose an email…</option>{emailSteps.map((m) => <option key={m.id} value={m.id}>{m.subject || "(no subject)"}</option>)}</select></Field>
        <Field label="Engagement type"><select className="field" value={s.event} onChange={(e) => setStep({ ...s, event: e.target.value as "open" | "click" })}><option value="open">Email opened</option><option value="click">Link clicked</option></select></Field>
        <p className="text-[13px] text-muted">Put a Wait by Duration before this split so contacts have time to engage. Opens are approximate: some email apps open every message automatically, and some block tracking.</p>
        {isDemo && <p className="rounded-xl bg-sun-t px-3 py-2 text-[13px] text-[#7a4700]">The demo can&apos;t track real opens, so everyone takes the &ldquo;No&rdquo; path.</p>}
      </div>
    );
    if (s.type === "if") return <CondEditor cond={s.cond} onChange={(c) => setStep({ ...s, cond: c })} />;
    if (s.type === "tag") return (
      <Field label={s.remove ? "Tag to remove" : "Tag to add"}>
        <input className="field" list="journey-tags-2" value={s.tag} onChange={(e) => setStep({ ...s, tag: e.target.value.toLowerCase() })} placeholder="e.g. engaged" />
        <datalist id="journey-tags-2">{tags.map((t) => <option key={t} value={t} />)}</datalist>
      </Field>
    );
    return <StepBody step={s} set={setStep} />;
  };

  const inspector = sel === "entry"
    ? { icon: entryIcon(trigger.type), color: "#111a2e", title: "Entry Source", hint: "Who enters this journey, and when.", body: entryPanel, canDelete: false }
    : selected ? (() => { const a = activityOf(selected); return { icon: a.icon, color: GROUP_SOLID[a.group], title: a.label, hint: a.hint + (branches(selected) ? ". Deleting it also deletes everything on its paths." : ""), body: stepPanel(selected), canDelete: true }; })()
    : null;

  /* ---------- Palette ---------- */
  const match = (t: string) => !q.trim() || t.toLowerCase().includes(q.trim().toLowerCase());
  /* ---------- Analytics ---------- */
  const analytics = (() => {
    const exited = stats.stopped + stats.done;
    const rows = emailSteps.map((m) => ({ m, ...emailStats(emails, m.id), unsub: 0 }));
    const where = allSteps(steps).map((s) => { const p = posOfStep(steps, s.id); return { s, n: p ? waiting.get(posKey(p)) ?? 0 : 0 }; }).filter((x) => x.n > 0);
    return (
      <div className="h-full overflow-auto bg-cloud p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[["Total entries", stats.entered, ""], ["Currently in journey", stats.active, ""], ["Goal met", stats.goal, `${pct(stats.goal, stats.entered)}% conversion`], ["Completed", stats.done, ""], ["Exited", exited, `${stats.stopped} left early`]].map(([l, n, sub]) => (
              <div key={l as string} className="rounded-2xl bg-white p-4 ring-1 ring-line"><div className="text-[12.5px] font-semibold text-muted">{l}</div><div className="mt-1 font-display text-3xl font-semibold text-ink">{n}</div>{sub && <div className="text-[12px] text-muted">{sub}</div>}</div>
            ))}
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-line">
            <div className="border-b border-line px-5 py-3 font-semibold">Email performance</div>
            {rows.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No emails in this journey.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[12.5px] text-muted"><th className="px-5 py-2 font-semibold">Email</th><th className="px-3 font-semibold">Sent</th><th className="px-3 font-semibold">Opens</th><th className="px-3 font-semibold">Open rate</th><th className="px-3 font-semibold">Clicks</th><th className="px-3 font-semibold">Click rate</th></tr></thead>
                <tbody>{rows.map(({ m, sent, opened, clicked }) => (
                  <tr key={m.id} className="border-t border-line"><td className="px-5 py-2.5"><button type="button" className="font-semibold text-ink hover:text-teal-d" onClick={() => { setTab("canvas"); setSel(m.id); }}>{m.subject || "(no subject)"}</button></td><td className="px-3">{sent}</td><td className="px-3">{opened}</td><td className="px-3 font-semibold text-teal-d">{pct(opened, sent)}%</td><td className="px-3">{clicked}</td><td className="px-3 font-semibold text-iris">{pct(clicked, sent)}%</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-line">
            <div className="border-b border-line px-5 py-3 font-semibold">Where contacts are now</div>
            {where.length === 0 ? <p className="px-5 py-6 text-sm text-muted">Nobody is waiting in this journey right now.</p> : (
              <ul>{where.map(({ s, n }) => { const a = activityOf(s); return (
                <li key={s.id} className="flex items-center gap-3 border-t border-line px-5 py-2.5 first:border-0"><span className="grid size-8 place-items-center rounded-full text-white" style={{ background: GROUP_SOLID[a.group] }}><Icon name={a.icon} className="size-4" /></span><span className="flex-1 text-sm"><span className="font-semibold text-ink">{a.label}</span> <span className="text-muted">{summaryOf(s, steps, stageName)}</span></span><span className="font-display text-lg font-semibold">{n}</span></li>
              ); })}</ul>
            )}
          </div>
        </div>
      </div>
    );
  })();

  const emailStep = emailOpen ? (findStep(steps, emailOpen) as Extract<Step, { type: "email" }> | null) : null;
  const statusTone = status === "Running" ? "bg-[#e3f6ec] text-[#16794a]" : status === "Paused" ? "bg-sun-t text-[#8a5200]" : "bg-cloud text-body";
  const reentryLabel = { event: "Re-entry anytime", once: "No re-entry", after_exit: "Re-entry only after exiting" }[trigger.reentry ?? "event"];

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-4">
        <Link href="/journeys" aria-label="Back to journeys" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-cloud hover:text-ink"><Icon name="back" className="size-5" /></Link>
        <span className="hidden size-8 place-items-center rounded-lg bg-gradient-to-br from-teal via-[#2f7fd0] to-iris text-white sm:grid"><Icon name="route" className="size-4" /></span>
        <input className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-[17px] font-semibold text-ink hover:border-line focus:border-teal focus:outline-none sm:max-w-sm" aria-label="Journey name" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
        <span className="hidden rounded-md bg-cloud px-2 py-1 text-[12px] font-semibold text-body md:inline">Version {version}</span>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${statusTone}`}>{status}</span>
        {dirty && <span className="hidden text-[12.5px] text-muted lg:inline">Unsaved changes</span>}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="soft" size="sm" onClick={() => setDialog("validate")}>Validate{v.errors.length ? ` (${v.errors.length})` : ""}</Button>
          <Button variant="soft" size="sm" onClick={save} disabled={!dirty}>Save</Button>
          {saved.active ? <Button size="sm" variant="soft" icon="pause" onClick={pause}>Pause</Button> : <Button size="sm" icon="play" onClick={() => setDialog("activate")}>{status === "Paused" ? "Resume" : "Activate"}</Button>}
        </div>
      </div>
      {/* Canvas toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-[#f7f9fc] px-3 text-[13px]">
        <div className="mr-2 flex rounded-lg bg-white p-0.5 ring-1 ring-line">
          {(["canvas", "analytics"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-md px-3 py-1 font-semibold capitalize ${tab === t ? "bg-ink text-white" : "text-body hover:text-ink"}`}>{t === "canvas" ? "Canvas" : "Journey Analytics"}</button>)}
        </div>
        {[["target", "Goal", trigger.goal?.length ? `${trigger.goal.length} set` : "None", "goal"], ["exit", "Exit Criteria", exit.length ? `${exit.length} set` : "None", "exit"], ["settings", "Journey Settings", reentryLabel, "settings"]].map(([ic, l, sub, d]) => (
          <button key={d} type="button" onClick={() => setDialog(d as Dialog)} className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 font-semibold text-body hover:bg-white hover:text-ink">
            <Icon name={ic} className="size-4 text-muted" />{l}<span className="font-normal text-muted">· {sub}</span>
          </button>
        ))}
        {stats.entered > 0 && (
          <div className="ml-auto hidden shrink-0 items-center gap-4 pl-4 text-[12.5px] lg:flex">
            {[["Entered", stats.entered], ["In journey", stats.active], ["Goal met", stats.goal], ["Exited", stats.done + stats.stopped]].map(([l, n]) => <span key={l as string}><strong className="text-ink">{n}</strong> <span className="text-muted">{l}</span></span>)}
          </div>
        )}
      </div>

      <Ctx.Provider value={{ steps, runs, emails, waiting, sel, hot, dragging, setSel, setHot, setAdding, onDrop, startDrag, endDrag, stageName }}>
        <div className="flex min-h-0 flex-1">
          {tab === "canvas" && (
            <aside className="hidden w-[252px] shrink-0 overflow-y-auto border-r border-line bg-white md:block">
              <div className="border-b border-line p-3">
                <label className="relative block"><Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field !h-9 !pl-8 !text-[13px]" placeholder="Search activities" value={q} onChange={(e) => setQ(e.target.value)} /></label>
              </div>
              <Section title="Entry Sources" closed={!q.trim()}>
                {ENTRY.filter((x) => match(x.label)).map((x) => <Tile key={x.id} icon={entryIcon(x.id)} label={x.label} tone="bg-ink text-white" payload={"entry:" + x.id} onClick={() => setEntry(x.id)} title={x.hint} onStart={startDrag} onEnd={endDrag} />)}
              </Section>
              {GROUPS.map((g) => {
                const list = ACTIVITIES.filter((a) => a.group === g && match(a.label));
                return list.length ? (
                  <Section key={g} title={g}>
                    {list.map((a) => <Tile key={a.key} icon={a.icon} label={a.label} tone={GROUP_TONE[a.group]} payload={"act:" + a.key} onClick={() => insert([], steps.length, a.make())} title={`${a.hint}. Drag onto the canvas, or click to add at the end.`} onStart={startDrag} onEnd={endDrag} />)}
                  </Section>
                ) : null;
              })}
              <p className="px-4 py-3 text-[12px] text-muted">Drag an activity onto a <strong>+</strong> on the canvas. Drag activities on the canvas to move them.</p>
            </aside>
          )}

          {tab === "analytics" ? <div className="min-w-0 flex-1">{analytics}</div> : (
            <div className="relative min-w-0 flex-1">
              <div ref={vp} className="absolute inset-0 cursor-grab overflow-hidden bg-[#f4f6fb] bg-[radial-gradient(#d9dfeb_1px,transparent_1px)] [background-size:20px_20px] active:cursor-grabbing"
                onPointerDown={(e) => { if ((e.target as HTMLElement).closest("button,input,select,a")) return; pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
                onPointerMove={(e) => { const p = pan.current; if (p) setView((v0) => ({ ...v0, x: p.vx + e.clientX - p.x, y: p.vy + e.clientY - p.y })); }}
                onPointerUp={(e) => { if (pan.current && Math.abs(e.clientX - pan.current.x) + Math.abs(e.clientY - pan.current.y) < 4 && !(e.target as HTMLElement).closest("button")) setSel(null); pan.current = null; }}
                style={{ backgroundPosition: `${view.x}px ${view.y}px` }}>
                <div ref={inner} className="absolute left-0 top-0 flex w-max origin-top-left items-start pb-10 pr-10" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
                  {/* Entry source */}
                  <div className="flex w-[132px] shrink-0 flex-col items-center"
                    onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); endDrag(); const d = e.dataTransfer.getData("text/plain"); if (d.startsWith("entry:")) setEntry(d.slice(6) as Trigger["type"]); }}>
                    <button type="button" onClick={() => setSel("entry")} aria-label="Entry source"
                      className={`grid size-14 place-items-center rounded-2xl bg-ink text-white shadow-[0_4px_12px_rgba(17,26,46,.25)] transition hover:scale-105 ${sel === "entry" ? "ring-4 ring-offset-2 ring-[#2f7fd0]/50" : ""}`}>
                      <Icon name={entryIcon(trigger.type)} className="size-6" />
                    </button>
                    <div className="mt-2 w-full text-center"><div className="text-[11px] font-semibold text-muted">Entry Source</div><div className="text-[12.5px] font-semibold leading-tight text-ink">{entryDef?.label}</div>{entryDetail && <div className="truncate text-[11.5px] text-muted">{entryDetail}</div>}</div>
                  </div>
                  <Lane list={steps} lp={[]} prefix={[]} />
                  {/* End of journey */}
                  <div className="flex w-[84px] shrink-0 flex-col items-center">
                    <span className="grid size-14 place-items-center"><span className="grid size-10 place-items-center rounded-full border-2 border-[#c5cddd] bg-white text-muted"><Icon name="flag" className="size-4" /></span></span>
                    <div className="mt-2 text-[12px] font-semibold text-muted">Exit</div>
                  </div>
                </div>
                {steps.length === 0 && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-24 text-center text-sm text-muted">Drag an activity from the left onto the <strong>+</strong> after the Entry Source.</div>
                )}
              </div>
              {/* Zoom controls */}
              <div className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-xl bg-white p-1 shadow-lg ring-1 ring-line" style={{ right: inspector ? 436 : 16 }}>
                <button type="button" aria-label="Zoom out" onClick={() => setView((v0) => ({ ...v0, z: Math.max(0.3, v0.z - 0.1) }))} className="grid size-8 place-items-center rounded-lg hover:bg-cloud"><Icon name="minus" className="size-4" /></button>
                <span className="w-12 text-center text-[12.5px] font-semibold tabular-nums">{Math.round(view.z * 100)}%</span>
                <button type="button" aria-label="Zoom in" onClick={() => setView((v0) => ({ ...v0, z: Math.min(1.6, v0.z + 0.1) }))} className="grid size-8 place-items-center rounded-lg hover:bg-cloud"><Icon name="plus" className="size-4" /></button>
                <span className="mx-1 h-5 w-px bg-line" />
                <button type="button" aria-label="Fit to screen" title="Fit to screen" onClick={() => fit()} className="grid size-8 place-items-center rounded-lg hover:bg-cloud"><Icon name="expand" className="size-4" /></button>
              </div>
              {/* Inspector */}
              {inspector && (
                <aside className="absolute inset-y-3 right-3 flex w-[min(420px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl" aria-label={`${inspector.title} settings`}>
                  <div className="flex items-start gap-3 border-b border-line p-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full text-white" style={{ background: inspector.color }}><Icon name={inspector.icon} className="size-5" /></span>
                    <div className="min-w-0 flex-1"><h2 className="font-semibold text-ink">{inspector.title}</h2><p className="text-[12.5px] text-muted">{inspector.hint}</p></div>
                    <button type="button" onClick={() => setSel(null)} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted hover:bg-cloud"><Icon name="x" className="size-4" /></button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-4">{inspector.body}</div>
                  <div className="flex items-center gap-2 border-t border-line p-3">
                    {inspector.canDelete && <button type="button" onClick={() => del(sel!)} className="rounded-full px-3 py-1.5 text-sm font-semibold text-rose hover:bg-rose-t">Delete</button>}
                    <Button size="sm" className="ml-auto" onClick={() => setSel(null)}>Done</Button>
                  </div>
                </aside>
              )}
            </div>
          )}
        </div>
      </Ctx.Provider>

      {/* Add activity (from a + on the canvas) */}
      {adding && (
        <Modal title="Add an activity" onClose={() => setAdding(null)} wide>
          {GROUPS.map((g) => (
            <div key={g} className="mb-4">
              <div className="mb-2 text-[13px] font-bold text-ink">{g}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ACTIVITIES.filter((a) => a.group === g).map((a) => (
                  <button key={a.key} type="button" onClick={() => { insert(adding.lp, adding.index, a.make()); setAdding(null); }} className="flex items-start gap-2 rounded-xl border border-line p-2.5 text-left hover:border-teal">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full text-white" style={{ background: GROUP_SOLID[a.group] }}><Icon name={a.icon} className="size-4" /></span>
                    <span><span className="block text-sm font-semibold text-ink">{a.label}</span><span className="block text-[12px] text-muted">{a.hint}</span></span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Modal>
      )}

      {dialog === "goal" && (
        <Modal title="Goal" onClose={() => setDialog(null)}>
          <p className="mb-4 text-sm text-muted">The outcome this journey is for. Contacts who meet the goal leave the journey and count as converted in Journey Analytics.</p>
          <CondList conds={trigger.goal ?? []} onChange={(g) => setTrig({ ...trigger, goal: g })} empty="No goal set." add={{ field: "deal.stage", op: "is", value: "won" }} />
          <div className="mt-5 flex justify-end"><Button onClick={() => setDialog(null)}>Done</Button></div>
        </Modal>
      )}
      {dialog === "exit" && (
        <Modal title="Exit Criteria" onClose={() => setDialog(null)}>
          <p className="mb-4 text-sm text-muted">Contacts are removed from the journey as soon as they match any of these, without counting as converted. For example: they unsubscribed, or they became a customer another way.</p>
          <CondList conds={exit} onChange={(c) => { setExit(c); setDirty(true); }} empty="No exit criteria. Contacts stay until they reach the end or meet the goal." add={{ field: "contact.unsubscribed", op: "is", value: "true" }} />
          <div className="mt-5 flex justify-end"><Button onClick={() => setDialog(null)}>Done</Button></div>
        </Modal>
      )}
      {dialog === "settings" && (
        <Modal title="Journey Settings" onClose={() => setDialog(null)}>
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-semibold">Contact entry mode</div>
              <div className="space-y-2">
                {([["once", "No re-entry", "A contact can enter this journey once, ever."], ["after_exit", "Re-entry only after exiting", "A contact can enter again, but only after leaving the journey."], ["event", "Re-entry anytime", "A contact enters every time the entry event happens, even if they're already in the journey."]] as const).map(([k, t, d]) => (
                  <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${(trigger.reentry ?? "event") === k ? "border-teal bg-teal-t/40" : "border-line"}`}>
                    <input type="radio" name="reentry" className="mt-1 accent-[#0b8a8a]" checked={(trigger.reentry ?? "event") === k} onChange={() => setTrig({ ...trigger, reentry: k })} />
                    <span><span className="block text-sm font-semibold text-ink">{t}</span><span className="block text-[13px] text-muted">{d}</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-cloud px-4 py-3 text-[13px] text-muted">Sending: marketing emails come from <strong className="text-ink">{settings?.sender_name || "your sender name"}</strong> and always include your address and an unsubscribe link. Change these in Settings.</div>
          </div>
          <div className="mt-5 flex justify-end"><Button onClick={() => setDialog(null)}>Done</Button></div>
        </Modal>
      )}
      {dialog === "validate" && (
        <Modal title="Validation" onClose={() => setDialog(null)}>
          {v.errors.length === 0 ? <div className="flex items-center gap-3 rounded-xl bg-[#e3f6ec] px-4 py-3 text-[#16794a]"><Icon name="check" className="size-5" /><span className="font-semibold">No errors. This journey is ready to activate.</span></div>
            : <div className="rounded-xl bg-rose-t px-4 py-3 text-rose"><div className="font-semibold">{v.errors.length} error{v.errors.length === 1 ? "" : "s"} to fix before activating</div><ul className="mt-1 list-disc pl-5 text-sm">{v.errors.map((p) => <li key={p}>{p}</li>)}</ul></div>}
          {v.warnings.length > 0 && <div className="mt-3 rounded-xl bg-sun-t px-4 py-3 text-[#7a4700]"><div className="font-semibold">Warnings</div><ul className="mt-1 list-disc pl-5 text-sm">{v.warnings.map((p) => <li key={p}>{p}</li>)}</ul></div>}
          <div className="mt-5 flex justify-end"><Button onClick={() => setDialog(null)}>Close</Button></div>
        </Modal>
      )}
      {dialog === "activate" && (
        <Modal title={status === "Paused" ? "Resume journey" : "Activate journey"} onClose={() => setDialog(null)}>
          {v.errors.length > 0 ? (
            <div className="rounded-xl bg-rose-t px-4 py-3 text-rose"><div className="font-semibold">Fix these first</div><ul className="mt-1 list-disc pl-5 text-sm">{v.errors.map((p) => <li key={p}>{p}</li>)}</ul></div>
          ) : (
            <dl className="divide-y divide-line rounded-xl border border-line text-sm">
              {[["Entry source", `${entryDef?.label}${entryDetail ? ` (${entryDetail})` : ""}`], ...(trigger.type === "audience" ? [["Contacts entering now", String(audienceCount)]] : []), ["Activities", `${allSteps(steps).length} (${emailSteps.length} email${emailSteps.length === 1 ? "" : "s"})`], ["Entry mode", reentryLabel], ["Goal", trigger.goal?.length ? `${trigger.goal.length} criteria` : "None"], ["Exit criteria", exit.length ? `${exit.length} criteria` : "None"], ["Version", String(version)]].map(([k, val]) => (
                <div key={k} className="flex gap-4 px-4 py-2.5"><dt className="w-40 shrink-0 text-muted">{k}</dt><dd className="font-semibold text-ink">{val}</dd></div>
              ))}
            </dl>
          )}
          {v.errors.length === 0 && v.warnings.length > 0 && <ul className="mt-3 list-disc rounded-xl bg-sun-t py-3 pl-9 pr-4 text-[13px] text-[#7a4700]">{v.warnings.map((p) => <li key={p}>{p}</li>)}</ul>}
          <div className="mt-5 flex justify-end gap-2"><Button variant="soft" onClick={() => setDialog(null)}>Cancel</Button>{v.errors.length === 0 && <Button icon="play" onClick={activate}>{status === "Paused" ? "Resume" : "Activate"}</Button>}</div>
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
