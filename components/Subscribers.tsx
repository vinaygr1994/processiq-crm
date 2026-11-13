"use client";
import { useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Badge, Button, Card, Modal } from "./ui";
import { useCrm } from "@/lib/store";
import { timeAgo } from "@/lib/format";
import type { Contact } from "@/lib/types";

export type SubStatus = "Active" | "Unsubscribed" | "Bounced" | "Spam complaint" | "Suppressed" | "No email";
const TONE: Record<SubStatus, "green" | "rose" | "sun" | "gray" | "iris"> = { Active: "green", Unsubscribed: "rose", Bounced: "sun", "Spam complaint": "rose", Suppressed: "iris", "No email": "gray" };
const norm = (e: string) => e.trim().toLowerCase();
const EMAIL = /^[^\s@,;"'<>]+@[^\s@,;"'<>]+\.[a-z]{2,}$/i;

/** Email subscriber status, in priority order: bounces and complaints first, then unsubscribes, then the suppression list. */
export function subStatus(c: Contact, suppressed: Set<string>): SubStatus {
  if (!c.email) return "No email";
  if (c.email_status === "bounced") return "Bounced";
  if (c.email_status === "complaint") return "Spam complaint";
  if (c.unsubscribed && c.email_status === "suppressed") return "Suppressed";
  if (c.unsubscribed) return "Unsubscribed";
  if (suppressed.has(norm(c.email))) return "Suppressed";
  return "Active";
}

export function Subscribers() {
  const { data, add, update, remove, can, toast } = useCrm();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<SubStatus | "">("");
  const [page, setPage] = useState(0);
  const [confirm, setConfirm] = useState<{ c: Contact; to: "unsub" | "resub" } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const PER = 25;
  const write = can("write");

  const suppressed = useMemo(() => new Set(data.suppressions.map((s) => norm(s.email))), [data.suppressions]);
  const rows = useMemo(() => data.contacts.filter((c) => c.email).map((c) => ({ c, st: subStatus(c, suppressed) })), [data.contacts, suppressed]);
  const counts = useMemo(() => rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.st]: (m[r.st] ?? 0) + 1 }), {}), [rows]);
  const fewer = data.contacts.filter((c) => c.tags.includes("fewer-emails")).length;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!filter || r.st === filter) && (!s || r.c.email.toLowerCase().includes(s) || r.c.name.toLowerCase().includes(s))).sort((a, b) => a.c.email.localeCompare(b.c.email));
  }, [rows, q, filter]);
  const pageRows = shown.slice(page * PER, page * PER + PER);

  async function setSub(c: Contact, to: "unsub" | "resub") {
    if (to === "unsub") await update("contacts", c.id, { unsubscribed: true, email_status: "manual", unsub_reason: "Unsubscribed by your team", unsub_at: new Date().toISOString() });
    else {
      await update("contacts", c.id, { unsubscribed: false, email_status: "", unsub_reason: "", unsub_at: null });
      const s = data.suppressions.find((x) => norm(x.email) === norm(c.email));
      if (s) await remove("suppressions", s.id);
    }
    toast(to === "unsub" ? `${c.email} unsubscribed` : `${c.email} is active again`);
    setConfirm(null);
  }

  /** Adds addresses to the suppression list and suppresses any matching contacts. */
  async function suppress(text: string, why: string) {
    const emails = [...new Set(text.split(/[\s,;]+/).map((x) => norm(x.replace(/^["'<]+|[>"']+$/g, ""))).filter((x) => EMAIL.test(x)))];
    const fresh = emails.filter((e) => !suppressed.has(e));
    if (!emails.length) return toast("No email addresses found", "error");
    setBusy(true);
    const r = why.trim() || "Added to suppression list";
    for (let i = 0; i < fresh.length; i += 20) await Promise.all(fresh.slice(i, i + 20).map((email) => add("suppressions", { email, reason: r })));
    const hit = data.contacts.filter((c) => c.email && emails.includes(norm(c.email)) && !c.unsubscribed);
    for (const c of hit) await update("contacts", c.id, { unsubscribed: true, email_status: "suppressed", unsub_reason: r, unsub_at: new Date().toISOString() });
    setBusy(false); setAddOpen(false); setPaste(""); setReason("");
    toast(`${fresh.length} address${fresh.length === 1 ? "" : "es"} added${emails.length > fresh.length ? ` (${emails.length - fresh.length} already on the list)` : ""}${hit.length ? `, ${hit.length} contact${hit.length === 1 ? "" : "s"} suppressed` : ""}`);
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 5_000_000) return toast("That file is over 5 MB. Split it into smaller files.", "error");
    setPaste(await f.text()); setAddOpen(true);
    if (file.current) file.current.value = "";
  }

  const chips: (SubStatus | "")[] = ["", "Active", "Unsubscribed", "Bounced", "Spam complaint", "Suppressed"];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {chips.map((k) => (
          <button key={k || "all"} type="button" onClick={() => { setFilter(k); setPage(0); }}
            className={`pill rounded-full px-3.5 py-1.5 text-[13px] font-semibold ring-1 ${filter === k ? "bg-ink text-white ring-ink" : "bg-white text-body ring-line hover:ring-[#b7c1d6]"}`}>
            {k || "All subscribers"} <span className="font-normal opacity-70">{k ? counts[k] ?? 0 : rows.length}</span>
          </button>
        ))}
        {fewer > 0 && <span className="self-center text-[13px] text-muted">{fewer} asked for fewer emails (tag <strong>fewer-emails</strong>)</span>}
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field !pl-9" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search email or name" aria-label="Search subscribers" /></div>
          <span className="ml-auto text-[13px] text-muted">{shown.length} subscriber{shown.length === 1 ? "" : "s"}</span>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-line bg-[#f8f9fc] text-left text-muted"><tr><th className="px-5 py-2.5 font-semibold">Email address</th><th className="px-3 py-2.5 font-semibold">Subscriber</th><th className="px-3 py-2.5 font-semibold">Status</th><th className="px-3 py-2.5 font-semibold">Reason</th><th className="px-3 py-2.5 font-semibold">Since</th><th className="px-5 py-2.5" /></tr></thead>
          <tbody className="divide-y divide-line">
            {pageRows.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">No subscribers match.</td></tr>}
            {pageRows.map(({ c, st }) => (
              <tr key={c.id}>
                <td className="px-5 py-2.5 font-medium text-ink">{c.email}</td>
                <td className="px-3 py-2.5">{c.name}</td>
                <td className="px-3 py-2.5"><Badge tone={TONE[st]}>{st}</Badge></td>
                <td className="max-w-[260px] truncate px-3 py-2.5 text-muted" title={c.unsub_reason || data.suppressions.find((s) => norm(s.email) === norm(c.email))?.reason}>{c.unsub_reason || (st === "Suppressed" ? data.suppressions.find((s) => norm(s.email) === norm(c.email))?.reason : "") || "–"}</td>
                <td className="px-3 py-2.5 text-muted">{c.unsub_at ? timeAgo(c.unsub_at) : "–"}</td>
                <td className="px-5 py-2.5 text-right">
                  {write && (st === "Active"
                    ? <button type="button" onClick={() => setConfirm({ c, to: "unsub" })} className="text-[13px] font-semibold text-rose hover:underline">Unsubscribe</button>
                    : <button type="button" onClick={() => setConfirm({ c, to: "resub" })} className="text-[13px] font-semibold text-teal-d hover:underline">{st === "Bounced" ? "Mark as fixed" : "Resubscribe"}</button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {shown.length > PER && <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[13px] text-muted"><span>{page * PER + 1}–{Math.min(shown.length, page * PER + PER)} of {shown.length}</span><span className="flex gap-2"><Button size="sm" variant="soft" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="soft" disabled={(page + 1) * PER >= shown.length} onClick={() => setPage(page + 1)}>Next</Button></span></div>}
      </Card>

      <Card>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Suppression list <span className="font-normal text-muted">{data.suppressions.length}</span></h2>
            <p className="text-sm text-muted">Addresses that never get marketing email, even if they&apos;re added as a contact later. Hard bounces and spam complaints are added automatically.</p>
          </div>
          {write && <div className="flex gap-2">
            <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="soft" icon="upload" onClick={() => file.current?.click()}>Upload CSV</Button>
            <Button icon="plus" onClick={() => setAddOpen(true)}>Add addresses</Button>
          </div>}
        </div>
        {data.suppressions.length > 0 && (
          <ul className="mt-4 max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {[...data.suppressions].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 500).map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{s.email}</span>
                <span className="hidden truncate text-muted sm:block sm:max-w-[40%]">{s.reason}</span>
                <span className="shrink-0 text-[12.5px] text-muted">{timeAgo(s.created_at)}</span>
                {write && <button type="button" aria-label={`Remove ${s.email}`} onClick={() => remove("suppressions", s.id)} className="grid size-7 place-items-center rounded-full text-muted hover:bg-rose-t hover:text-rose"><Icon name="x" className="size-3.5" /></button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {confirm && (
        <Modal title={confirm.to === "unsub" ? "Unsubscribe this address?" : "Resubscribe this address?"} onClose={() => setConfirm(null)}>
          <p className="text-sm text-body">{confirm.to === "unsub"
            ? <><strong>{confirm.c.email}</strong> will stop getting marketing emails from journeys and sends.</>
            : <>Only resubscribe <strong>{confirm.c.email}</strong> if they asked to hear from you again{subStatus(confirm.c, suppressed) === "Bounced" ? " or you've corrected the address" : ""}. Emailing people who opted out breaks anti-spam laws and hurts your sender reputation.</>}</p>
          <div className="mt-5 flex justify-end gap-2"><Button variant="soft" onClick={() => setConfirm(null)}>Cancel</Button><Button onClick={() => setSub(confirm.c, confirm.to)}>{confirm.to === "unsub" ? "Unsubscribe" : "Resubscribe"}</Button></div>
        </Modal>
      )}
      {addOpen && (
        <Modal title="Add to suppression list" onClose={() => setAddOpen(false)}>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">Email addresses</span>
            <textarea className="field !min-h-[160px] font-mono !text-[13px]" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"one@example.com\ntwo@example.com"} /></label>
          <p className="mt-1.5 text-[12.5px] text-muted">Paste addresses or a CSV. Anything that looks like an email address is picked up; everything else is ignored.</p>
          <label className="mt-3 block"><span className="mb-1.5 block text-sm font-semibold">Reason (optional)</span><input className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Old unsubscribe list from Mailchimp" /></label>
          <div className="mt-5 flex justify-end gap-2"><Button variant="soft" onClick={() => setAddOpen(false)}>Cancel</Button><Button disabled={busy || !paste.trim()} onClick={() => suppress(paste, reason)}>{busy ? "Adding…" : "Add to list"}</Button></div>
        </Modal>
      )}
    </div>
  );
}
