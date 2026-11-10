"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { audienceText } from "@/lib/sendEmail";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, ConfirmModal, Empty, Field, Modal, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { EmailEditor } from "@/components/EmailEditor";
import { parseDesign, plainOf } from "@/lib/emailDesign";
import { timeAgo } from "@/lib/format";
import { useStatus } from "@/lib/status";
import type { Campaign, Template } from "@/lib/types";

type Tab = "campaigns" | "templates" | "sent";

function TemplateModal({ t, onClose }: { t?: Template; onClose: () => void }) {
  const { add, update } = useCrm();
  const [f, setF] = useState({ name: t?.name ?? "", subject: t?.subject ?? "", body: t?.body ?? "" });
  const [err, setErr] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const d = parseDesign(f.body);
    if (!f.name.trim() || !f.subject.trim() || (d ? d.blocks.length === 0 : !f.body.trim())) return setErr("Please fill in the name, subject and message.");
    if (t) await update("templates", t.id, f); else await add("templates", f);
    onClose();
  }
  return (
    <Modal title={t ? "Edit template" : "New template"} onClose={onClose} wide="xl">
      <form onSubmit={save} className="space-y-4">
        <Field label="Template name"><input className="field" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Quote follow-up" /></Field>
        <EmailEditor subject={f.subject} body={f.body} onSubject={(subject) => setF((x) => ({ ...x, subject }))} onBody={(body) => setF((x) => ({ ...x, body }))}
          aiContact={{ name: "{{first_name}}", company: "{{company}}" }} />
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="soft" onClick={onClose}>Cancel</Button><Button type="submit">Save template</Button></div>
      </form>
    </Modal>
  );
}

