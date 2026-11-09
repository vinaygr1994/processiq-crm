"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, ConfirmModal, Field, Modal } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { showValue, statusTone } from "@/lib/objects";
import type { CrmObject, CrmRecord, ObjField } from "@/lib/types";

function Input({ fl, value, onChange, disabled }: { fl: ObjField; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const p = { className: "field", value, disabled, onChange: (e: { target: { value: string } }) => onChange(e.target.value), "aria-label": fl.label };
  switch (fl.type) {
    case "textarea": return <textarea {...p} className="field !min-h-[80px]" />;
    case "select": return <select {...p}><option value="">Choose…</option>{(fl.options ?? []).map((o) => <option key={o}>{o}</option>)}</select>;
    case "checkbox": return <label className="flex h-11 items-center gap-2.5 text-sm"><input type="checkbox" disabled={disabled} className="size-4 accent-[#0b8a8a]" checked={value === "Yes"} onChange={(e) => onChange(e.target.checked ? "Yes" : "No")} />Yes</label>;
    case "number": case "currency": return <input {...p} type="number" inputMode="decimal" step="any" />;
    case "date": return <input {...p} type="date" />;
    case "datetime": return <input {...p} type="datetime-local" />;
    case "email": return <input {...p} type="email" />;
    case "phone": return <input {...p} type="tel" />;
    case "url": return <input {...p} type="url" placeholder="https://" />;
    default: return <input {...p} />;
  }
}

/** Create or edit one record of a custom object, linked to a contact and optionally a deal. */
export function RecordModal({ obj, record, defaults, onClose }: { obj: CrmObject; record?: CrmRecord; defaults?: Partial<CrmRecord>; onClose: () => void }) {
  const { data, add, update, remove, toast, can, team, me } = useCrm();
  const ro = !can("write");
  const [r, setR] = useState(() => ({
    title: record?.title ?? defaults?.title ?? "",
    status: record?.status ?? defaults?.status ?? obj.statuses[0] ?? "",
    assigned_to: record?.assigned_to ?? defaults?.assigned_to ?? (me.role === "rep" ? me.name : ""),
    contact_id: record?.contact_id ?? defaults?.contact_id ?? null,
    deal_id: record?.deal_id ?? defaults?.deal_id ?? null,
    data: { ...(record?.data ?? {}) } as Record<string, string>,
  }));
  const [q, setQ] = useState("");
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const contact = data.contacts.find((c) => c.id === r.contact_id);
  const deals = data.deals.filter((d) => !r.contact_id || d.contact_id === r.contact_id);
  const matches = q.trim() ? data.contacts.filter((c) => [c.name, c.email, c.phone].some((v) => v.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 6) : [];
  const missing = obj.fields.filter((f) => f.required && !r.data[f.key]?.trim()).map((f) => f.label);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (ro) return;
    if (missing.length) { toast(`Fill in ${missing.join(", ")}`, "error"); return; }
    setBusy(true);
    const title = r.title.trim() || `${obj.name}${contact ? ` with ${contact.name}` : ""}`;
    const row = { ...r, title, object_id: obj.id };
    const ok = record ? await update("records", record.id, row) : await add("records", row);
    setBusy(false);
    if (ok !== null) { toast(record ? "Saved" : `${obj.name} added`); onClose(); }
  }

  return (
    <Modal title={record ? record.title : `New ${obj.name.toLowerCase()}`} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        {ro && <p className="rounded-xl bg-sun-t px-3 py-2 text-sm text-ink">You have read-only access, so changes can&apos;t be saved.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title"><input className="field" value={r.title} disabled={ro} onChange={(e) => setR({ ...r, title: e.target.value })} placeholder={`${obj.name}${contact ? ` with ${contact.name}` : ""}`} /></Field>
          <Field label="Status"><select className="field" value={r.status} disabled={ro} onChange={(e) => setR({ ...r, status: e.target.value })}>{obj.statuses.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {obj.link_contact && (
            <Field label="Contact">
              {contact ? (
                <div className="flex h-11 items-center justify-between rounded-xl border border-line px-3"><Link href={`/contacts/${contact.id}`} className="truncate font-semibold text-ink hover:text-teal-d">{contact.name}</Link>{!ro && <button type="button" onClick={() => setR({ ...r, contact_id: null, deal_id: null })} className="text-muted hover:text-rose" aria-label="Remove contact"><Icon name="x" className="size-4" /></button>}</div>
              ) : (
                <div className="relative"><input className="field" value={q} disabled={ro} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or phone" aria-label="Find contact" />
                  {matches.length > 0 && <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-line bg-white shadow-lg">{matches.map((c) => <li key={c.id}><button type="button" onClick={() => { setR({ ...r, contact_id: c.id }); setQ(""); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-cloud"><span className="font-semibold text-ink">{c.name}</span> <span className="text-muted">{c.email || c.phone}</span></button></li>)}</ul>}
                </div>
              )}
            </Field>
          )}
          <Field label="Assigned to"><select className="field" value={r.assigned_to} disabled={ro || (!can("assign") && me.role === "rep")} onChange={(e) => setR({ ...r, assigned_to: e.target.value })}><option value="">Nobody</option>{[...new Set([...team, r.assigned_to].filter(Boolean))].map((n) => <option key={n}>{n}</option>)}</select></Field>
          {obj.link_deal && (
            <Field label="Deal"><select className="field" value={r.deal_id ?? ""} disabled={ro} onChange={(e) => setR({ ...r, deal_id: e.target.value || null })}><option value="">None</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>
          )}
        </div>
        {obj.fields.length > 0 && (
          <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            {obj.fields.map((fl) => (
              <div key={fl.key} className={fl.type === "textarea" ? "sm:col-span-2" : ""}>
                <Field label={fl.label + (fl.required ? " *" : "")}><Input fl={fl} disabled={ro} value={r.data[fl.key] ?? ""} onChange={(v) => setR({ ...r, data: { ...r.data, [fl.key]: v } })} /></Field>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          {record && can("delete") ? <Button type="button" variant="danger" size="sm" icon="trash" onClick={() => setDel(true)}>Delete</Button> : <span />}
          <div className="flex gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>{!ro && <Button type="submit" disabled={busy}>{record ? "Save" : `Add ${obj.name.toLowerCase()}`}</Button>}</div>
        </div>
      </form>
      {del && record && <ConfirmModal title={`Delete this ${obj.name.toLowerCase()}?`} text="This can't be undone." onClose={() => setDel(false)} onConfirm={async () => { await remove("records", record.id); toast("Deleted"); onClose(); }} />}
    </Modal>
  );
}

/** "Consultations (2)" style related lists for a contact or deal page. */
export function RelatedRecords({ contactId, dealId }: { contactId?: string; dealId?: string }) {
  const { data, can } = useCrm();
  const [open, setOpen] = useState<{ obj: CrmObject; rec?: CrmRecord } | null>(null);
  const objs = data.objects.filter((o) => (dealId ? o.link_deal : o.link_contact));
  if (objs.length === 0) return null;
  return (
    <>
      {objs.map((o) => {
        const recs = data.records.filter((r) => r.object_id === o.id && (dealId ? r.deal_id === dealId : r.contact_id === contactId)).sort((a, b) => b.created_at.localeCompare(a.created_at));
        const first = o.fields.find((f) => f.type === "datetime" || f.type === "date");
        return (
          <section key={o.id} className="rounded-3xl border border-line bg-white p-5" aria-label={o.plural}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><span className="grid size-7 place-items-center rounded-lg" style={{ background: o.color + "1f", color: o.color }}><Icon name={o.icon} className="size-4" /></span>{o.plural} <span className="text-sm font-normal text-muted">{recs.length}</span></h2>
              {can("write") && <button onClick={() => setOpen({ obj: o })} className="text-sm font-semibold text-teal-d hover:underline">+ Add</button>}
            </div>
            {recs.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
              <ul className="space-y-2">{recs.map((r) => (
                <li key={r.id}><button onClick={() => setOpen({ obj: o, rec: r })} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line px-4 py-2.5 text-left hover:bg-cloud">
                  <span className="min-w-0"><span className="block truncate font-semibold text-ink">{r.title}</span><span className="text-[13px] text-muted">{[first && showValue(first, r.data[first.key]), r.assigned_to].filter(Boolean).join(" · ") || "No details"}</span></span>
                  <Badge tone={statusTone(o, r.status)}>{r.status}</Badge></button></li>
              ))}</ul>
            )}
          </section>
        );
      })}
      {open && <RecordModal obj={open.obj} record={open.rec} defaults={{ contact_id: contactId ?? data.deals.find((d) => d.id === dealId)?.contact_id ?? null, deal_id: dealId ?? null }} onClose={() => setOpen(null)} />}
    </>
  );
}
