"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, ConfirmModal, Empty, Modal, PageHeader } from "@/components/ui";
import { triggerText } from "@/components/WorkflowEditor";
import { useCrm } from "@/lib/store";
import { useStages } from "@/lib/useStages";
import { isJourney, journeyStarters, journeyStats, type Starter } from "@/lib/journeys";
import type { Workflow } from "@/lib/types";

export default function JourneysPage() {
  const { data, add, remove, removeMany, toast } = useCrm();
  const router = useRouter();
  const { name: stageName } = useStages();
  const [picker, setPicker] = useState(false);
  const [del, setDel] = useState<Workflow | null>(null);
  const list = data.workflows.filter(isJourney).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const runs = (id: string) => data.workflow_runs.filter((r) => r.workflow_id === id);

  async function create(s: Starter) {
    const row = await add("workflows", { name: s.name, description: s.description, trigger: s.trigger, steps: s.steps, exit: s.exit, active: false, activated_at: new Date().toISOString(), template_id: `journey:${s.id}` });
    if (row) router.push(`/journeys/${row.id}`);
  }
  async function destroy(w: Workflow) {
    const ids = runs(w.id).map((r) => r.id);
    if (ids.length) await removeMany("workflow_runs", ids);
    await remove("workflows", w.id); setDel(null); toast("Journey deleted");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Journeys" sub="Map out multi-step customer journeys on a canvas: emails, texts, waits, splits and goals."
        action={<Button icon="plus" onClick={() => setPicker(true)}>New journey</Button>} />

      {list.length === 0 ? (
        <Card><Empty icon="route" title="Build your first journey" text="Start from a ready-made journey such as a welcome series or an A/B test, or start from a blank canvas." action={<Button icon="plus" onClick={() => setPicker(true)}>New journey</Button>} /></Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1fr)_110px_90px_90px_90px_90px_40px] gap-3 border-b border-line px-5 py-3 text-[13px] font-semibold text-muted lg:grid">
            <span>Journey</span><span>Status</span><span className="text-right">Entered</span><span className="text-right">In journey</span><span className="text-right">Completed</span><span className="text-right">Goal met</span><span />
          </div>
          <ul className="divide-y divide-line">
            {list.map((w) => {
              const s = journeyStats(runs(w.id));
              return (
                <li key={w.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_110px_90px_90px_90px_90px_40px]">
                  <div className="min-w-0">
                    <Link href={`/journeys/${w.id}`} className="font-semibold text-ink hover:text-teal-d hover:underline">{w.name}</Link>
                    <div className="truncate text-sm text-muted">{triggerText(w.trigger, stageName)}</div>
                  </div>
                  <div><Badge tone={w.active ? "teal" : "gray"}>{w.active ? "Running" : "Draft"}</Badge></div>
                  <div className="hidden text-right font-semibold text-ink lg:block">{s.entered}</div>
                  <div className="hidden text-right lg:block">{s.active}</div>
                  <div className="hidden text-right lg:block">{s.done}</div>
                  <div className="hidden text-right lg:block">{s.goal}</div>
                  <button onClick={() => setDel(w)} className="hidden justify-self-end text-[#b3bdd2] hover:text-rose lg:block" aria-label={`Delete ${w.name}`}><Icon name="trash" className="size-[18px]" /></button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {picker && (
        <Modal title="Start a journey" onClose={() => setPicker(false)} wide="xl">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {journeyStarters().map((s) => (
              <button key={s.id} type="button" onClick={() => create(s)} className="rounded-2xl border border-line bg-white p-4 text-left transition hover:border-teal hover:shadow-md">
                <div className="font-semibold text-ink">{s.name}</div>
                <p className="mt-1 text-sm text-muted">{s.description}</p>
                <div className="mt-3 text-[12.5px] font-semibold text-teal-d">{triggerText(s.trigger, stageName)}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {del && <ConfirmModal title={`Delete “${del.name}”?`} text="Everyone currently in this journey leaves it. This can't be undone." onClose={() => setDel(null)} onConfirm={() => destroy(del)} />}
    </div>
  );
}