function EmailPageInner() {
  const { data, remove, update } = useCrm();
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = ["campaigns", "templates", "sent"].includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "campaigns";
  const setTab = (id: Tab) => router.replace(`/emails?tab=${id}`);
  const [tpl, setTpl] = useState<Template | "new" | null>(null);
  const [del, setDel] = useState<Template | Campaign | null>(null);
  const status = useStatus();
  const contacts = new Map(data.contacts.map((c) => [c.id, c]));
  const tabs: [Tab, string][] = [["campaigns", "Sends"], ["templates", "Templates"], ["sent", "Activity"]];

  return (
    <div>
      <PageHeader title="Emails and templates" sub="Every send, your reusable templates and a log of each email."
        action={<div className="flex gap-2"><Button variant="soft" icon="plus" onClick={() => setTpl("new")}>New template</Button><Link href="/marketing/send" className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-white hover:bg-[#1d2a47]"><Icon name="send" className="size-4" />Send email</Link></div>} />
      {status?.demo && <p className="mb-4 rounded-2xl bg-sun-t px-4 py-3 text-sm text-[#7a4700]">Demo mode: emails are saved to history but not actually delivered.</p>}
      {status && !status.demo && !status.email && <p className="mb-4 rounded-2xl bg-sun-t px-4 py-3 text-sm text-[#7a4700]">Email sending isn&apos;t connected yet. See Settings → Email.</p>}
      <div className="mb-4 flex gap-1 border-b border-line" role="tablist">
        {tabs.map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`pill -mb-px border-b-2 px-3 py-2 text-[13.5px] font-semibold ${tab === id ? "border-teal-d text-teal-d" : "border-transparent text-muted hover:text-ink"}`}>{l}</button>)}
      </div>

      {tab === "campaigns" && (data.campaigns.length === 0 ? (
        <Card><Empty icon="mail" title="Send your first email" text="Email one person, a list or everyone: an offer, a newsletter, a reminder. The AI can write the first draft for you." action={<Link href="/marketing/send" className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-white">Send an email</Link>} /></Card>
      ) : (
        <Card className="!p-0 overflow-hidden"><ul className="divide-y divide-line">{data.campaigns.map((c) => (
          <li key={c.id} className="flex items-center gap-4 px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-iris-t text-iris"><Icon name="mail" className="size-5" /></span>
            <div className="min-w-0 flex-1"><div className="truncate font-semibold text-ink">{c.name}</div><div className="truncate text-sm text-muted">{c.subject} · {audienceText(c.audience)}</div></div>
            <div className="hidden text-right text-sm sm:block">{c.status === "scheduled" || c.status === "sending" || c.status === "canceled" ? (<>
              <Badge tone={c.status === "canceled" ? "gray" : "sun"}>{c.status === "scheduled" ? "Scheduled" : c.status === "sending" ? "Sending" : "Canceled"}</Badge>
              {c.scheduled_at && c.status === "scheduled" && <div className="mt-1 text-muted">{new Date(c.scheduled_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>}
            </>) : <><div className="font-semibold text-ink">{c.sent_count} sent{c.failed_count ? <span className="text-rose"> · {c.failed_count} failed</span> : null}</div><div className="text-muted">{(() => { const m = data.emails.filter((e) => e.campaign_id === c.id && e.status === "sent"); const o = m.filter((e) => e.opened_at || e.clicked_at).length, k = m.filter((e) => e.clicked_at).length; return m.length ? `${Math.round((o / m.length) * 100)}% opened · ${Math.round((k / m.length) * 100)}% clicked` : c.sent_at ? timeAgo(c.sent_at) : "Draft"; })()}</div></>}</div>
            {c.status === "scheduled" && <Button size="sm" variant="soft" onClick={() => update("campaigns", c.id, { status: "canceled" })}>Cancel</Button>}
            <button onClick={() => setDel(c)} className="text-[#b3bdd2] hover:text-rose" aria-label="Delete campaign"><Icon name="trash" className="size-[18px]" /></button>
          </li>))}</ul></Card>
      ))}

      {tab === "templates" && (data.templates.length === 0 ? (
        <Card><Empty icon="note" title="No templates yet" text="Save the emails you write again and again, then reuse them in one click." action={<Button onClick={() => setTpl("new")}>Create a template</Button>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">{data.templates.map((t) => (
          <Card key={t.id} className="flex flex-col">
            <h3 className="flex items-center gap-2 font-semibold">{t.name}{parseDesign(t.body) && <Badge tone="iris">Designed</Badge>}</h3><p className="mt-0.5 truncate text-sm font-medium text-ink">{t.subject}</p>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted">{plainOf(t.body, { first_name: "{{first_name}}", first: "{{first_name}}", name: "{{first_name}}" })}</p>
            <div className="mt-auto flex gap-2 pt-4"><Link href={`/marketing/send?template=${t.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-white hover:bg-[#1d2a47]"><Icon name="send" className="size-3.5" />Send</Link><Button size="sm" variant="soft" onClick={() => setTpl(t)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setDel(t)}>Delete</Button></div>
          </Card>))}</div>
      ))}

      {tab === "sent" && (data.emails.length === 0 ? (
        <Card><Empty icon="send" title="Nothing sent yet" text="Every email you send from a contact or a campaign is logged here." /></Card>
      ) : (
        <Card className="!p-0 overflow-hidden"><ul className="divide-y divide-line">{data.emails.slice(0, 100).map((m) => {
          const c = m.contact_id ? contacts.get(m.contact_id) : null;
          return (
            <li key={m.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="min-w-0 flex-1"><div className="truncate font-semibold text-ink">{m.subject}</div><div className="truncate text-sm text-muted">To {c?.name ?? m.to_email}{m.error ? ` · ${m.error}` : ""}</div></div>
              {m.clicked_at ? <Badge tone="iris">Clicked</Badge> : m.opened_at ? <Badge tone="teal">Opened</Badge> : null}
              <Badge tone={m.status === "sent" ? "green" : m.status === "demo" ? "sun" : "rose"}>{m.status === "demo" ? "Demo" : m.status === "sent" ? "Sent" : "Failed"}</Badge>
              <span className="hidden w-24 text-right text-[13px] text-muted sm:block">{timeAgo(m.created_at)}</span>
            </li>);
        })}</ul></Card>
      ))}

      {tpl && <TemplateModal t={tpl === "new" ? undefined : tpl} onClose={() => setTpl(null)} />}
      {del && <ConfirmModal title={`Delete “${del.name}”?`} text="This can't be undone." onClose={() => setDel(null)} onConfirm={() => remove("subject" in del && "audience" in del ? "campaigns" : "templates", del.id)} />}
    </div>
  );
}

export default function EmailPage() {
  return <Suspense fallback={null}><EmailPageInner /></Suspense>;
}
