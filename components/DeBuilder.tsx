"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { Button, Field, Modal } from "./ui";
import { useCrm } from "@/lib/store";
import { DE_TEMPLATES, DE_TYPES, keyOf } from "@/lib/de";
import type { DataExtension, DeField, DeFieldType } from "@/lib/types";

type Draft = Omit<DataExtension, "id" | "created_at">;
const blank: Draft = { name: "", external_key: "", description: "", folder: "", sendable: false, link: null, fields: [{ name: "Email", type: "email", primary: true, required: true }] };

/** Create or edit a data extension: properties, send relationship and fields. */
export function DeBuilder({ de, onClose, onSaved }: { de?: DataExtension; onClose: () => void; onSaved?: (d: DataExtension) => void }) {
  const { data, add, update, toast } = useCrm();
  const [d, setD] = useState<Draft | null>(de ? { name: de.name, external_key: de.external_key, description: de.description, folder: de.folder, sendable: de.sendable, link: de.link, fields: de.fields } : null);
  const [busy, setBusy] = useState(false);
  const hasRows = !!de && data.de_rows.some((r) => r.de_id === de.id);
  const locked = new Set(hasRows ? de!.fields.map((f) => f.name) : []);

  if (!d) return (
    <Modal title="Create data extension" onClose={onClose} wide>
      <p className="mb-4 text-muted">A data extension is a table of your own marketing data. Start from a template or define the fields yourself.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {DE_TEMPLATES.map(({ blurb, ...t }) => (
          <button key={t.name} onClick={() => setD({ ...t, external_key: keyOf(t.name), folder: "" })} className="rounded-lg border border-line p-4 text-left hover:border-teal hover:bg-cloud">
            <span className="block font-semibold text-ink">{t.name}</span><span className="block text-[13px] text-muted">{blurb}</span><span className="mt-2 block text-[12.5px] text-muted">{t.fields.map((f) => f.name).join(", ")}</span>
          </button>
        ))}
        <button onClick={() => setD(blank)} className="rounded-lg border border-dashed border-[#cfd6e6] p-4 text-left hover:border-teal hover:bg-cloud"><span className="block font-semibold text-ink">Standard data extension</span><span className="block text-[13px] text-muted">Start blank and add your own fields</span></button>
      </div>
    </Modal>
  );

  const setF = (i: number, p: Partial<DeField>) => setD({ ...d, fields: d.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const linkable = d.fields.filter((f) => f.name.trim() && (f.type === "email" || f.type === "phone" || f.type === "text"));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = d!.name.trim(); if (!name) return toast("Give the data extension a name", "error");
    const fields = d!.fields.map((f) => ({ ...f, name: f.name.trim() })).filter((f) => f.name);
    if (!fields.length) return toast("Add at least one field", "error");
    const names = fields.map((f) => f.name.toLowerCase());
    if (new Set(names).size !== names.length) return toast("Two fields have the same name", "error");
    if (data.data_extensions.some((x) => x.id !== de?.id && x.name.toLowerCase() === name.toLowerCase())) return toast("Another data extension already has that name", "error");
    const link = d!.link && fields.some((f) => f.name === d!.link!.field) ? d!.link : null;
    if (d!.sendable && !link) return toast("A sendable data extension needs a send relationship", "error");
    const row = { ...d!, name, external_key: d!.external_key.trim() || keyOf(name), fields: fields.map((f) => (f.primary ? { ...f, required: true } : f)), link };
    setBusy(true);
    const saved = de ? (await update("data_extensions", de.id, row), { ...de, ...row }) : await add("data_extensions", row);
    setBusy(false);
    if (saved) { toast(de ? "Data extension saved" : "Data extension created"); onSaved?.(saved); onClose(); }
  }

  return (
    <Modal title={de ? `Edit ${de.name}` : "Create data extension"} onClose={onClose} wide="xl">
      <form onSubmit={save} className="space-y-6">
        <section>
          <h3 className="mb-3 text-[14.5px] font-semibold">Properties</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><input className="field" autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value, ...(de ? {} : { external_key: keyOf(e.target.value) }) })} placeholder="Appointments" /></Field>
            <Field label="External key" hint="A fixed ID for imports and integrations"><input className="field" value={d.external_key} onChange={(e) => setD({ ...d, external_key: e.target.value })} /></Field>
            <Field label="Description"><input className="field" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
            <Field label="Folder"><input className="field" list="de-folders" value={d.folder} onChange={(e) => setD({ ...d, folder: e.target.value })} placeholder="Optional" /><datalist id="de-folders">{[...new Set(data.data_extensions.map((x) => x.folder).filter(Boolean))].map((x) => <option key={x} value={x} />)}</datalist></Field>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-[14.5px] font-semibold">Fields</h3>{hasRows && <span className="text-[12.5px] text-muted">Fields that already hold data can&apos;t be renamed or retyped.</span>}</div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-line bg-[#f8f9fc] text-left text-muted"><tr><th className="px-3 py-2 font-semibold">Name</th><th className="px-3 py-2 font-semibold">Data type</th><th className="px-3 py-2 font-semibold">Length</th><th className="px-3 py-2 text-center font-semibold">Primary key</th><th className="px-3 py-2 text-center font-semibold">Required</th><th className="px-3 py-2 font-semibold">Default value</th><th className="w-10" /></tr></thead>
              <tbody className="divide-y divide-line">
                {d.fields.map((f, i) => { const lock = locked.has(f.name); return (
                  <tr key={i}>
                    <td className="px-3 py-1.5"><input className="field !h-8" value={f.name} disabled={lock} onChange={(e) => setF(i, { name: e.target.value.replace(/[^\w ]/g, "") })} placeholder="FieldName" aria-label="Field name" /></td>
                    <td className="px-3 py-1.5"><select className="field !h-8 !py-0" value={f.type} disabled={lock} onChange={(e) => setF(i, { type: e.target.value as DeFieldType, length: e.target.value === "text" ? f.length ?? 100 : undefined })} aria-label="Data type">{DE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></td>
                    <td className="px-3 py-1.5">{f.type === "text" ? <input className="field !h-8 !w-24" type="number" min={1} max={4000} value={f.length ?? ""} onChange={(e) => setF(i, { length: Number(e.target.value) || undefined })} aria-label="Length" /> : <span className="text-muted">–</span>}</td>
                    <td className="px-3 py-1.5 text-center"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={!!f.primary} disabled={hasRows} onChange={(e) => setF(i, { primary: e.target.checked })} aria-label="Primary key" /></td>
                    <td className="px-3 py-1.5 text-center"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={!!f.required || !!f.primary} disabled={!!f.primary} onChange={(e) => setF(i, { required: e.target.checked })} aria-label="Required" /></td>
                    <td className="px-3 py-1.5"><input className="field !h-8" value={f.default ?? ""} onChange={(e) => setF(i, { default: e.target.value || undefined })} aria-label="Default value" /></td>
                    <td className="px-2 py-1.5"><button type="button" onClick={() => setD({ ...d, fields: d.fields.filter((_, j) => j !== i) })} className="grid size-8 place-items-center rounded-md text-muted hover:bg-rose-t hover:text-rose" aria-label={`Remove ${f.name || "field"}`}><Icon name="trash" className="size-4" /></button></td>
                  </tr>); })}
              </tbody>
            </table>
          </div>
          <Button type="button" size="sm" variant="soft" icon="plus" className="mt-2" onClick={() => setD({ ...d, fields: [...d.fields, { name: "", type: "text", length: 100 }] })}>Add field</Button>
        </section>

        <section className="rounded-lg border border-line bg-[#f8f9fc] p-4">
          <h3 className="mb-1 text-[14.5px] font-semibold">Contact relationship</h3>
          <p className="mb-3 text-[13px] text-muted">Link each record to a contact so it shows on their profile in Contact Builder, and so you can send to this data extension.</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select className="field !w-auto" aria-label="Field" value={d.link?.field ?? ""} onChange={(e) => setD({ ...d, link: e.target.value ? { field: e.target.value, to: d.link?.to ?? (d.fields.find((f) => f.name === e.target.value)?.type === "phone" ? "phone" : "email") } : null, sendable: e.target.value ? d.sendable : false })}><option value="">Not linked</option>{linkable.map((f) => <option key={f.name}>{f.name}</option>)}</select>
            {d.link && <><span className="text-muted">relates to contacts on</span><select className="field !w-auto" aria-label="Contact attribute" value={d.link.to} onChange={(e) => setD({ ...d, link: { ...d.link!, to: e.target.value as "email" | "phone" | "id" } })}><option value="email">Email address</option><option value="phone">Phone number</option><option value="id">Contact key</option></select></>}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[#0b8a8a]" disabled={!d.link} checked={d.sendable} onChange={(e) => setD({ ...d, sendable: e.target.checked })} /><span><strong className="text-ink">Is sendable.</strong> Records can be synced to contacts and used as a send audience.</span></label>
        </section>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{de ? "Save" : "Create"}</Button></div>
      </form>
    </Modal>
  );
}
