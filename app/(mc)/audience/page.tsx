"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { DeBuilder } from "@/components/DeBuilder";
import { Subscribers, subStatus } from "@/components/Subscribers";
import { Avatar, Badge, Button, Card, Empty, Modal, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { rowsFor, typeLabel } from "@/lib/de";
import { timeAgo } from "@/lib/format";
import type { Contact, DataExtension } from "@/lib/types";

type Tab = "contacts" | "subscribers" | "designer" | "extensions";
const TABS: [Tab, string][] = [["contacts", "All Contacts"], ["subscribers", "All Subscribers"], ["designer", "Data Designer"], ["extensions", "Data Extensions"]];
const NONE = new Set<string>();
const stat = (c: Contact) => { const s = subStatus(c, NONE); return [s, s === "Active" ? "green" : s === "No email" ? "gray" : s === "Bounced" ? "sun" : "rose"] as [string, "rose" | "green" | "gray" | "sun"]; };

function Profile({ c, onClose }: { c: Contact; onClose: () => void }) {
  const { data } = useCrm();
  const linked = data.data_extensions.filter((d) => d.link);
  const sent = data.emails.filter((e) => e.contact_id === c.id).length, msgs = data.messages.filter((m) => m.contact_id === c.id).length;
  const Row = (l: string, v: React.ReactNode) => <div className="flex justify-between gap-4 border-b border-line py-1.5 text-[13.5px] last:border-0"><dt className="text-muted">{l}</dt><dd className="text-right font-medium text-ink">{v || "–"}</dd></div>;
  return (
    <Modal title={c.name} onClose={onClose} wide>
      <div className="space-y-5">
        <section><h3 className="mb-1.5 text-[13px] font-semibold text-muted">System attributes</h3>
          <dl className="rounded-lg border border-line px-3">{Row("Contact key", <code className="text-[12.5px]">{c.id}</code>)}{Row("Email address", c.email)}{Row("Mobile number", c.phone)}{Row("Company", c.company)}{Row("Owner", c.owner)}{Row("Source", c.source)}{Row("Created", timeAgo(c.created_at))}</dl></section>
        <section><h3 className="mb-1.5 text-[13px] font-semibold text-muted">Channels</h3>
          <dl className="rounded-lg border border-line px-3">{Row("Email", <Badge tone={stat(c)[1]}>{stat(c)[0]}</Badge>)}{Row("SMS", c.phone ? <Badge tone={c.sms_opt_out ? "rose" : "green"}>{c.sms_opt_out ? "Opted out (STOP)" : "Reachable"}</Badge> : <Badge>No number</Badge>)}{Row("Emails sent", String(sent))}{Row("SMS and WhatsApp messages", String(msgs))}{Row("Lists", c.tags.length ? <span className="flex flex-wrap justify-end gap-1">{c.tags.map((t) => <Badge key={t} tone="teal">{t}</Badge>)}</span> : "")}</dl></section>
        {linked.map((d) => { const rows = rowsFor(d, data.de_rows, c); return (
          <section key={d.id}><h3 className="mb-1.5 flex items-center justify-between text-[13px] font-semibold text-muted"><span>{d.name} <span className="font-normal">· {rows.length} record{rows.length === 1 ? "" : "s"}</span></span><Link href={`/audience/de/${d.id}`} className="font-semibold text-teal-d hover:underline">Open</Link></h3>
            {rows.length === 0 ? <p className="rounded-lg border border-dashed border-line px-3 py-2 text-[13px] text-muted">No records match this contact&apos;s {d.link!.to === "id" ? "contact key" : d.link!.to}.</p> : (
              <div className="overflow-x-auto rounded-lg border border-line"><table className="w-full text-[13px]"><thead className="bg-[#f8f9fc] text-left text-muted"><tr>{d.fields.map((f) => <th key={f.name} className="px-3 py-1.5 font-semibold">{f.name}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.slice(0, 20).map((r) => <tr key={r.id}>{d.fields.map((f) => <td key={f.name} className="whitespace-nowrap px-3 py-1.5">{r.data[f.name] || "–"}</td>)}</tr>)}</tbody></table></div>
            )}</section>); })}
        <div className="flex justify-end"><Link href={`/contacts/${c.id}`}><Button variant="soft">Open in CRM</Button></Link></div>
      </div>
    </Modal>
  );
}

function Inner() {
  const { data, can } = useCrm();
  const router = useRouter();
  const p = useSearchParams().get("tab");
  const tab: Tab = p === "designer" || p === "extensions" || p === "subscribers" ? p : "contacts";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<Contact | null>(null);
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<DataExtension | null>(null);
  const [page, setPage] = useState(0);
  const PER = 25;

  const counts = useMemo(() => new Map(data.data_extensions.map((d) => [d.id, data.de_rows.filter((r) => r.de_id === d.id).length])), [data.data_extensions, data.de_rows]);
  const contacts = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.contacts.filter((c) => (!status || stat(c)[0] === status) && (!s || [c.name, c.email, c.phone, c.id].some((v) => v.toLowerCase().includes(s)))).sort((a, b) => a.name.localeCompare(b.name));
  }, [data.contacts, q, status]);
  const des = data.data_extensions.filter((d) => !q.trim() || [d.name, d.external_key, d.folder].some((v) => v.toLowerCase().includes(q.trim().toLowerCase())));
  const linked = data.data_extensions.filter((d) => d.link);
  const shown = contacts.slice(page * PER, page * PER + PER);

  return (
    <div>
      <PageHeader title="Contact Builder" sub="One view of every contact, the data linked to them, and your data extensions."
        action={can("write") ? <Button icon="plus" onClick={() => setCreate(true)}>Create data extension</Button> : undefined} />
      <div className="mb-4 flex gap-1 border-b border-line" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setQ(""); setPage(0); router.replace(`/audience?tab=${k}`); }} className={`pill -mb-px border-b-2 px-3 py-2 text-[13.5px] font-semibold ${tab === k ? "border-teal-d text-teal-d" : "border-transparent text-muted hover:text-ink"}`}>{l} <span className="font-normal opacity-70">{k === "contacts" ? data.contacts.length : k === "subscribers" ? data.contacts.filter((c) => c.email).length : k === "extensions" ? data.data_extensions.length : linked.length}</span></button>)}
        <Link href="/marketing/lists" className="pill -mb-px ml-auto border-b-2 border-transparent px-3 py-2 text-[13.5px] font-semibold text-muted hover:text-ink">Lists and segments</Link>
      </div>

      {tab === "subscribers" && <Subscribers />}
      {tab !== "designer" && tab !== "subscribers" && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field !pl-9" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={tab === "contacts" ? "Search name, email, phone or contact key" : "Search data extensions"} aria-label="Search" /></div>
          {tab === "contacts" && <select className="field !w-auto" aria-label="Email status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}><option value="">Any email status</option><option>Active</option><option>Unsubscribed</option><option>Bounced</option><option>Spam complaint</option><option>No email</option></select>}
          <span className="ml-auto text-[13px] text-muted">{tab === "contacts" ? `${contacts.length} contacts` : `${des.length} data extensions`}</span>
        </div>
      )}

      {tab === "contacts" && (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-line bg-[#f8f9fc] text-left text-muted"><tr><th className="px-5 py-2.5 font-semibold">Contact</th><th className="px-3 py-2.5 font-semibold">Email address</th><th className="px-3 py-2.5 font-semibold">Mobile</th><th className="px-3 py-2.5 font-semibold">Email status</th><th className="px-3 py-2.5 font-semibold">SMS</th><th className="px-3 py-2.5 font-semibold">Lists</th><th className="px-5 py-2.5 text-right font-semibold">Linked records</th></tr></thead>
            <tbody className="divide-y divide-line">
              {shown.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted">No contacts match.</td></tr>}
              {shown.map((c) => { const n = linked.reduce((a, d) => a + rowsFor(d, data.de_rows, c).length, 0); return (
                <tr key={c.id} className="cursor-pointer hover:bg-cloud/70" onClick={() => setOpen(c)}>
                  <td className="px-5 py-2"><span className="flex items-center gap-2.5"><Avatar name={c.name} size="size-7 text-[11px]" /><span className="font-semibold text-ink">{c.name}</span></span></td>
                  <td className="px-3 py-2">{c.email || <span className="text-muted">–</span>}</td><td className="px-3 py-2">{c.phone || <span className="text-muted">–</span>}</td>
                  <td className="px-3 py-2"><Badge tone={stat(c)[1]}>{stat(c)[0]}</Badge></td>
                  <td className="px-3 py-2">{c.phone ? <Badge tone={c.sms_opt_out ? "rose" : "green"}>{c.sms_opt_out ? "Opted out" : "Reachable"}</Badge> : <span className="text-muted">–</span>}</td>
                  <td className="px-3 py-2"><span className="flex flex-wrap gap-1">{c.tags.slice(0, 2).map((t) => <Badge key={t} tone="teal">{t}</Badge>)}{c.tags.length > 2 && <span className="text-[12px] text-muted">+{c.tags.length - 2}</span>}</span></td>
                  <td className="px-5 py-2 text-right">{n || <span className="text-muted">–</span>}</td>
                </tr>); })}
            </tbody>
          </table></div>
          {contacts.length > PER && <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[13px] text-muted"><span>{page * PER + 1}–{Math.min(contacts.length, page * PER + PER)} of {contacts.length}</span><span className="flex gap-2"><Button size="sm" variant="soft" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="soft" disabled={(page + 1) * PER >= contacts.length} onClick={() => setPage(page + 1)}>Next</Button></span></div>}
        </Card>
      )}

      {tab === "designer" && (
        <div className="space-y-4">
          <p className="max-w-3xl text-[13.5px] text-muted">Data Designer shows how your data extensions relate to a contact. Link a data extension on one of its fields, and its records appear on each matching contact&apos;s profile.</p>
          <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
            <Card className="!border-teal !bg-teal-t/40"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-teal-d text-white"><Icon name="users" className="size-5" /></span><div><div className="text-[15px] font-semibold text-ink">Contact</div><div className="text-[12.5px] text-muted">{data.contacts.length} records</div></div></div>
              <ul className="mt-3 space-y-1 text-[13px]">{["Contact key", "Email address", "Mobile number", "Name", "Company", "Owner", "Lists", "Email status", "SMS status"].map((a) => <li key={a} className="flex items-center gap-2 text-body"><span className="size-1.5 rounded-full bg-teal" />{a}</li>)}</ul></Card>
            <div className="space-y-3">
              {data.data_extensions.length === 0 && <Card><Empty icon="layers" title="No data extensions yet" text="Create one, then link it to contacts here." action={<Button onClick={() => setCreate(true)}>Create data extension</Button>} /></Card>}
              {data.data_extensions.map((d) => (
                <Card key={d.id} className="!p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`h-px w-8 ${d.link ? "bg-teal" : "border-t border-dashed border-[#b9c2d6]"}`} />
                    <div className="min-w-0 flex-1"><Link href={`/audience/de/${d.id}`} className="text-[14.5px] font-semibold text-ink hover:text-teal-d">{d.name}</Link>
                      <div className="text-[13px] text-muted">{d.link ? <>Many records to one contact, on <strong className="text-ink">{d.name}.{d.link.field}</strong> = <strong className="text-ink">Contact.{d.link.to === "id" ? "Contact key" : d.link.to === "email" ? "Email address" : "Mobile number"}</strong></> : "Not linked to contacts"}</div></div>
                    <span className="text-[13px] text-muted">{counts.get(d.id) ?? 0} records</span>
                    {d.link ? <Badge tone="teal">Linked</Badge> : <Badge>Unlinked</Badge>}
                    {can("write") && <Button size="sm" variant="soft" onClick={() => setEdit(d)}>{d.link ? "Edit link" : "Link to contact"}</Button>}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "extensions" && (des.length === 0 ? (
        <Card><Empty icon="layers" title={q ? "No data extensions match" : "No data extensions yet"} text="Store appointments, orders, sign-ups or any other data you want to use in your marketing." action={can("write") && !q ? <Button onClick={() => setCreate(true)}>Create data extension</Button> : undefined} /></Card>
      ) : (
        <Card className="!p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-line bg-[#f8f9fc] text-left text-muted"><tr><th className="px-5 py-2.5 font-semibold">Name</th><th className="px-3 py-2.5 font-semibold">External key</th><th className="px-3 py-2.5 font-semibold">Folder</th><th className="px-3 py-2.5 font-semibold">Fields</th><th className="px-3 py-2.5 text-right font-semibold">Records</th><th className="px-3 py-2.5 font-semibold">Type</th><th className="px-5 py-2.5 text-right font-semibold">Created</th></tr></thead>
          <tbody className="divide-y divide-line">{des.map((d) => (
            <tr key={d.id} className="cursor-pointer hover:bg-cloud/70" onClick={() => router.push(`/audience/de/${d.id}`)}>
              <td className="px-5 py-2.5"><span className="font-semibold text-ink">{d.name}</span>{d.description && <span className="block max-w-[320px] truncate text-[12.5px] text-muted">{d.description}</span>}</td>
              <td className="px-3 py-2.5"><code className="text-[12.5px]">{d.external_key}</code></td><td className="px-3 py-2.5">{d.folder || <span className="text-muted">–</span>}</td>
              <td className="px-3 py-2.5" title={d.fields.map((f) => `${f.name} (${typeLabel(f.type)})`).join(", ")}>{d.fields.length}</td>
              <td className="px-3 py-2.5 text-right font-semibold text-ink">{(counts.get(d.id) ?? 0).toLocaleString()}</td>
              <td className="px-3 py-2.5">{d.sendable ? <Badge tone="green">Sendable</Badge> : <Badge>Standard</Badge>}</td>
              <td className="px-5 py-2.5 text-right text-[13px] text-muted">{timeAgo(d.created_at)}</td>
            </tr>))}</tbody>
        </table></div></Card>
      ))}

      {open && <Profile c={open} onClose={() => setOpen(null)} />}
      {create && <DeBuilder onClose={() => setCreate(false)} onSaved={(d) => router.push(`/audience/de/${d.id}`)} />}
      {edit && <DeBuilder de={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
export default function ContactBuilderPage() { return <Suspense><Inner /></Suspense>; }
