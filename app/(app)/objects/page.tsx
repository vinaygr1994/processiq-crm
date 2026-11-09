"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, ConfirmModal, Empty, Field, Modal, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { COLORS, FIELD_TYPES, ICONS, TEMPLATES, keyOf } from "@/lib/objects";
import type { CrmObject, FieldType, ObjField } from "@/lib/types";

type Draft = Omit<CrmObject, "id" | "created_at">;
const blank: Draft = { name: "", plural: "", icon: "layers", color: COLORS[0], fields: [], statuses: ["Open", "Done"], link_contact: true, link_deal: false };

export default function ObjectsPage() {
  const { data, can, remove, removeMany, toast } = useCrm();
  const [edit, setEdit] = useState<{ id?: string; d: Draft } | null>(null);
  const [pick, setPick] = useState(false);
  const [del, setDel] = useState<CrmObject | null>(null);
  const admin = can("objects");

  return (
    <div className="space-y-6">
      <PageHeader title="Custom objects" sub="Track anything your business needs, like class bookings, consultations or projects, and link it to your contacts and deals."
        action={admin ? <Button icon="plus" onClick={() => setPick(true)}>New object</Button> : undefined} />
      {!admin && <p className="rounded-2xl bg-sun-t px-4 py-3 text-sm text-ink">Only the owner or an admin can create or change objects. You can still add records from each object&apos;s page.</p>}
      {data.objects.length === 0 ? (
        <Card><Empty icon="layers" title="No custom objects yet" text="Start from a template for your industry, or build your own from scratch." action={admin ? <Button onClick={() => setPick(true)}>Create your first object</Button> : undefined} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.objects.map((o) => {
            const n = data.records.filter((r) => r.object_id === o.id).length;
            return (
              <Card key={o.id}>
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ background: o.color + "1f", color: o.color }}><Icon name={o.icon} className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/objects/${o.id}`} className="font-display text-lg font-semibold text-ink hover:text-teal-d">{o.plural}</Link>
                    <p className="text-[13.5px] text-muted">{n} record{n === 1 ? "" : "s"} · {o.fields.length} field{o.fields.length === 1 ? "" : "s"} · linked to {[o.link_contact && "contacts", o.link_deal && "deals"].filter(Boolean).join(" and ") || "nothing"}</p>
                    <div className="mt-2 flex flex-wrap gap-1">{o.statuses.map((s) => <Badge key={s}>{s}</Badge>)}</div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Link href={`/objects/${o.id}`}><Button size="sm" variant="soft">Open</Button></Link>
                  {admin && <Button size="sm" variant="ghost" onClick={() => setEdit({ id: o.id, d: { name: o.name, plural: o.plural, icon: o.icon, color: o.color, fields: o.fields, statuses: o.statuses, link_contact: o.link_contact, link_deal: o.link_deal } })}>Edit fields</Button>}
                  {admin && <Button size="sm" variant="ghost" onClick={() => setDel(o)}>Delete</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {pick && (
        <Modal title="New object" onClose={() => setPick(false)} wide>
          <p className="mb-4 text-muted">Pick a starting point. You can rename it and change every field afterwards.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {TEMPLATES.map(({ blurb, ...t }) => (
              <button key={t.name} onClick={() => { setPick(false); setEdit({ d: t }); }} className="flex items-start gap-3 rounded-2xl border border-line p-4 text-left hover:border-teal hover:bg-cloud">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: t.color + "1f", color: t.color }}><Icon name={t.icon} className="size-5" /></span>
                <span><span className="block font-semibold text-ink">{t.name}</span><span className="text-[13px] text-muted">{blurb}</span></span>
              </button>
            ))}
            <button onClick={() => { setPick(false); setEdit({ d: blank }); }} className="flex items-start gap-3 rounded-2xl border border-dashed border-[#cfd6e6] p-4 text-left hover:border-teal hover:bg-cloud">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cloud text-muted"><Icon name="plus" className="size-5" /></span>
              <span><span className="block font-semibold text-ink">Start from scratch</span><span className="text-[13px] text-muted">Name it and add your own fields</span></span>
            </button>
          </div>
        </Modal>
      )}
      {edit && <Builder id={edit.id} init={edit.d} onClose={() => setEdit(null)} />}
      {del && <ConfirmModal title={`Delete ${del.plural}?`} text={`All ${data.records.filter((r) => r.object_id === del.id).length} records in it are deleted too. This can't be undone.`}
        onClose={() => setDel(null)} onConfirm={async () => { await removeMany("records", data.records.filter((r) => r.object_id === del.id).map((r) => r.id)); await remove("objects", del.id); toast(`${del.plural} deleted`); setDel(null); }} />}
    </div>
  );
}

function Builder({ id, init, onClose }: { id?: string; init: Draft; onClose: () => void }) {
  const { add, update, toast } = useCrm();
  const [d, setD] = useState<Draft>(init);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const setField = (i: number, p: Partial<ObjField>) => setD({ ...d, fields: d.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const move = (i: number, by: number) => { const f = [...d.fields]; const [x] = f.splice(i, 1); f.splice(i + by, 0, x); setD({ ...d, fields: f }); };
  const addStatus = () => { const s = status.trim(); if (s && !d.statuses.includes(s)) setD({ ...d, statuses: [...d.statuses, s] }); setStatus(""); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = d.name.trim(); if (!name) { toast("Give the object a name", "error"); return; }
    if (d.statuses.length === 0) { toast("Add at least one status", "error"); return; }
    const seen = new Set<string>();
    const fields = d.fields.filter((f) => f.label.trim()).map((f) => { let k = f.key || keyOf(f.label); while (seen.has(k)) k += "_2"; seen.add(k); return { ...f, label: f.label.trim(), key: k, ...(f.type === "select" ? { options: (f.options ?? []).filter(Boolean) } : { options: undefined }) }; });
    const row = { ...d, name, plural: d.plural.trim() || name + "s", fields };
    setBusy(true);
    const ok = id ? await update("objects", id, row) : await add("objects", row);
    setBusy(false);
    if (ok !== null) { toast(id ? "Object saved" : `${row.plural} created. It's in the menu under CRM.`); onClose(); }
  }

  return (
    <Modal title={id ? `Edit ${init.plural}` : "Set up your object"} onClose={onClose} wide="xl">
      <form onSubmit={save} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name (one)"><input className="field" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Class booking" autoFocus /></Field>
          <Field label="Name (many)"><input className="field" value={d.plural} onChange={(e) => setD({ ...d, plural: e.target.value })} placeholder={(d.name || "Class booking") + "s"} /></Field>
        </div>
        <div className="flex flex-wrap gap-6">
          <div><span className="mb-1.5 block text-[13px] font-semibold text-muted">Icon</span><div className="flex flex-wrap gap-1.5">{ICONS.map((i) => <button type="button" key={i} onClick={() => setD({ ...d, icon: i })} aria-label={i} aria-pressed={d.icon === i} className={`grid size-9 place-items-center rounded-xl border ${d.icon === i ? "border-teal bg-teal-t text-teal-d" : "border-line text-muted hover:text-ink"}`}><Icon name={i} className="size-[18px]" /></button>)}</div></div>
          <div><span className="mb-1.5 block text-[13px] font-semibold text-muted">Colour</span><div className="flex gap-1.5">{COLORS.map((c) => <button type="button" key={c} onClick={() => setD({ ...d, color: c })} aria-label={`Colour ${c}`} aria-pressed={d.color === c} className={`size-9 rounded-xl ring-offset-2 ${d.color === c ? "ring-2 ring-ink" : ""}`} style={{ background: c }} />)}</div></div>
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={d.link_contact} onChange={(e) => setD({ ...d, link_contact: e.target.checked })} />Link to a contact (shows on their page)</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={d.link_deal} onChange={(e) => setD({ ...d, link_deal: e.target.checked })} />Link to a deal</label>
        </div>

        <section>
          <h3 className="mb-1 font-semibold">Statuses</h3>
          <p className="mb-2 text-[13px] text-muted">The stages each record moves through, in order.</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {d.statuses.map((s, i) => <span key={s} className="inline-flex items-center gap-1 rounded-full bg-cloud py-1 pl-3 pr-1.5 text-sm font-semibold text-ink">{i + 1}. {s}<button type="button" onClick={() => setD({ ...d, statuses: d.statuses.filter((x) => x !== s) })} className="grid size-5 place-items-center rounded-full hover:bg-white" aria-label={`Remove ${s}`}><Icon name="x" className="size-3.5" /></button></span>)}
            <input className="w-36 rounded-full border border-dashed border-[#cfd6e6] bg-transparent px-3 py-1 text-sm focus:border-teal focus:outline-none" value={status} onChange={(e) => setStatus(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addStatus())} onBlur={addStatus} placeholder="+ add status" aria-label="Add status" />
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Fields</h3><span className="text-[13px] text-muted">Title, status, contact and assigned person are always included.</span></div>
          <div className="space-y-2">
            {d.fields.map((f, i) => (
              <div key={i} className="grid items-start gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[1fr_170px_auto]">
                <div className="space-y-2">
                  <input className="field !h-10" value={f.label} onChange={(e) => setField(i, { label: e.target.value, ...(id && f.key ? {} : { key: "" }) })} placeholder="Field name" aria-label="Field name" />
                  {f.type === "select" && <input className="field !h-10" value={(f.options ?? []).join(", ")} onChange={(e) => setField(i, { options: e.target.value.split(",").map((x) => x.trimStart()) })} placeholder="Choices, separated by commas" aria-label="Dropdown choices" />}
                </div>
                <select className="field !h-10" value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldType })} aria-label="Field type">{FIELD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
                <div className="flex h-10 items-center gap-1">
                  <label className="mr-1 flex items-center gap-1.5 text-[13px]"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} />Required</label>
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-cloud disabled:opacity-30" aria-label="Move up"><Icon name="chevron" className="size-4 -rotate-90" /></button>
                  <button type="button" disabled={i === d.fields.length - 1} onClick={() => move(i, 1)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-cloud disabled:opacity-30" aria-label="Move down"><Icon name="chevron" className="size-4 rotate-90" /></button>
                  <button type="button" onClick={() => setD({ ...d, fields: d.fields.filter((_, j) => j !== i) })} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-rose-t hover:text-rose" aria-label="Remove field"><Icon name="trash" className="size-4" /></button>
                </div>
              </div>
            ))}
          </div>
          <Button type="button" variant="soft" size="sm" icon="plus" className="mt-2" onClick={() => setD({ ...d, fields: [...d.fields, { key: "", label: "", type: "text" }] })}>Add field</Button>
        </section>

        <div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{id ? "Save object" : "Create object"}</Button></div>
      </form>
    </Modal>
  );
}
