"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, ConfirmModal, Empty, Field, Modal, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { callApi } from "@/lib/api";
import { EmailEditor } from "@/components/EmailEditor";
import { emailVars, parseDesign, plainOf, renderDesign } from "@/lib/emailDesign";
import { fill, timeAgo } from "@/lib/format";
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

function CampaignModal({ onClose }: { onClose: () => void }) {
  const { data, settings, add, update, toast } = useCrm();
  const status = useStatus();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ name: "", subject: "", body: "", audience: "all" });
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const tags = useMemo(() => [...new Set(data.contacts.flatMap((c) => c.tags))].sort(), [data.contacts]);
  const audience = useMemo(
    () => data.contacts.filter((c) => c.email && !c.unsubscribed && (f.audience === "all" || c.tags.includes(f.audience))),
    [data.contacts, f.audience],
  );
  const needsSetup = !settings?.address?.trim() || !settings?.business_name?.trim();

  function next() {
    setErr("");
    const d = parseDesign(f.body);
    if (step === 1 && (!f.subject.trim() || (d ? d.blocks.length === 0 : !f.body.trim()))) return setErr("Please add a subject and a message.");
    if (step === 2 && audience.length === 0) return setErr("No one to send to. Add contacts with email addresses first.");
    setStep(step + 1);
  }
  async function send() {
    if (needsSetup && !status?.demo) return setErr("Add your business name and mailing address in Settings first (required by anti-spam law).");
    setErr("");
    const camp = await add("campaigns", { name: f.name.trim() || f.subject.trim(), subject: f.subject.trim(), body: f.body, audience: f.audience, status: "draft", sent_count: 0, failed_count: 0, sent_at: null });
    if (!camp) return;
    let ok = 0, bad = 0;
    setProgress({ done: 0, total: audience.length });
    const design = parseDesign(f.body);
    for (const c of audience) {
      const text = design ? plainOf(f.body, emailVars(c, settings)) : fill(f.body, c);
      try {
        const r = await callApi<{ status: "sent" | "demo" }>("/api/email/send", { to: c.email, subject: fill(f.subject, c), body: text, design: design ?? undefined, contactId: c.id, marketing: true });
        await add("emails", { contact_id: c.id, to_email: c.email, subject: fill(f.subject, c), body: text, status: r.status, error: "", campaign_id: camp.id });
        ok++;
      } catch (e) {
        await add("emails", { contact_id: c.id, to_email: c.email, subject: fill(f.subject, c), body: text, status: "failed", error: (e as Error).message, campaign_id: camp.id });
        bad++;
      }
      setProgress({ done: ok + bad, total: audience.length });
    }
    await update("campaigns", camp.id, { status: "sent", sent_count: ok, failed_count: bad, sent_at: new Date().toISOString() });
    toast(status?.demo ? `Demo: ${ok} emails saved to history (not really sent)` : `Sent to ${ok} contact${ok === 1 ? "" : "s"}${bad ? `, ${bad} failed` : ""}`);
    onClose();
  }

  return (
    <Modal title="New email campaign" onClose={progress ? () => {} : onClose} wide="xl">
      <ol className="mb-5 flex gap-2 text-sm font-semibold" aria-label="Steps">
        {["Write", "Choose who", "Review & send"].map((l, i) => (
          <li key={l} className={`flex flex-1 items-center gap-2 rounded-full px-3 py-1.5 ${step === i + 1 ? "bg-ink text-white" : step > i + 1 ? "bg-teal-t text-teal-d" : "bg-cloud text-muted"}`}>
            <span className="grid size-5 place-items-center rounded-full bg-white/25 text-xs">{step > i + 1 ? "✓" : i + 1}</span><span className="truncate">{l}</span></li>
        ))}
      </ol>
      {step === 1 && (
        <EmailEditor subject={f.subject} body={f.body} onSubject={(subject) => setF((x) => ({ ...x, subject }))} onBody={(body) => setF((x) => ({ ...x, body }))}
          contact={audience[0] ?? null} aiContact={{ name: "{{first_name}}", company: "{{company}}" }} aiPlaceholder="e.g. Announce our spring offer: 10% off first service" />
      )}
      {step === 2 && (
        <div className="space-y-4">
          <Field label="Who should get this?">
            <select className="field" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
              <option value="all">All contacts</option>{tags.map((t) => <option key={t} value={t}>Tagged “{t}”</option>)}
            </select>
          </Field>
          <div className="rounded-2xl bg-teal-t px-5 py-4 text-teal-d"><div className="font-display text-3xl font-semibold">{audience.length}</div><div className="text-sm font-medium">contact{audience.length === 1 ? "" : "s"} will receive this</div></div>
          <p className="text-sm text-muted">People without an email address, and anyone who unsubscribed, are left out automatically.</p>
          <Field label="Campaign name (just for you)"><input className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={f.subject || "e.g. Spring offer"} /></Field>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-line">
            <div className="border-b border-line px-5 py-3 text-sm"><span className="text-muted">To:</span> <strong>{audience.length}</strong> contact{audience.length === 1 ? "" : "s"}{f.audience !== "all" && <> tagged <Badge tone="teal">{f.audience}</Badge></>}</div>
            <div className="border-b border-line px-5 py-3 text-sm"><span className="text-muted">Subject:</span> <strong className="text-ink">{f.subject}</strong></div>
            {parseDesign(f.body)
              ? <iframe title="Email preview" sandbox="" className="block h-[420px] w-full border-0 bg-cloud" srcDoc={renderDesign(parseDesign(f.body)!, emailVars(audience[0] ?? null, settings), { business: settings?.business_name, address: settings?.address, unsubscribeUrl: "#" }).html} />
              : <p className="whitespace-pre-wrap px-5 py-4 text-sm">{audience[0] ? fill(f.body, audience[0]) : f.body}</p>}
          </div>
          <p className="text-sm text-muted">Each email will include an unsubscribe link and your business address.</p>
          {needsSetup && !status?.demo && <p className="rounded-xl bg-sun-t px-4 py-3 text-sm text-[#7a4700]">Add your business name and mailing address in Settings before sending.</p>}
          {progress && <div role="status" className="rounded-xl bg-cloud px-4 py-3 text-sm font-semibold">Sending… {progress.done} of {progress.total}</div>}
        </div>
      )}
      {err && <p role="alert" className="mt-4 text-sm font-medium text-rose">{err}</p>}
      <div className="mt-6 flex justify-between gap-2">
        <Button variant="soft" onClick={() => (step === 1 ? onClose() : setStep(step - 1))} disabled={!!progress}>{step === 1 ? "Cancel" : "Back"}</Button>
        {step < 3 ? <Button onClick={next}>Continue</Button> : <Button icon="send" onClick={send} disabled={!!progress}>{progress ? "Sending…" : `Send to ${audience.length}`}</Button>}
      </div>
    </Modal>
  );
}

