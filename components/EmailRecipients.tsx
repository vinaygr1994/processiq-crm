"use client";
// Tracking details for one email: who it went to, who opened, who clicked and which links (like SFMC's send tracking).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Modal } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { useCrm } from "@/lib/store";
import { isDemo } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { toCsv } from "@/lib/csv";
import type { EmailLog } from "@/lib/types";

interface Ev { email_id: string; kind: "open" | "click"; url: string; created_at: string }
type Filter = "all" | "opened" | "clicked" | "unopened" | "failed";
const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const shortUrl = (u: string) => { try { const x = new URL(u); return (x.host + x.pathname).replace(/\/$/, "") + (x.hash || ""); } catch { return u; } };

export function EmailRecipients({ title, sub, items, onClose }: { title: string; sub: string; items: EmailLog[]; onClose: () => void }) {
  const { data } = useCrm();
  const [events, setEvents] = useState<Ev[] | null>(isDemo ? [] : null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  // Every open and click for these emails (in chunks so the request URL stays short).
  useEffect(() => {
    if (isDemo) return;
    let off = false;
    (async () => {
      const ids = items.map((e) => e.id), out: Ev[] = [];
      for (let i = 0; i < ids.length; i += 150) {
        const { data: rows } = await supabase().from("email_events").select("email_id,kind,url,created_at").in("email_id", ids.slice(i, i + 150)).order("created_at").limit(5000);
        out.push(...((rows ?? []) as Ev[]));
      }
      if (!off) setEvents(out);
    })().catch(() => { if (!off) setEvents([]); });
    return () => { off = true; };
  }, [items]);

  const contacts = useMemo(() => new Map(data.contacts.map((c) => [c.id, c])), [data.contacts]);
  const byEmail = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of events ?? []) m.set(e.email_id, [...(m.get(e.email_id) ?? []), e]);
    return m;
  }, [events]);

  const rows = useMemo(() => items.map((e) => {
    const ev = byEmail.get(e.id) ?? [];
    const opens = ev.filter((x) => x.kind === "open").length || (e.opened_at || e.clicked_at ? 1 : 0);
    const clicks = ev.filter((x) => x.kind === "click");
    const c = e.contact_id ? contacts.get(e.contact_id) : undefined;
    const status = e.status === "failed" ? "Failed" : e.clicked_at ? "Clicked" : e.opened_at ? "Opened" : "Sent";
    return { e, c, status, opens, clicks: clicks.length || (e.clicked_at ? 1 : 0), links: [...new Set(clicks.map((x) => x.url))] };
  }).sort((a, b) => ["Clicked", "Opened", "Sent", "Failed"].indexOf(a.status) - ["Clicked", "Opened", "Sent", "Failed"].indexOf(b.status) || (b.e.opened_at ?? "").localeCompare(a.e.opened_at ?? "")), [items, byEmail, contacts]);

  const count = (f: Filter) => rows.filter((r) => match(r.status, f)).length;
  const shown = rows.filter((r) => match(r.status, filter) && (!q.trim() || `${r.e.to_email} ${r.c?.name ?? ""} ${r.c?.company ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));

  // Link report: unique people and total clicks per URL.
  const links = useMemo(() => {
    const m = new Map<string, { people: Set<string>; total: number }>();
    for (const e of events ?? []) if (e.kind === "click") { const l = m.get(e.url) ?? { people: new Set(), total: 0 }; l.people.add(e.email_id); l.total++; m.set(e.url, l); }
    return [...m.entries()].map(([url, l]) => ({ url, people: l.people.size, total: l.total })).sort((a, b) => b.people - a.people || b.total - a.total);
  }, [events]);

  function exportCsv() {
    const csv = toCsv([["Email", "Name", "Company", "Status", "Sent", "First opened", "Opens", "First clicked", "Clicks", "Links clicked"],
      ...rows.map((r) => [r.e.to_email, r.c?.name ?? "", r.c?.company ?? "", r.status, when(r.e.created_at), when(r.e.opened_at || r.e.clicked_at), r.opens, when(r.e.clicked_at), r.clicks, r.links.join(" ")])]);
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${title.replace(/[^\w]+/g, "-").slice(0, 60)}-recipients.csv`; a.click();
  }

  const FILTERS: [Filter, string][] = [["all", "All"], ["opened", "Opened"], ["clicked", "Clicked"], ["unopened", "Didn't open"], ["failed", "Failed"]];
  return (
    <Modal title="Tracking details" onClose={onClose} wide="xl">
      <div className="mb-4">
        <div className="text-[16px] font-semibold text-ink">{title}</div>
        <div className="text-[13px] text-muted">{sub}</div>
      </div>

      {links.length > 0 && (
        <div className="mb-5 rounded-xl border border-line">
          <div className="border-b border-line px-4 py-2.5 text-[13px] font-semibold text-ink">Links clicked</div>
          <ul className="divide-y divide-line">{links.map((l) => (
            <li key={l.url} className="flex items-center gap-3 px-4 py-2 text-[13px]">
              <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-teal-d hover:underline" title={l.url}>{shortUrl(l.url)}</a>
              <span className="shrink-0 tabular-nums text-ink">{l.people} {l.people === 1 ? "person" : "people"}</span>
              <span className="w-20 shrink-0 text-right tabular-nums text-muted">{l.total} click{l.total === 1 ? "" : "s"}</span>
            </li>))}</ul>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist">{FILTERS.map(([f, l]) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`pill rounded-full px-3 py-1 text-[12.5px] font-semibold ${filter === f ? "bg-ink text-white" : "bg-cloud text-body hover:text-ink"}`}>{l} <span className="opacity-70">{count(f)}</span></button>
        ))}</div>
        <input className="field ml-auto h-9 w-full max-w-[220px] text-[13px]" placeholder="Search email or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search recipients" />
        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal-d hover:underline"><Icon name="download" className="size-4" />Export CSV</button>
      </div>

      <div className="max-h-[52vh] overflow-auto rounded-xl border border-line">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="sticky top-0 bg-cloud text-[12px] font-semibold text-muted"><tr>
            <th className="px-4 py-2.5">Recipient</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">First opened</th><th className="px-3 py-2.5 text-right">Opens</th><th className="px-3 py-2.5">First clicked</th><th className="px-4 py-2.5">Links</th>
          </tr></thead>
          <tbody className="divide-y divide-line">
            {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">{filter === "all" ? "No recipients." : "Nobody in this group yet."}</td></tr>}
            {shown.map((r) => (
              <tr key={r.e.id} className="align-top">
                <td className="max-w-[260px] px-4 py-2.5">
                  {r.c ? <Link href={`/contacts/${r.c.id}`} className="block truncate font-semibold text-ink hover:underline">{r.c.name || r.e.to_email}</Link> : <span className="block truncate font-semibold text-ink">{r.e.to_email}</span>}
                  <span className="block truncate text-[12px] text-muted">{r.c ? r.e.to_email : "Sent at " + when(r.e.created_at)}{r.c?.company ? ` · ${r.c.company}` : ""}</span>
                </td>
                <td className="px-3 py-2.5"><Badge tone={r.status === "Clicked" ? "iris" : r.status === "Opened" ? "teal" : r.status === "Failed" ? "rose" : "gray"}>{r.status}</Badge>{r.status === "Failed" && r.e.error && <div className="mt-1 max-w-[180px] text-[11.5px] text-rose">{r.e.error}</div>}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-body">{when(r.e.opened_at || r.e.clicked_at) || <span className="text-muted">–</span>}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.opens || <span className="text-muted">0</span>}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-body">{when(r.e.clicked_at) || <span className="text-muted">–</span>}</td>
                <td className="max-w-[240px] px-4 py-2.5">{r.links.length ? r.links.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="block truncate text-teal-d hover:underline" title={u}>{shortUrl(u)}</a>) : r.clicks ? <span className="text-muted">{r.clicks} click{r.clicks === 1 ? "" : "s"}</span> : <span className="text-muted">–</span>}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-muted">{events === null ? "Loading every open and click…" : "Opens count when images load; Apple Mail and some security scanners can open emails automatically. Links and repeat opens are recorded from today onward."}</p>
    </Modal>
  );
}

function match(status: string, f: Filter) {
  if (f === "all") return true;
  if (f === "opened") return status === "Opened" || status === "Clicked";
  if (f === "clicked") return status === "Clicked";
  if (f === "unopened") return status === "Sent";
  return status === "Failed";
}
