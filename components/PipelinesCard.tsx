"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Button, Card, Field } from "./ui";
import { useCrm } from "@/lib/store";
import { TEMPLATES, interestsOf, pipelinesOf, stageId, template, type PStage, type Pipeline, type StageKind } from "@/lib/pipelines";

/** Settings: industry, pipelines and their stages (names, order, win probability, outcome). */
export function PipelinesCard() {
  const { data, settings, saveSettings, toast } = useCrm();
  const [industry, setIndustry] = useState("general");
  const [ps, setPs] = useState<Pipeline[]>([]);
  const [interests, setInterests] = useState("");
  const [open, setOpen] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!settings || dirty) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copy saved settings into the form
    setIndustry(settings.industry ?? "general"); setPs(pipelinesOf(settings)); setInterests(interestsOf(settings).join(", "));
  }, [settings, dirty]);

  const p = ps[open];
  const edit = (fn: (p: Pipeline) => Pipeline) => { setPs(ps.map((x, i) => (i === open ? fn(x) : x))); setDirty(true); };
  const setStage = (i: number, patch: Partial<PStage>) => edit((x) => ({ ...x, stages: x.stages.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  const move = (i: number, d: -1 | 1) => edit((x) => { const st = [...x.stages]; [st[i], st[i + d]] = [st[i + d], st[i]]; return { ...x, stages: st }; });
  const inStage = (id: string) => data.deals.filter((d) => d.stage === id && (d.pipeline ?? "default") === p.id).length;

  function applyIndustry(id: string) {
    const t = template(id);
    setIndustry(id); setInterests(t.interests.join(", "));
    setPs([{ ...(ps[0] ?? { id: "default" }), id: ps[0]?.id ?? "default", name: t.name, stages: t.stages.map((s) => ({ ...s })) }, ...ps.slice(1)]);
    setOpen(0); setDirty(true);
  }
  async function save() {
    setErr("");
    for (const x of ps) {
      if (!x.name.trim()) return setErr("Every pipeline needs a name.");
      if (!x.stages.some((s) => s.kind === "open")) return setErr(`“${x.name}” needs at least one open stage.`);
      if (!x.stages.some((s) => s.kind === "won") || !x.stages.some((s) => s.kind === "lost")) return setErr(`“${x.name}” needs a won stage and a lost stage.`);
      if (x.stages.some((s) => !s.label.trim())) return setErr("Every stage needs a name.");
    }
    try {
      await saveSettings({ pipelines: ps.map((x) => ({ ...x, name: x.name.trim(), stages: x.stages.map((s) => ({ ...s, label: s.label.trim(), prob: Math.max(0, Math.min(100, Math.round(s.prob))) })) })), industry, interests: interests.split(",").map((s) => s.trim()).filter(Boolean) });
      setDirty(false); toast("Pipelines saved");
    } catch { setErr("Couldn't save. Run supabase/migrations/011_pipelines.sql in Supabase first."); }
  }

  if (!p) return null;
  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Industry and pipelines</h2>
      <p className="mb-4 text-muted">Pick your industry to get a ready-made pipeline, then rename, reorder or add stages. Each stage has a win probability for your forecast.</p>
      <Field label="Your industry">
        <select className="field" value={industry} onChange={(e) => applyIndustry(e.target.value)}>{TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.industry}</option>)}</select>
      </Field>
      <p className="mt-1.5 text-[12.5px] text-muted">Changing industry replaces your main pipeline&apos;s stages. Existing deals keep their place where the stage still exists.</p>

      <div className="mt-5 flex flex-wrap items-center gap-1.5">
        {ps.map((x, i) => <button key={x.id} type="button" onClick={() => setOpen(i)} aria-pressed={open === i} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${open === i ? "bg-ink text-white" : "border border-line bg-white hover:bg-cloud"}`}>{x.name || "Untitled"}</button>)}
        <button type="button" onClick={() => { const t = template("general"); setPs([...ps, { id: `p${Date.now().toString(36)}`, name: "New pipeline", stages: t.stages.map((s) => ({ ...s })) }]); setOpen(ps.length); setDirty(true); }} className="rounded-full px-3 py-1.5 text-sm font-semibold text-teal-d hover:bg-teal-t">+ Add pipeline</button>
      </div>

      <div className="mt-4 space-y-3 rounded-2xl border border-line p-4">
        <div className="flex items-end gap-2">
          <Field label="Pipeline name"><input className="field" value={p.name} onChange={(e) => edit((x) => ({ ...x, name: e.target.value }))} /></Field>
          {ps.length > 1 && open > 0 && <Button variant="soft" size="sm" onClick={() => { setPs(ps.filter((_, i) => i !== open)); setOpen(0); setDirty(true); }} disabled={data.deals.some((d) => d.pipeline === p.id)}>Delete</Button>}
        </div>
        <div className="hidden grid-cols-[1fr_90px_110px_100px] gap-2 px-1 text-[12.5px] font-semibold text-muted sm:grid"><span>Stage</span><span>Win %</span><span>Outcome</span><span /></div>
        <ul className="space-y-2">
          {p.stages.map((s, i) => (
            <li key={s.id} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_90px_110px_100px]">
              <input className="field !py-2" aria-label="Stage name" value={s.label} onChange={(e) => setStage(i, { label: e.target.value })} />
              <input type="number" min={0} max={100} className="field !py-2" aria-label={`${s.label} win probability`} value={s.prob} onChange={(e) => setStage(i, { prob: Number(e.target.value) })} />
              <select className="field !py-2" aria-label={`${s.label} outcome`} value={s.kind} onChange={(e) => setStage(i, { kind: e.target.value as StageKind, prob: e.target.value === "won" ? 100 : e.target.value === "lost" ? 0 : s.prob })}><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></select>
              <div className="flex items-center justify-end gap-0.5">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="grid size-8 place-items-center rounded-full text-muted hover:bg-cloud disabled:opacity-30">↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === p.stages.length - 1} aria-label="Move down" className="grid size-8 place-items-center rounded-full text-muted hover:bg-cloud disabled:opacity-30">↓</button>
                <button type="button" onClick={() => edit((x) => ({ ...x, stages: x.stages.filter((_, k) => k !== i) }))} disabled={inStage(s.id) > 0} title={inStage(s.id) ? `${inStage(s.id)} deals are in this stage` : "Remove stage"} aria-label="Remove stage" className="grid size-8 place-items-center rounded-full text-muted hover:bg-rose-t hover:text-rose disabled:opacity-30"><Icon name="x" className="size-4" /></button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => edit((x) => { const lastOpen = x.stages.map((s) => s.kind).lastIndexOf("open") + 1; const st = [...x.stages]; st.splice(lastOpen, 0, { id: stageId("New stage", x.stages.map((s) => s.id)), label: "New stage", prob: 50, kind: "open" }); return { ...x, stages: st }; })} className="text-sm font-semibold text-teal-d hover:underline">+ Add a stage</button>
      </div>

      <div className="mt-4"><Field label="What customers can be interested in" hint="Comma-separated. Shown when you create a deal."><input className="field" value={interests} onChange={(e) => { setInterests(e.target.value); setDirty(true); }} /></Field></div>
      {err && <p role="alert" className="mt-3 text-sm font-medium text-rose">{err}</p>}
      <div className="mt-4 flex justify-end"><Button disabled={!dirty} onClick={save}>Save pipelines</Button></div>
    </Card>
  );
}
