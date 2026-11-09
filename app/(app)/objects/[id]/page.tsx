"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { RecordModal } from "@/components/RecordModal";
import { Avatar, Badge, Button, Card, Empty, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { showValue, statusTone } from "@/lib/objects";
import type { CrmRecord } from "@/lib/types";

export default function ObjectRecordsPage() {
  const { id } = useParams<{ id: string }>();
  const { data, can, me, team, update, toast } = useCrm();
  const obj = data.objects.find((o) => o.id === id);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [who, setWho] = useState(() => (can("seeAll") ? "" : "_me"));
  const [open, setOpen] = useState<{ rec?: CrmRecord } | null>(null);
  const [sel, setSel] = useState<string[]>([]);

  const list = useMemo(() => {
    if (!obj) return [];
    const s = q.trim().toLowerCase();
    const cname = (cid: string | null) => data.contacts.find((c) => c.id === cid)?.name ?? "";
    return data.records.filter((r) => r.object_id === obj.id)
      .filter((r) => (!status || r.status === status) && (!who || (who === "_me" ? r.assigned_to === me.name : who === "_none" ? !r.assigned_to : r.assigned_to === who)))
      .filter((r) => !s || [r.title, cname(r.contact_id), ...Object.values(r.data)].some((v) => v.toLowerCase().includes(s)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [obj, data.records, data.contacts, q, status, who, me.name]);

  if (!obj) return <Card><Empty icon="layers" title="Object not found" text="It may have been deleted." action={<Link href="/objects"><Button>All objects</Button></Link>} /></Card>;
  const cols = obj.fields.filter((f) => f.type !== "textarea").slice(0, 3);
  const counts = obj.statuses.map((s) => [s, data.records.filter((r) => r.object_id === obj.id && r.status === s).length] as const);
  const allOn = list.length > 0 && list.every((r) => sel.includes(r.id));
  async function assign(name: string) { for (const rid of sel) await update("records", rid, { assigned_to: name }); toast(`${sel.length} assigned to ${name || "nobody"}`); setSel([]); }
  async function setSt(s: string) { for (const rid of sel) await update("records", rid, { status: s }); toast(`${sel.length} moved to ${s}`); setSel([]); }

  return (
    <div className="space-y-5">
      <PageHeader title={obj.plural} sub={`${list.length} shown`} action={can("write") ? <Button icon="plus" onClick={() => setOpen({})}>New {obj.name.toLowerCase()}</Button> : undefined} />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Status">
        <button role="tab" aria-selected={!status} onClick={() => setStatus("")} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${!status ? "bg-ink text-white" : "bg-white text-body ring-1 ring-line hover:ring-teal"}`}>All</button>
        {counts.map(([s, n]) => <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${status === s ? "bg-ink text-white" : "bg-white text-body ring-1 ring-line hover:ring-teal"}`}>{s} <span className="opacity-60">{n}</span></button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm"><Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field !h-10 !py-0 !pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${obj.plural.toLowerCase()}`} aria-label="Search" /></div>
        <select className="field !h-10 !w-auto !py-0" aria-label="Assigned to" value={who} onChange={(e) => setWho(e.target.value)}><option value="">Everyone</option><option value="_me">Assigned to me</option><option value="_none">Unassigned</option>{team.map((n) => <option key={n}>{n}</option>)}</select>
      </div>
      {sel.length > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-sm text-white shadow-lg">
          <span className="font-semibold">{sel.length} selected</span>
          {can("assign") && <select className="h-9 rounded-full border-0 bg-white/10 px-3 text-sm font-semibold text-white [&>option]:text-ink" aria-label="Assign to" value="" onChange={(e) => assign(e.target.value === "_none" ? "" : e.target.value)}><option value="" disabled>Assign to…</option><option value="_none">Nobody</option>{team.map((n) => <option key={n}>{n}</option>)}</select>}
          {can("write") && <select className="h-9 rounded-full border-0 bg-white/10 px-3 text-sm font-semibold text-white [&>option]:text-ink" aria-label="Set status" value="" onChange={(e) => setSt(e.target.value)}><option value="" disabled>Set status…</option>{obj.statuses.map((s) => <option key={s}>{s}</option>)}</select>}
          <button onClick={() => setSel([])} className="ml-auto rounded-full px-3 py-1.5 font-semibold hover:bg-white/15">Clear</button>
        </div>
      )}
      <Card className="!p-0 overflow-hidden">
        {list.length === 0 ? (
          <Empty icon={obj.icon} title={`No ${obj.plural.toLowerCase()} here`} text={q || status || who ? "Try clearing the filters." : `Add your first ${obj.name.toLowerCase()} and link it to a contact.`} action={can("write") && !q && !status ? <Button onClick={() => setOpen({})}>New {obj.name.toLowerCase()}</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-line bg-[#f8f9fc] text-left text-[13px] text-muted"><tr>
                <th className="w-10 py-3 pl-5"><input type="checkbox" aria-label="Select all" className="size-4 accent-[#0b8a8a]" checked={allOn} onChange={() => setSel(allOn ? [] : list.map((r) => r.id))} /></th>
                <th className="px-3 py-3 font-semibold">Title</th>{obj.link_contact && <th className="px-3 py-3 font-semibold">Contact</th>}<th className="px-3 py-3 font-semibold">Status</th>
                {cols.map((c) => <th key={c.key} className="px-3 py-3 font-semibold">{c.label}</th>)}<th className="px-5 py-3 font-semibold">Assigned to</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {list.map((r) => {
                  const c = data.contacts.find((x) => x.id === r.contact_id);
                  return (
                    <tr key={r.id} className={`cursor-pointer hover:bg-cloud/70 ${sel.includes(r.id) ? "bg-teal-t/30" : ""}`} onClick={() => setOpen({ rec: r })}>
                      <td className="py-3 pl-5" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${r.title}`} className="size-4 accent-[#0b8a8a]" checked={sel.includes(r.id)} onChange={() => setSel(sel.includes(r.id) ? sel.filter((x) => x !== r.id) : [...sel, r.id])} /></td>
                      <td className="px-3 py-3 font-semibold text-ink">{r.title}</td>
                      {obj.link_contact && <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>{c ? <Link href={`/contacts/${c.id}`} className="hover:text-teal-d">{c.name}</Link> : <span className="text-muted">–</span>}</td>}
                      <td className="px-3 py-3"><Badge tone={statusTone(obj, r.status)}>{r.status}</Badge></td>
                      {cols.map((f) => <td key={f.key} className="px-3 py-3 text-body">{showValue(f, r.data[f.key]) || <span className="text-muted">–</span>}</td>)}
                      <td className="px-5 py-3">{r.assigned_to ? <span className="inline-flex items-center gap-1.5"><Avatar name={r.assigned_to} size="size-5 text-[9px]" />{r.assigned_to}</span> : <span className="text-muted">Unassigned</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && <RecordModal obj={obj} record={open.rec} onClose={() => setOpen(null)} />}
    </div>
  );
}
