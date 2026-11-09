"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Field } from "@/components/ui";
import { CondEditor, StepList, TRIGGERS, triggerText } from "@/components/WorkflowEditor";
import { Icon } from "@/components/Icon";
import { useCrm } from "@/lib/store";
import { SOURCES } from "@/lib/stages";
import { useStages } from "@/lib/useStages";
import type { Cond, Step, Trigger, TriggerType } from "@/lib/engine/types";
import type { Workflow } from "@/lib/types";
import { isJourney } from "@/lib/journeys";

export default function WorkflowPage() {
  const { id } = useParams<{ id: string }>();
  const { data, ready, update, toast } = useCrm();
  const { stages: STAGES, name: stageName } = useStages();
  const saved = data.workflows.find((w) => w.id === id);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [trigger, setTrigger] = useState<Trigger>({ type: "lead_created" });
  const [exit, setExit] = useState<Cond[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (saved && !loaded) { setName(saved.name); setDesc(saved.description); setTrigger(saved.trigger); setExit(saved.exit); setSteps(saved.steps); setLoaded(true); }
  }, [saved, loaded]);

  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };
  if (!ready) return null;
  if (saved && isJourney(saved)) return <Card><p>This is a journey. <Link href={`/journeys/${saved.id}`} className="font-semibold text-teal-d hover:underline">Open it in the Journey Builder</Link></p></Card>;
  if (!saved) return <Card><p>That workflow doesn't exist. <Link href="/automations" className="font-semibold text-teal-d hover:underline">Back to workflows</Link></p></Card>;

  const runs = data.workflow_runs.filter((r) => r.workflow_id === saved.id);
  const save = async () => {
    const patch: Partial<Workflow> = { name: name.trim() || "Untitled workflow", description: desc, trigger, exit, steps };
    await update("workflows", saved.id, patch);
    setDirty(false); toast("Workflow saved");
  };
  const toggle = () => update("workflows", saved.id, saved.active ? { active: false } : { active: true, activated_at: new Date().toISOString() });

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24">
      <Link href="/automations" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><Icon name="back" className="size-4" />All workflows</Link>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1"><Field label="Workflow name"><input className="field" value={name} onChange={(e) => touch(setName)(e.target.value)} /></Field></div>
          <button role="switch" aria-checked={saved.active} onClick={toggle} className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <span className={`relative h-6 w-11 rounded-full transition ${saved.active ? "bg-teal" : "bg-[#cfd6e6]"}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${saved.active ? "left-[22px]" : "left-0.5"}`} /></span>{saved.active ? "On" : "Off"}
          </button>
        </div>
        <div className="mt-3"><Field label="Description (optional)"><input className="field" value={desc} onChange={(e) => touch(setDesc)(e.target.value)} placeholder="What does this workflow do?" /></Field></div>
        {runs.length > 0 && <p className="mt-3 text-sm text-muted">{runs.length} run{runs.length === 1 ? "" : "s"} so far, {runs.filter((r) => r.status === "active").length} still waiting. Changes apply to new and waiting runs from their next step.</p>}
      </Card>

      <Card className="!border-teal/40 !bg-teal-t/30">
        <div className="mb-3 flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-white text-teal-d"><Icon name="bolt" className="size-4" /></span><h2 className="text-lg font-semibold">Starts when</h2><Badge tone="teal">{triggerText(trigger, stageName)}</Badge></div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="field !w-auto" value={trigger.type} aria-label="Trigger" onChange={(e) => touch(setTrigger)({ type: e.target.value as TriggerType, ...(e.target.value === "stage_changed" ? { stage: "contacted" } : {}) })}>{TRIGGERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
          {trigger.type === "stage_changed" && <select className="field !w-auto" value={trigger.stage ?? ""} aria-label="Stage" onChange={(e) => touch(setTrigger)({ ...trigger, stage: e.target.value })}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>}
          {trigger.type === "lead_created" && <select className="field !w-auto" value={trigger.source ?? ""} aria-label="Lead source" onChange={(e) => touch(setTrigger)({ ...trigger, source: e.target.value || undefined })}><option value="">from any source</option>{SOURCES.map((s) => <option key={s} value={s}>from {s}</option>)}</select>}
        </div>
        <div className="mt-4 border-t border-teal/20 pt-4">
          <h3 className="text-sm font-semibold text-ink">Stop early when… <span className="font-normal text-muted">(optional)</span></h3>
          <p className="mb-2 text-[13px] text-muted">If any of these become true, people leave the workflow. Example: the deal is no longer “New lead”.</p>
          <div className="space-y-2">
            {exit.map((c, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2"><CondEditor cond={c} onChange={(n) => touch(setExit)(exit.map((x, j) => (j === i ? n : x)))} />
                <button onClick={() => touch(setExit)(exit.filter((_, j) => j !== i))} aria-label="Remove condition" className="grid size-8 place-items-center rounded-lg text-[#b3bdd2] hover:bg-rose-t hover:text-rose"><Icon name="x" className="size-4" /></button></div>
            ))}
          </div>
          <button onClick={() => touch(setExit)([...exit, { field: "deal.stage", op: "is_not", value: "new" }])} className="mt-2 text-sm font-semibold text-teal-d hover:underline">+ Add a stop condition</button>
        </div>
      </Card>

      <div><StepList steps={steps} onChange={touch(setSteps)} />
        <div className="mt-4 text-center text-sm text-muted">{steps.length === 0 ? "Add your first step." : "End of workflow"}</div></div>

      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-64">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3"><span className="text-sm text-muted">{dirty ? "You have unsaved changes." : "All changes saved."}</span><Button icon="check" onClick={save} disabled={!dirty}>Save workflow</Button></div>
      </div>
    </div>
  );
}
