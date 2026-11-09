"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, Card, Empty, Modal, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { useStages } from "@/lib/useStages";
import { money, timeAgo } from "@/lib/format";
import { columnOf } from "@/lib/pipelines";
import type { Contact, Deal } from "@/lib/types";

interface Co { name: string; contacts: Contact[]; deals: Deal[]; open: number; won: number; last: string }

/** Companies are built from the company on each contact, so they stay in sync with no extra typing. */
export default function CompaniesPage() {
  const { data } = useCrm();
  const { pipelines } = useStages();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Co | null>(null);
  const [sort, setSort] = useState<"name" | "open" | "won" | "contacts">("open");

  const cos = useMemo(() => {
    const m = new Map<string, Co>();
    for (const c of data.contacts) {
      const name = c.company.trim(); if (!name) continue;
      const key = name.toLowerCase();
      const e = m.get(key) ?? { name, contacts: [], deals: [], open: 0, won: 0, last: c.created_at };
      e.contacts.push(c);
      for (const d of data.deals.filter((x) => x.contact_id === c.id)) {
        e.deals.push(d);
        const k = columnOf(d, pipelines).kind;
        if (k === "open") e.open += d.value || 0; else if (k === "won") e.won += d.value || 0;
        if (d.stage_at > e.last) e.last = d.stage_at;
      }
      const act = data.activities.filter((a) => a.contact_id === c.id).map((a) => a.created_at).sort().pop();
      if (act && act > e.last) e.last = act;
      m.set(key, e);
    }
    const s = q.trim().toLowerCase();
    return [...m.values()].filter((c) => !s || c.name.toLowerCase().includes(s) || c.contacts.some((x) => x.name.toLowerCase().includes(s)))
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "contacts" ? b.contacts.length - a.contacts.length : sort === "won" ? b.won - a.won : b.open - a.open);
  }, [data.contacts, data.deals, data.activities, pipelines, q, sort]);
  const noCompany = data.contacts.filter((c) => !c.company.trim()).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Companies" sub="Every business you work with, with its people, deals and revenue." />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm"><Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field !h-10 !py-0 !pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies or people" aria-label="Search companies" /></div>
        <select className="field !h-10 !w-auto !py-0" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="open">Most open pipeline</option><option value="won">Most revenue won</option><option value="contacts">Most contacts</option><option value="name">Name A–Z</option></select>
      </div>
      {cos.length === 0 ? (
        <Card><Empty icon="building" title={q ? "No companies match" : "No companies yet"} text="Add a company name to your contacts and they're grouped here automatically." /></Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line bg-[#f8f9fc] text-left text-[13px] text-muted"><tr><th className="px-5 py-3 font-semibold">Company</th><th className="px-3 py-3 text-right font-semibold">Contacts</th><th className="px-3 py-3 text-right font-semibold">Deals</th><th className="px-3 py-3 text-right font-semibold">Open pipeline</th><th className="px-3 py-3 text-right font-semibold">Revenue won</th><th className="px-5 py-3 font-semibold">Last activity</th></tr></thead>
              <tbody className="divide-y divide-line">
                {cos.map((c) => (
                  <tr key={c.name} className="cursor-pointer hover:bg-cloud" onClick={() => setSel(c)}>
                    <td className="px-5 py-3"><span className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-iris-t font-display text-sm font-bold text-iris">{c.name.slice(0, 2).toUpperCase()}</span><span className="font-semibold text-ink">{c.name}</span></span></td>
                    <td className="px-3 py-3 text-right">{c.contacts.length}</td>
                    <td className="px-3 py-3 text-right">{c.deals.length}</td>
                    <td className="px-3 py-3 text-right font-semibold">{c.open ? money(c.open) : "–"}</td>
                    <td className="px-3 py-3 text-right">{c.won ? money(c.won) : "–"}</td>
                    <td className="px-5 py-3 text-muted">{timeAgo(c.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {noCompany > 0 && <p className="text-[13px] text-muted">{noCompany} contact{noCompany === 1 ? " has" : "s have"} no company. Individual customers are fine without one.</p>}

      {sel && (
        <Modal title={sel.name} onClose={() => setSel(null)} wide>
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">{[["Open pipeline", money(sel.open)], ["Revenue won", money(sel.won)], ["Deals", String(sel.deals.length)]].map(([l, v]) => <div key={l} className="rounded-2xl bg-cloud p-3"><div className="text-[12.5px] text-muted">{l}</div><div className="font-display text-lg font-semibold text-ink">{v}</div></div>)}</div>
            <section><h3 className="mb-2 text-sm font-semibold">People</h3><ul className="divide-y divide-line rounded-2xl border border-line">{sel.contacts.map((c) => <li key={c.id}><Link href={`/contacts/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-cloud"><Avatar name={c.name} size="size-8 text-xs" /><span className="min-w-0"><span className="block font-semibold text-ink">{c.name}</span><span className="block truncate text-[13px] text-muted">{c.email || c.phone}</span></span></Link></li>)}</ul></section>
            <section><h3 className="mb-2 text-sm font-semibold">Deals</h3>{sel.deals.length === 0 ? <p className="text-sm text-muted">No deals yet.</p> : <ul className="divide-y divide-line rounded-2xl border border-line">{sel.deals.map((d) => { const st = columnOf(d, pipelines); return <li key={d.id}><Link href={`/pipeline?deal=${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-cloud"><span className="min-w-0"><span className="block truncate font-semibold text-ink">{d.title}</span><span className="text-[13px] text-muted">{d.value ? money(d.value) : "No amount"}</span></span><Badge tone={st.kind === "won" ? "green" : st.kind === "lost" ? "gray" : "iris"}>{st.label}</Badge></Link></li>; })}</ul>}</section>
          </div>
        </Modal>
      )}
    </div>
  );
}
