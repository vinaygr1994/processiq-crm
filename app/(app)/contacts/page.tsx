"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { AddContactModal, ImportModal } from "@/components/forms";
import { Avatar, Badge, Button, Card, ConfirmModal, Empty, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { timeAgo } from "@/lib/format";

export default function ContactsPage() {
  const { data, me, can, team, update, removeMany, toast } = useCrm();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [owner, setOwner] = useState(() => (can("seeAll") ? "" : "_me"));
  const [sel, setSel] = useState<string[]>([]);
  const [bulkTag, setBulkTag] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [modal, setModal] = useState<"add" | "import" | null>(null);

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    data.contacts.forEach((c) => c.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data.contacts]);

  const last = useMemo(() => {
    const m = new Map<string, string>();
    const bump = (id: string | null, iso: string) => id && (!m.get(id) || iso > m.get(id)!) && m.set(id, iso);
    data.activities.forEach((a) => bump(a.contact_id, a.created_at));
    data.emails.forEach((e) => bump(e.contact_id, e.created_at));
    return m;
  }, [data.activities, data.emails]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.contacts
      .filter((c) => (!tag || c.tags.includes(tag)) && (!owner || (owner === "_me" ? c.owner === me.name : owner === "_none" ? !c.owner : c.owner === owner)) && (!s || [c.name, c.email, c.company, c.phone].some((v) => v.toLowerCase().includes(s))))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.contacts, q, tag, owner, me.name]);
  const allOn = list.length > 0 && list.every((c) => sel.includes(c.id));
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  async function assign(name: string) {
    for (const id of sel) await update("contacts", id, { owner: name });
    toast(`${sel.length} contact${sel.length === 1 ? "" : "s"} ${name ? `assigned to ${name}` : "unassigned"}`); setSel([]);
  }
  async function addTag() {
    const t2 = bulkTag.trim().toLowerCase(); if (!t2) return;
    for (const id of sel) { const c = data.contacts.find((x) => x.id === id); if (c && !c.tags.includes(t2)) await update("contacts", id, { tags: [...c.tags, t2] }); }
    toast(`Added to “${t2}”`); setBulkTag(""); setSel([]);
  }
  function exportCsv() {
    const rows = data.contacts.filter((c) => sel.includes(c.id));
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = ["Name,Email,Phone,Company,Owner,Source,Tags", ...rows.map((c) => [c.name, c.email, c.phone, c.company, c.owner ?? "", c.source, c.tags.join("; ")].map(cell).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "contacts.csv"; a.click();
  }

  return (
    <div>
      <PageHeader title="Contacts" sub="Everyone you do business with, and who looks after them."
        action={<div className="flex gap-2"><Button variant="soft" icon="upload" onClick={() => setModal("import")}>Import</Button><Button icon="plus" onClick={() => setModal("add")}>Add contact</Button></div>} />

      {data.contacts.length === 0 ? (
        <Card><Empty icon="users" title="No contacts yet" text="Add someone by hand, or import a spreadsheet to bring everyone over at once."
          action={<div className="flex gap-2"><Button onClick={() => setModal("add")}>Add contact</Button><Button variant="soft" onClick={() => setModal("import")}>Import CSV</Button></div>} /></Card>
      ) : (
        <>
          <div className="mb-3 flex gap-1 border-b border-line" role="tablist" aria-label="Views">
            {([["", "All contacts", data.contacts.length], ["_me", "My contacts", data.contacts.filter((c) => c.owner === me.name).length], ["_none", "Unassigned", data.contacts.filter((c) => !c.owner).length]] as const).map(([k, l, n]) => (
              <button key={k} role="tab" aria-selected={owner === k} onClick={() => { setOwner(k); setSel([]); }} className={`pill -mb-px border-b-2 px-3 py-2 text-[13.5px] font-semibold ${owner === k ? "border-teal-d text-teal-d" : "border-transparent text-muted hover:text-ink"}`}>{l} <span className="font-normal opacity-70">{n}</span></button>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input className="field !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, company, phone" aria-label="Search contacts" /></div>
            <select className="field !w-auto" aria-label="Owner" value={owner} onChange={(e) => { setOwner(e.target.value); setSel([]); }}>
              <option value="">Any owner</option><option value="_me">Me</option><option value="_none">Unassigned</option>{team.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select className="field !w-auto" aria-label="List" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Any list</option>{tags.map(([t2, n]) => <option key={t2} value={t2}>{t2} ({n})</option>)}
            </select>
            {(q || tag || owner) && <button onClick={() => { setQ(""); setTag(""); setOwner(""); }} className="text-[13px] font-semibold text-teal-d hover:underline">Clear filters</button>}
            <span className="ml-auto text-[13px] text-muted">{list.length} of {data.contacts.length}</span>
          </div>
          {sel.length > 0 && (
            <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-sm text-white shadow-lg">
              <span className="font-semibold">{sel.length} selected</span>
              {can("assign") && <select className="h-9 rounded-full border-0 bg-white/10 px-3 text-sm font-semibold text-white [&>option]:text-ink" aria-label="Assign to" value="" onChange={(e) => assign(e.target.value === "_none" ? "" : e.target.value)}><option value="" disabled>Assign to…</option><option value="_none">Nobody</option>{team.map((n) => <option key={n} value={n}>{n}</option>)}</select>}
              <span className="flex items-center gap-1"><input className="h-9 w-36 rounded-full border-0 bg-white/10 px-3 text-sm text-white placeholder:text-white/60" value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} placeholder="Add to list…" aria-label="Add to list" />{bulkTag && <button onClick={addTag} className="rounded-full bg-white/15 px-3 py-1.5 font-semibold hover:bg-white/25">Add</button>}</span>
              {can("export") && <button onClick={exportCsv} className="rounded-full px-3 py-1.5 font-semibold hover:bg-white/15">Export CSV</button>}
              {can("delete") && <button onClick={() => setConfirmDel(true)} className="rounded-full px-3 py-1.5 font-semibold text-[#ffb3c4] hover:bg-white/15">Delete</button>}
              <button onClick={() => setSel([])} className="ml-auto rounded-full px-3 py-1.5 font-semibold hover:bg-white/15">Clear</button>
            </div>
          )}
          <Card className="!p-0 overflow-hidden">
            {list.length === 0 ? (
              <div className="px-6 py-12 text-center text-muted">No contacts match.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="border-b border-line bg-[#f8f9fc] text-left text-[13px] text-muted">
                    <tr>
                      <th className="w-10 py-3 pl-5"><input type="checkbox" aria-label="Select all" className="size-4 accent-[#0b8a8a]" checked={allOn} onChange={() => setSel(allOn ? [] : list.map((c) => c.id))} /></th>
                      <th className="px-3 py-3 font-semibold">Name</th><th className="px-3 py-3 font-semibold">Company</th><th className="px-3 py-3 font-semibold">Owner</th><th className="px-3 py-3 font-semibold">Lists</th><th className="px-3 py-3 font-semibold">Source</th><th className="px-5 py-3 text-right font-semibold">Last activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {list.map((c) => (
                      <tr key={c.id} className={`hover:bg-cloud/70 ${sel.includes(c.id) ? "bg-teal-t/30" : ""}`}>
                        <td className="py-2 pl-5"><input type="checkbox" aria-label={`Select ${c.name}`} className="size-4 accent-[#0b8a8a]" checked={sel.includes(c.id)} onChange={() => toggle(c.id)} /></td>
                        <td className="px-3 py-2"><Link href={`/contacts/${c.id}`} className="flex items-center gap-3"><Avatar name={c.name} size="size-8 text-xs" /><span className="min-w-0"><span className="flex items-center gap-2"><span className="truncate font-semibold text-ink hover:text-teal-d">{c.name}</span>{c.unsubscribed && <Badge tone="rose">Unsubscribed</Badge>}</span><span className="block truncate text-[12.5px] text-muted">{c.email || c.phone || "No details"}</span></span></Link></td>
                        <td className="px-3 py-2 text-body">{c.company || <span className="text-muted">–</span>}</td>
                        <td className="px-3 py-2">{c.owner ? <span className="inline-flex items-center gap-1.5"><Avatar name={c.owner} size="size-5 text-[9px]" />{c.owner}</span> : <span className="text-muted">Unassigned</span>}</td>
                        <td className="px-3 py-2"><span className="flex flex-wrap gap-1">{c.tags.slice(0, 2).map((t2) => <Badge key={t2} tone="teal">{t2}</Badge>)}{c.tags.length > 2 && <span className="text-[12px] text-muted">+{c.tags.length - 2}</span>}</span></td>
                        <td className="px-3 py-2 text-muted">{c.source || "–"}</td>
                        <td className="px-5 py-2 text-right text-[13px] text-muted">{last.get(c.id) ? timeAgo(last.get(c.id)!) : "No activity"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      {modal === "add" && <AddContactModal onClose={() => setModal(null)} />}
      {modal === "import" && <ImportModal onClose={() => setModal(null)} />}
      {confirmDel && <ConfirmModal title={`Delete ${sel.length} contact${sel.length === 1 ? "" : "s"}?`} text="Their notes, tasks and emails are removed too. This can't be undone." onClose={() => setConfirmDel(false)} onConfirm={async () => { await removeMany("contacts", sel); toast("Deleted"); setSel([]); setConfirmDel(false); }} />}
    </div>
  );
}
