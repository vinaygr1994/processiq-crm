"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Modal } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { copyName, copyOfJourney } from "@/lib/journeys";
import type { Workflow } from "@/lib/types";

type Source = Pick<Workflow, "name" | "description" | "trigger" | "steps" | "exit" | "template_id">;

/** Copy a journey: same entry source, settings, goal, exit criteria and canvas, saved as a new draft. */
export function CopyJourneyModal({ source, onClose }: { source: Source; onClose: () => void }) {
  const { data, add, toast } = useCrm();
  const router = useRouter();
  const [name, setName] = useState(() => copyName(source.name, data.workflows.map((w) => w.name)));
  const [busy, setBusy] = useState(false);
  const steps = JSON.stringify(source.steps).match(/"type":"/g)?.length ?? 0;

  async function copy(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const row = await add("workflows", copyOfJourney(source, name));
      if (row) { toast(`Copied as “${row.name}”`); onClose(); router.push(`/journeys/${row.id}`); }
    } finally { setBusy(false); }
  }

  return (
    <Modal title="Copy journey" onClose={onClose}>
      <form onSubmit={copy} className="space-y-4">
        <Field label="Name of the copy"><input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} /></Field>
        <p className="rounded-xl bg-cloud px-4 py-3 text-[13px] text-muted">
          The copy gets the same entry source, journey settings, goal, exit criteria and all {steps} {steps === 1 ? "activity" : "activities"}, including email content. It starts as a draft with no one in it, so nothing is sent until you activate it.
        </p>
        <div className="flex justify-end gap-2"><Button type="button" variant="soft" onClick={onClose}>Cancel</Button><Button type="submit" icon="layers" disabled={busy || !name.trim()}>{busy ? "Copying…" : "Copy journey"}</Button></div>
      </form>
    </Modal>
  );
}
