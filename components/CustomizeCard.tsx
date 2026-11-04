"use client";
import { useEffect, useState } from "react";
import { Button, Card } from "./ui";
import { Icon } from "./Icon";
import { useCrm } from "@/lib/store";
import { STAGES } from "@/lib/stages";
import { customTag } from "@/lib/engine/merge";
import { uid } from "@/lib/engine/types";
import type { CustomField } from "@/lib/types";

const TYPES: { id: CustomField["type"]; label: string }[] = [{ id: "text", label: "Text" }, { id: "number", label: "Number" }, { id: "date", label: "Date" }, { id: "select", label: "Dropdown" }];

export function CustomizeCard() {
  const { settings, saveSettings, toast } = useCrm();
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<CustomField[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (settings) { setLabels(settings.stage_labels ?? {}); setFields(settings.custom_fields ?? []); setDirty(false); } }, [settings]);
  const patchField = (id: string, p: Partial<CustomField>) => { setFields(fields.map((f) => (f.id === id ? { ...f, ...p } : f))); setDirty(true); };
  const save = async () => {
    const clean = Object.fromEntries(Object.entries(labels).filter(([k, v]) => v.trim() && v.trim() !== STAGES.find((s) => s.id === k)?.label).map(([k, v]) => [k, v.trim()]));
    await saveSettings({ stage_labels: clean, custom_fields: fields.filter((f) => f.label.trim()).map((f) => ({ ...f, label: f.label.trim() })) });
    setDirty(false); toast("Customization saved");
  };
  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Customize</h2>
      <p className="mb-4 text-muted">Make the CRM speak your language. Rename your pipeline stages and add the fields your business tracks.</p>

      <div className="text-sm font-semibold text-ink">Pipeline stage names</div>
      <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
        {STAGES.map((s) => (
          <label key={s.id} className="flex items-center gap-2.5"><span className={`size-2.5 shrink-0 rounded-full ${s.dot}`} />
            <input className="field !py-2" aria-label={`Name for ${s.label}`} placeholder={s.label} value={labels[s.id] ?? ""} onChange={(e) => { setLabels({ ...labels, [s.id]: e.target.value }); setDirty(true); }} /></label>
        ))}
      </div>
      <p className="mt-1.5 text-[13px] text-muted">Leave blank to keep the default. Your workflows keep working when you rename a stage.</p>

      <div className="mt-6 text-sm font-semibold text-ink">Custom fields</div>
      <div className="mt-2 space-y-2.5">
        {fields.length === 0 && <p className="text-sm text-muted">None yet. Example: “Roof age” on jobs or “Preferred contact time” on contacts.</p>}
        {fields.map((f) => (
          <div key={f.id} className="rounded-2xl border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input className="field !w-48 !py-2" aria-label="Field name" placeholder="Field name" value={f.label} onChange={(e) => patchField(f.id, { label: e.target.value })} />
              <select className="field !w-auto !py-2" aria-label="Applies to" value={f.on} onChange={(e) => patchField(f.id, { on: e.target.value as CustomField["on"] })}><option value="deal">On jobs</option><option value="contact">On contacts</option></select>
              <select className="field !w-auto !py-2" aria-label="Field type" value={f.type} onChange={(e) => patchField(f.id, { type: e.target.value as CustomField["type"] })}>{TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
              <button onClick={() => { setFields(fields.filter((x) => x.id !== f.id)); setDirty(true); }} aria-label={`Delete ${f.label || "field"}`} className="ml-auto grid size-8 place-items-center rounded-lg text-[#b3bdd2] hover:bg-rose-t hover:text-rose"><Icon name="trash" className="size-4" /></button>
            </div>
            {f.type === "select" && <input className="field mt-2 !py-2" aria-label="Dropdown options" placeholder="Options, separated by commas" value={(f.options ?? []).join(", ")} onChange={(e) => patchField(f.id, { options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />}
            {f.label.trim() && <div className="mt-1.5 text-[12px] text-muted">Use in workflow messages as <code className="rounded bg-cloud px-1">{`{{${customTag(f.label)}}}`}</code></div>}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => { setFields([...fields, { id: uid(), label: "", on: "deal", type: "text" }]); setDirty(true); }} className="text-sm font-semibold text-teal-d hover:underline">+ Add a field</button>
        <Button size="sm" disabled={!dirty} onClick={save}>Save changes</Button>
      </div>
    </Card>
  );
}