export default function EmailPage() {
  const { data, remove } = useCrm();
  const [tab, setTab] = useState<Tab>("campaigns");
  const [camp, setCamp] = useState(false);
  const [tpl, setTpl] = useState<Template | "new" | null>(null);
  const [del, setDel] = useState<Template | Campaign | null>(null);
  const status = useStatus();
  const contacts = new Map(data.contacts.map((c) => [c.id, c]));
  const tabs: [Tab, string][] = [["campaigns", "Campaigns"], ["templates", "Templates"], ["sent", "Sent emails"]];

  return (
    <div>
      <PageHeader title="Email" sub="Write, send and keep track of every email."
        action={<div className="flex gap-2">{tab === "templates" ? <Button icon="plus" onClick={() => setTpl("new")}>New template</Button> : <Button icon="send" onClick={() => setCamp(true)}>New campaign</Button>}</div>} />
      {status?.demo && <p className="mb-4 rounded-2xl bg-sun-t px-4 py-3 text-sm text-[#7a4700]">Demo mode: emails are saved to history but not actually delivered.</p>}
      {status && !status.demo && !status.email && <p className="mb-4 rounded-2xl bg-sun-t px-4 py-3 text-sm text-[#7a4700]">Email sending isn&apos;t connected yet. See Settings → Email.</p>}
      <div className="mb-5 inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-line" role="tablist">
        {tabs.map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full px-5 py-2 text-sm font-semibold transition ${tab === id ? "bg-ink text-white" : "text-body hover:bg-cloud"}`}>{l}</button>)}
      </div>

      {tab === "campaigns" && (data.campaigns.length === 0 ? (
        <Card><Empty icon="mail" title="Send your first campaign" text="Email a group of contacts at once: an offer, a newsletter, a reminder. The AI can write the first draft for you." action={<Button onClick={() => setCamp(true)}>Create a campaign</Button>} /></Card>
      ) : (
        <Card className="!p-0 overflow-hidden"><ul className="divide-y divide-line">{data.campaigns.map((c) => (
          <li key={c.id} className="flex items-center gap-4 px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-iris-t text-iris"><Icon name="mail" className="size-5" /></span>
            <div className="min-w-0 flex-1"><div className="truncate font-semibold text-ink">{c.name}</div><div className="truncate text-sm text-muted">{c.subject}</div></div>
            <div className="hidden text-right text-sm sm:block"><div className="font-semibold text-ink">{c.sent_count} sent{c.failed_count ? <span className="text-rose"> · {c.failed_count} failed</span> : null}</div><div className="text-muted">{c.sent_at ? timeAgo(c.sent_at) : "Draft"}</div></div>
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
            <div className="mt-auto flex gap-2 pt-4"><Button size="sm" variant="soft" onClick={() => setTpl(t)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setDel(t)}>Delete</Button></div>
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
              <Badge tone={m.status === "sent" ? "green" : m.status === "demo" ? "sun" : "rose"}>{m.status === "demo" ? "Demo" : m.status === "sent" ? "Sent" : "Failed"}</Badge>
              <span className="hidden w-24 text-right text-[13px] text-muted sm:block">{timeAgo(m.created_at)}</span>
            </li>);
        })}</ul></Card>
      ))}

      {camp && <CampaignModal onClose={() => setCamp(false)} />}
      {tpl && <TemplateModal t={tpl === "new" ? undefined : tpl} onClose={() => setTpl(null)} />}
      {del && <ConfirmModal title={`Delete “${del.name}”?`} text="This can't be undone." onClose={() => setDel(null)} onConfirm={() => remove("subject" in del && "audience" in del ? "campaigns" : "templates", del.id)} />}
    </div>
  );
}
