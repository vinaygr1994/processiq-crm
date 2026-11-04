"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { AddTaskModal } from "@/components/forms";
import { EmailComposer } from "@/components/EmailComposer";
import { AiButton, Avatar, Badge, Button, Card, ConfirmModal, Empty } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { useFlow } from "@/lib/flow";
import { aiSummarize } from "@/lib/ai";
import { dueLabel, isEmail, money, timeAgo, todayStr } from "@/lib/format";
import { stageLabel } from "@/lib/stages";
import type { ActivityKind, Contact } from "@/lib/types";

const KINDS: { id: ActivityKind; label: string; icon: string }[] = [
  { id: "note", label: "Note", icon: "note" },
  { id: "call", label: "Call", icon: "phone" },
  { id: "meeting", label: "Meeting", icon: "calendar" },
];

export default function ContactPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, update, remove, removeMany, toast } = useCrm();
  const flow = useFlow();
  const contact = data.contacts.find((c) => c.id === id);
  const [modal, setModal] = useState<"email" | "task" | "delete" | null>(null);
  const [kind, setKind] = useState<ActivityKind>("note");
  const [text, setText] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [ai, setAi] = useState<{ summary: string; next_step: string; live: boolean } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [err, setErr] = useState("");

  const timeline = useMemo(() => {
    const a = data.activities.filter((x) => x.contact_id === id).map((x) => ({ key: x.id, at: x.created_at, kind: x.kind as string, title: "", body: x.body }));
    const e = data.emails.filter((x) => x.contact_id === id).map((x) => ({ key: x.id, at: x.created_at, kind: x.status === "failed" ? "email-failed" : "email", title: x.subject, body: x.body }));
    return [...a, ...e].sort((x, y) => y.at.localeCompare(x.at));
  }, [data.activities, data.emails, id]);
  const tasks = data.tasks.filter((t) => t.contact_id === id);
  const deals = data.deals.filter((d) => d.contact_id === id);

  if (!contact) {
    return <div className="rounded-3xl border border-line bg-white"><Empty icon="users" title="Contact not found" text="They may have been deleted." action={<Link href="/contacts"><Button>Back to contacts</Button></Link>} /></div>;
  }

  const save = (patch: Partial<Contact>) => update("contacts", contact.id, patch);
  const blur = (k: "name" | "email" | "phone" | "company") => (e: React.FocusEvent<HTMLInputElement>) => {
    const v = e.target.value.trim();
    if (v === contact[k]) return;
    if (k === "name" && !v) { e.target.value = contact.name; return; }
    if (k === "email" && v && !isEmail(v)) { toast("That email address doesn't look right", "error"); e.target.value = contact.email; return; }
    save({ [k]: v });
  };
  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !contact.tags.includes(t)) save({ tags: [...contact.tags, t] });
    setTagInput("");
  };

  async function logActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await flow.logActivity(contact!.id, kind, text.trim());
    setText("");
  }
  async function summarize() {
    setErr(""); setAiBusy(true);
    try {
      const r = await aiSummarize({
        contact: { name: contact!.name, company: contact!.company, tags: contact!.tags },
        activities: data.activities.filter((a) => a.contact_id === id).slice(0, 12).map((a) => ({ kind: a.kind, body: a.body, when: timeAgo(a.created_at) })),
        deals: deals.map((d) => ({ title: d.project || d.title, value: d.value, stage: stageLabel(d.stage) })),
        tasks: tasks.slice(0, 8).map((t) => ({ title: t.title, due: t.due_date, done: t.done })),
      });
      setAi({ ...r.result, live: r.live });
    } catch (e) { setErr((e as Error).message); }
    setAiBusy(false);
  }

  const today = todayStr();
  return (
    <div>
      <Link href="/contacts" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><Icon name="back" className="size-4" /> All contacts</Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={contact.name} size="size-14 text-lg" />
          <div>
            <h1 className="text-[1.75rem] font-semibold leading-tight">{contact.name}</h1>
            <p className="text-muted">{[contact.company, contact.email].filter(Boolean).join(" · ") || "No details yet"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon="send" onClick={() => (contact.email ? setModal("email") : toast("Add an email address first", "error"))}>Email</Button>
          <Button variant="soft" icon="check" onClick={() => setModal("task")}>Task</Button>
          
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Details</h2>
            <div className="space-y-3.5">
              {([["name", "Name", "text"], ["email", "Email", "email"], ["phone", "Phone", "tel"], ["company", "Company", "text"]] as const).map(([k, l, t]) => (
                <label key={k} className="block"><span className="mb-1 block text-[13px] font-semibold text-muted">{l}</span>
                  <input key={contact[k]} className="field" type={t} defaultValue={contact[k]} onBlur={blur(k)} /></label>
              ))}
              <div>
                <span className="mb-1.5 block text-[13px] font-semibold text-muted">Tags</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {contact.tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-teal-t py-1 pl-3 pr-1.5 text-sm font-semibold text-teal-d">{t}
                      <button onClick={() => save({ tags: contact.tags.filter((x) => x !== t) })} className="grid size-5 place-items-center rounded-full hover:bg-white/70" aria-label={`Remove tag ${t}`}><Icon name="x" className="size-3.5" /></button></span>
                  ))}
                  <input className="w-28 rounded-full border border-dashed border-[#cfd6e6] bg-transparent px-3 py-1 text-sm focus:border-teal focus:outline-none" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === ",") && (e.preventDefault(), addTag())} onBlur={addTag} placeholder="+ add tag" aria-label="Add tag" />
                </div>
              </div>
              <label className="flex items-center gap-2.5 pt-1 text-sm">
                <input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={contact.unsubscribed} onChange={(e) => save({ unsubscribed: e.target.checked })} />
                Don&apos;t send them marketing emails
              </label>
              <div className="text-[13px] text-muted">Added {timeAgo(contact.created_at)}{contact.source ? ` · ${contact.source}` : ""}</div>
            </div>
          </Card>

          <Card>
            <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold">Tasks</h2><button onClick={() => setModal("task")} className="text-sm font-semibold text-teal-d hover:underline">+ Add</button></div>
            {tasks.length === 0 ? <p className="text-muted">No tasks yet.</p> : (
              <ul className="divide-y divide-line">
                {[...tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.due_date ?? "9").localeCompare(b.due_date ?? "9")).map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <button onClick={() => update("tasks", t.id, { done: !t.done })} aria-label={t.done ? "Mark not done" : "Mark done"}
                      className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition ${t.done ? "border-teal bg-teal text-white" : "border-[#cfd6e6] text-transparent hover:border-teal hover:text-teal"}`}><Icon name="check" className="size-3.5" /></button>
                    <span className={`min-w-0 flex-1 truncate ${t.done ? "text-muted line-through" : "font-medium text-ink"}`}>{t.title}</span>
                    {!t.done && <span className={`text-[13px] font-semibold ${t.due_date && t.due_date < today ? "text-rose" : "text-muted"}`}>{dueLabel(t.due_date)}</span>}
                    <button onClick={() => remove("tasks", t.id)} className="text-[#b3bdd2] hover:text-rose" aria-label="Delete task"><Icon name="trash" className="size-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold">Jobs</h2></div>
            {deals.length === 0 ? <p className="text-muted">No jobs with {contact.name.split(" ")[0]} yet. Add a new lead from the + button.</p> : (
              <ul className="space-y-2">{deals.map((d) => (
                <li key={d.id}><Link href={`/pipeline?deal=${d.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 hover:bg-cloud">
                  <span className="min-w-0"><span className="block truncate font-semibold text-ink">{d.project || d.title}</span><span className="text-[13px] text-muted">{d.value ? money(d.value) : d.budget}</span></span>
                  <Badge tone={d.stage === "won" ? "green" : d.stage === "lost" ? "gray" : "iris"}>{stageLabel(d.stage)}</Badge></Link></li>
              ))}</ul>
            )}
          </Card>
          <Button variant="danger" size="sm" icon="trash" onClick={() => setModal("delete")}>Delete contact</Button>
        </div>

        <div className="space-y-6 lg:col-span-3">
          <Card className="!border-transparent bg-gradient-to-br from-white to-iris-t/50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Icon name="sparkle" className="size-5 text-iris" /><h2 className="text-lg font-semibold">AI summary</h2></div>
              <AiButton onClick={summarize} busy={aiBusy}>{ai ? "Refresh" : "Summarise & suggest next step"}</AiButton>
            </div>
            {ai && (
              <div className="mt-4 space-y-3">
                <p className="text-ink">{ai.summary}</p>
                <div className="rounded-2xl bg-white px-4 py-3"><div className="text-xs font-bold uppercase tracking-wider text-iris">Suggested next step</div><p className="mt-0.5 font-medium text-ink">{ai.next_step}</p></div>
                {!ai.live && <p className="text-[13px] text-muted">Sample output. Add an Anthropic API key to get real summaries.</p>}
              </div>
            )}
            {err && <p role="alert" className="mt-3 text-sm font-medium text-rose">{err}</p>}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold">Activity</h2>
            <form onSubmit={logActivity} className="mb-5">
              <div className="mb-2 flex gap-1.5" role="tablist">
                {KINDS.map((k) => (
                  <button key={k.id} type="button" role="tab" aria-selected={kind === k.id} onClick={() => setKind(k.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${kind === k.id ? "bg-ink text-white" : "bg-cloud text-body hover:bg-[#e9edf6]"}`}><Icon name={k.icon} className="size-4" />{k.label}</button>
                ))}
              </div>
              <textarea className="field !min-h-[84px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "note" ? "Write a note…" : kind === "call" ? "What did you talk about?" : "What was discussed?"} aria-label="Activity details" />
              <div className="mt-2 flex justify-end"><Button type="submit" size="sm" disabled={!text.trim()}>Save {kind}</Button></div>
            </form>
            {timeline.length === 0 ? <p className="py-4 text-center text-muted">Nothing logged yet. Notes, calls and emails will show up here.</p> : (
              <ol className="space-y-4">
                {timeline.map((t) => {
                  const mail = t.kind.startsWith("email");
                  const icon = mail ? "mail" : t.kind === "call" ? "phone" : t.kind === "meeting" ? "calendar" : "note";
                  return (
                    <li key={t.key} className="flex gap-3">
                      <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${mail ? "bg-iris-t text-iris" : "bg-teal-t text-teal-d"}`}><Icon name={icon} className="size-[18px]" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                          <span className="font-semibold capitalize text-ink">{t.kind === "email" ? "Email sent" : t.kind === "email-failed" ? "Email failed" : t.kind}</span>
                          <span>{timeAgo(t.at)}</span>
                        </div>
                        {t.title && <div className="font-semibold text-ink">{t.title}</div>}
                        <p className="line-clamp-4 whitespace-pre-wrap">{t.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>
      </div>

      {modal === "email" && <EmailComposer contact={contact} onClose={() => setModal(null)} />}
      {modal === "task" && <AddTaskModal contactId={contact.id} onClose={() => setModal(null)} />}
      {modal === "delete" && (
        <ConfirmModal title={`Delete ${contact.name}?`} text="This removes the contact and their notes. This can't be undone." onClose={() => setModal(null)}
          onConfirm={async () => {
            await removeMany("activities", data.activities.filter((a) => a.contact_id === contact.id).map((a) => a.id));
            await remove("contacts", contact.id);
            toast("Contact deleted");
            router.replace("/contacts");
          }} />
      )}
    </div>
  );
}
