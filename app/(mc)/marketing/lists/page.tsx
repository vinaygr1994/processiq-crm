"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button, Card, ConfirmModal, Empty, Field, Modal, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import type { Contact, Segment } from "@/lib/types";
import { SegmentModal, useSegCtx } from "@/components/SegmentBuilder";
import { SEG, fieldDef, segmentMembers } from "@/lib/segments";

/** Lists are tags: adding someone to a list tags them, so lists work everywhere (journeys, sends, filters). */
function ListModal({ initial, onClose }: { initial?: string; onClose: () => void }) {
  const { data, update, toast } = useCrm();
  const [name, setName] = useState(initial ?? "");
  const [ids, setIds] = useState<string[]>(() => (initial ? data.contacts.filter((c) => c.tags.includes(initial)).map((c) => c.id) : []));
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const s = q.trim().toLowerCase();
  const hits = data.contacts.filter((c) => !s || [c.name, c.email, c.company, ...c.tags].some((v) => v.toLowerCase().includes(s)));
  const toggle = (id: string) => setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  async function save() {
    const tag = name.trim().toLowerCase();
    if (!tag) return setErr("Give the list a name.");
    setBusy(true);
    const changes: [Contact, string[]][] = [];
    for (const c of data.contacts) {
      const has = c.tags.includes(tag), want = ids.includes(c.id);
      const was = initial && initial !== tag && c.tags.includes(initial);
      let tags = c.tags;
      if (was) tags = tags.filter((t) => t !== initial);
      if (want && !tags.includes(tag)) tags = [...tags, tag];
      if (!want && has) tags = tags.filter((t) => t !== tag);
      if (tags !== c.tags) changes.push([c, tags]);
    }
    for (const [c, tags] of changes) await update("contacts", c.id, { tags });
    setBusy(false); toast(initial ? "List updated" : "List created"); onClose();
  }

  return (
    <Modal title={initial ? `Edit list “${initial}”` : "New list"} onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="List name" hint="Lowercase works best, e.g. newsletter, vip, past-customers."><input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. newsletter" /></Field>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-ink">Members <span className="font-medium text-muted">({ids.length})</span></span>
          <div className="flex gap-3 text-[13px] font-semibold"><button type="button" onClick={() => setIds([...new Set([...ids, ...hits.map((c) => c.id)])])} className="text-teal-d hover:underline">Select all shown</button><button type="button" onClick={() => setIds([])} className="text-muted hover:underline">Clear</button></div>
        </div>
        <div className="relative"><Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" /><input className="field !pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts or existing tags" aria-label="Search contacts" /></div>
        <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-2xl border border-line">
          {hits.map((c) => {
            const on = ids.includes(c.id);
            return (
              <li key={c.id}><button type="button" onClick={() => toggle(c.id)} aria-pressed={on} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-cloud ${on ? "bg-teal-t/40" : ""}`}>
                <span className={`grid size-5 shrink-0 place-items-center rounded-md border-2 ${on ? "border-teal bg-teal text-white" : "border-line"}`}>{on && <Icon name="check" className="size-3" />}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{c.name}</span><span className="block truncate text-[13px] text-muted">{c.email || "No email"}{c.tags.length ? ` · ${c.tags.join(", ")}` : ""}</span></span>
              </button></li>
            );
          })}
        </ul>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2"><Button variant="soft" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save list"}</Button></div>
      </div>
    </Modal>
  );
}

function SegmentsTab() {
  const { data, remove, toast } = useCrm();
  const x = useSegCtx();
  const [open, setOpen] = useState<Segment | "new" | null>(null);
  const [del, setDel] = useState<Segment | null>(null);
  const summary = (s: Segment) => s.rules.map((r) => { const f = fieldDef(r.field); const op = f.ops.find((o) => o.id === r.op)?.label ?? r.op; const v = f.kind === "days" ? `${r.value} days` : f.kind === "campaign" ? data.campaigns.find((c) => c.id === r.value)?.name ?? "a send" : f.kind === "journey" ? data.workflows.find((w) => w.id === r.value)?.name ?? "a journey" : r.value; return `${f.label} ${op}${["set", "not_set", "subscribed", "unsubscribed"].includes(r.op) ? "" : ` ${v}`}`; }).join(s.match === "all" ? " and " : " or ");
  return (
    <>
      {data.segments.length === 0 ? (
        <Card><Empty icon="sparkle" title="No smart segments yet" text="Segments fill themselves from rules, like “opened an email in the last 30 days” or “deal value over $10,000”, and stay up to date." action={<Button icon="plus" onClick={() => setOpen("new")}>New segment</Button>} /></Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <ul className="divide-y divide-line">
            {data.segments.map((s) => {
              const m = segmentMembers(data.contacts, s, x), ok = m.filter((c) => c.email && !c.unsubscribed).length;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-iris-t text-iris"><Icon name="sparkle" className="size-5" /></span>
                  <div className="min-w-0 flex-1"><button type="button" onClick={() => setOpen(s)} className="font-semibold text-ink hover:text-teal-d">{s.name}</button><div className="line-clamp-2 text-[13px] text-muted">{summary(s)}</div></div>
                  <div className="text-right text-sm"><div className="font-semibold text-ink">{m.length} contacts</div><div className="text-[13px] text-muted">{ok} can be emailed</div></div>
                  <div className="flex items-center gap-1">
                    <Link href={`/marketing/send?list=${encodeURIComponent(SEG + s.id)}`} className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-teal-d hover:bg-teal-t">Send email</Link>
                    <button type="button" onClick={() => setOpen(s)} className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-body hover:bg-cloud">Edit</button>
                    <button type="button" onClick={() => setDel(s)} aria-label={`Delete segment ${s.name}`} className="grid size-8 place-items-center rounded-full text-[#b3bdd2] hover:bg-rose-t hover:text-rose"><Icon name="trash" className="size-4" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {data.segments.length > 0 && <div className="flex justify-end"><Button icon="plus" variant="soft" onClick={() => setOpen("new")}>New segment</Button></div>}
      {open && <SegmentModal seg={open === "new" ? undefined : open} onClose={() => setOpen(null)} />}
      {del && <ConfirmModal title={`Delete the segment “${del.name}”?`} text="The contacts stay in your CRM. Journeys that start from this segment stop letting new people in." onClose={() => setDel(null)} onConfirm={async () => { await remove("segments", del.id); setDel(null); toast("Segment deleted"); }} />}
    </>
  );
}

export default function ListsPage() {
  const [tab, setTab] = useState<"lists" | "segments">("lists");
  const [newSeg, setNewSeg] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader title="Lists and segments" sub="Lists are people you add by hand. Smart segments fill themselves from rules."
        action={tab === "lists" ? undefined : <Button icon="plus" onClick={() => setNewSeg(true)}>New segment</Button>} />
      <div className="inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-line" role="tablist">
        {([["lists", "Lists"], ["segments", "Smart segments"]] as const).map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full px-5 py-2 text-sm font-semibold transition ${tab === id ? "bg-ink text-white" : "text-body hover:bg-cloud"}`}>{l}</button>)}
      </div>
      {tab === "lists" ? <ListsTab /> : <SegmentsTab />}
      {newSeg && <SegmentModal onClose={() => setNewSeg(false)} />}
    </div>
  );
}

function ListsTab() {
  const { data, update, toast } = useCrm();
  const [open, setOpen] = useState<string | "new" | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const lists = useMemo(() => {
    const m = new Map<string, Contact[]>();
    data.contacts.forEach((c) => c.tags.forEach((t) => m.set(t, [...(m.get(t) ?? []), c])));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [data.contacts]);

  async function remove(tag: string) {
    for (const c of data.contacts.filter((x) => x.tags.includes(tag))) await update("contacts", c.id, { tags: c.tags.filter((t) => t !== tag) });
    setDel(null); toast("List deleted. The contacts are still in your CRM.");
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button icon="plus" onClick={() => setOpen("new")}>New list</Button></div>
      {lists.length === 0 ? (
        <Card><Empty icon="tag" title="No lists yet" text="Create a list such as “newsletter” or “past customers”, then send to it or use it to start a journey." action={<Button icon="plus" onClick={() => setOpen("new")}>New list</Button>} /></Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b border-line text-left text-[13px] text-muted"><tr><th className="px-5 py-3 font-semibold">List</th><th className="px-3 py-3 text-right font-semibold">Contacts</th><th className="px-3 py-3 text-right font-semibold">Can email</th><th className="px-3 py-3 text-right font-semibold">Unsubscribed</th><th className="px-5 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-line">
                {lists.map(([tag, cs]) => {
                  const ok = cs.filter((c) => c.email && !c.unsubscribed).length, un = cs.filter((c) => c.unsubscribed).length;
                  return (
                    <tr key={tag}>
                      <td className="px-5 py-3"><button type="button" onClick={() => setOpen(tag)} className="inline-flex items-center gap-2 font-semibold text-ink hover:text-teal-d"><Icon name="tag" className="size-4 text-teal" />{tag}</button></td>
                      <td className="px-3 py-3 text-right font-semibold">{cs.length}</td>
                      <td className="px-3 py-3 text-right">{ok}</td>
                      <td className="px-3 py-3 text-right text-muted">{un}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/marketing/send?list=${encodeURIComponent(tag)}`} className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-teal-d hover:bg-teal-t">Send email</Link>
                          <button type="button" onClick={() => setOpen(tag)} className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-body hover:bg-cloud">Edit</button>
                          <button type="button" onClick={() => setDel(tag)} aria-label={`Delete list ${tag}`} className="grid size-8 place-items-center rounded-full text-[#b3bdd2] hover:bg-rose-t hover:text-rose"><Icon name="trash" className="size-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="text-[13px] text-muted">Tip: a journey can start when someone joins a list. In Journeys, choose the entry source &ldquo;Contact gets a tag&rdquo;.</p>
      {open && <ListModal initial={open === "new" ? undefined : open} onClose={() => setOpen(null)} />}
      {del && <ConfirmModal title={`Delete the list “${del}”?`} text="This removes the list label from its contacts. The contacts themselves stay in your CRM." onClose={() => setDel(null)} onConfirm={() => remove(del)} />}
    </div>
  );
}
