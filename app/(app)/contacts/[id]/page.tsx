"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { AddTaskModal } from "@/components/forms";
import { EmailComposer } from "@/components/EmailComposer";
import { ContactBookings } from "@/components/ContactBookings";
import { AiButton, Avatar, Badge, Button, ConfirmModal, Empty } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { useFlow } from "@/lib/flow";
import { aiSummarize } from "@/lib/ai";
import { dueLabel, isEmail, money, timeAgo, todayStr } from "@/lib/format";
import { useStages } from "@/lib/useStages";
import { columnOf } from "@/lib/pipelines";
import { CustomFields } from "@/components/CustomFields";
import { RelatedRecords } from "@/components/RecordModal";
import type { ActivityKind, Contact } from "@/lib/types";

const KINDS: { id: ActivityKind; label: string; icon: string }[] = [
  { id: "note", label: "Note", icon: "note" },
  { id: "call", label: "Call", icon: "phone" },
  { id: "meeting", label: "Meeting", icon: "calendar" },
];

export default function ContactPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, update, remove, removeMany, toast, can, team } = useCrm();
  const { name: stageName, pipelines } = useStages();
  const [tab, setTab] = useState<"all" | "notes" | "emails" | "messages" | "calls" | "tasks">("all");
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
    const m = data.messages.filter((x) => x.contact_id === id).map((x) => ({ key: x.id, at: x.created_at, kind: x.channel as string, title: x.direction === "in" ? "Received" : x.status === "failed" ? "Failed to send" : "Sent", body: x.body }));
    return [...a, ...e, ...m].sort((x, y) => y.at.localeCompare(x.at));
  }, [data.activities, data.emails, data.messages, id]);
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
        deals: deals.map((d) => ({ title: d.project || d.title, value: d.value, stage: stageName(d.stage) })),
        tasks: tasks.slice(0, 8).map((t) => ({ title: t.title, due: t.due_date, done: t.done })),
      });
      setAi({ ...r.result, live: r.live });
    } catch (e) { setErr((e as Error).message); }
    setAiBusy(false);
  }

  const today = todayStr();
  const openTasks = tasks.filter((x) => !x.done).length;
  const shown = timeline.filter((x) => tab === "all" || (tab === "notes" ? x.kind === "note" : tab === "emails" ? x.kind.startsWith("email") : tab === "calls" ? x.kind === "call" || x.kind === "meeting" : tab === "messages" ? x.kind === "sms" || x.kind === "whatsapp" : false));
  const compose = (k: ActivityKind) => { setKind(k); setTab("all"); setTimeout(() => document.getElementById("activity-box")?.focus(), 0); };
  const ACTIONS: { label: string; icon: string; run: () => void }[] = [
    { label: "Note", icon: "note", run: () => compose("note") },
    { label: "Email", icon: "mail", run: () => (contact.email ? setModal("email") : toast("Add an email address first", "error")) },
    { label: "Text", icon: "chat", run: () => window.open(`/mobile/inbox?c=${contact.id}`, "_blank", "noopener") },
    { label: "Task", icon: "check", run: () => setModal("task") },
    { label: "Meeting", icon: "calendar", run: () => compose("meeting") },
  ];
  const TABS = [["all", "Activity"], ["notes", "Notes"], ["emails", "Emails"], ["messages", "SMS and WhatsApp"], ["calls", "Calls and meetings"], ["tasks", `Tasks${openTasks ? ` (${openTasks})` : ""}`]] as const;
  const side = "rounded-[10px] border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,.04)]";
  const lbl = "mb-1 block text-[12px] font-semibold text-muted";
  return (
    <div>
      <nav className="mb-3 flex items-center gap-1.5 text-[13px] text-muted" aria-label="Breadcrumb"><Link href="/contacts" className="font-semibold hover:text-ink">Contacts</Link><Icon name="chevron" className="size-3.5" /><span className="text-ink">{contact.name}</span></nav>
      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_320px]">
        <aside className={side} aria-label="About this contact">
          <div className="border-b border-line p-4">
            <div className="flex items-center gap-3">
              <Avatar name={contact.name} size="size-12 text-base" />
              <div className="min-w-0"><h1 className="truncate text-[17px] font-semibold leading-tight">{contact.name}</h1><p className="truncate text-[13px] text-muted">{contact.company || contact.email || "No details yet"}</p></div>
            </div>
            <div className="mt-4 flex justify-between">
              {ACTIONS.map((a) => (
                <button key={a.label} onClick={a.run} className="pill group flex flex-col items-center gap-1 text-[11.5px] font-semibold text-muted hover:text-teal-d">
                  <span className="grid size-9 place-items-center rounded-full border border-[#cdd4e2] bg-white text-body transition group-hover:border-teal group-hover:bg-teal-t group-hover:text-teal-d"><Icon name={a.icon} className="size-4" /></span>{a.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3 p-4">
            <h2 className="text-[13px] font-semibold">About this contact</h2>
            {([["name", "Name", "text"], ["email", "Email", "email"], ["phone", "Phone", "tel"], ["company", "Company", "text"]] as const).map(([k, l, ty]) => (
              <label key={k} className="block"><span className={lbl}>{l}</span>
                <input key={contact[k]} className="field" type={ty} defaultValue={contact[k]} onBlur={blur(k)} /></label>
            ))}
            <label className="block"><span className={lbl}>Contact owner</span>
              <select className="field" value={contact.owner ?? ""} disabled={!can("assign")} onChange={(e) => { save({ owner: e.target.value }); toast(e.target.value ? `Assigned to ${e.target.value}` : "Unassigned"); }}>
                <option value="">Unassigned</option>{[...new Set([...team, contact.owner ?? ""].filter(Boolean))].map((n) => <option key={n}>{n}</option>)}
              </select></label>
            <div>
              <span className={lbl}>Lists and tags</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {contact.tags.map((tg) => (
                  <span key={tg} className="inline-flex items-center gap-1 rounded-[5px] bg-teal-t py-0.5 pl-2 pr-1 text-[12.5px] font-semibold text-teal-d">{tg}
                    <button onClick={() => save({ tags: contact.tags.filter((x) => x !== tg) })} className="grid size-4 place-items-center rounded hover:bg-white/70" aria-label={`Remove tag ${tg}`}><Icon name="x" className="size-3" /></button></span>
                ))}
                <input className="w-24 rounded-[5px] border border-dashed border-[#cfd6e6] bg-transparent px-2 py-0.5 text-[12.5px] focus:border-teal focus:outline-none" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === ",") && (e.preventDefault(), addTag())} onBlur={addTag} placeholder="+ add" aria-label="Add tag" />
              </div>
            </div>
            <CustomFields on="contact" record={contact} />
            <label className="flex items-center gap-2 pt-1 text-[13px]">
              <input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={contact.unsubscribed} onChange={(e) => save({ unsubscribed: e.target.checked })} />
              Unsubscribed from marketing
            </label>
            <dl className="grid grid-cols-2 gap-y-1 border-t border-line pt-3 text-[12.5px]"><dt className="text-muted">Source</dt><dd className="text-right text-ink">{contact.source || "–"}</dd><dt className="text-muted">Created</dt><dd className="text-right text-ink">{timeAgo(contact.created_at)}</dd><dt className="text-muted">Last activity</dt><dd className="text-right text-ink">{timeline[0] ? timeAgo(timeline[0].at) : "–"}</dd></dl>
            {can("delete") && <button onClick={() => setModal("delete")} className="text-[12.5px] font-semibold text-[#c42b52] hover:underline">Delete contact</button>}
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className={`${side} flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>
            <div className="flex items-center gap-2 text-[13.5px] font-semibold text-ink"><Icon name="sparkle" className="size-4 text-iris" />AI summary and next step</div>
            <AiButton onClick={summarize} busy={aiBusy}>{ai ? "Refresh" : "Summarise"}</AiButton>
            {ai && (
              <div className="w-full space-y-2 border-t border-line pt-3 text-[13.5px]">
                <p className="text-ink">{ai.summary}</p>
                <p className="rounded-md bg-iris-t px-3 py-2 text-ink"><span className="font-semibold text-[#4344c9]">Next step: </span>{ai.next_step}</p>
                {!ai.live && <p className="text-[12.5px] text-muted">Sample output. Add an Anthropic API key to get real summaries.</p>}
              </div>
            )}
            {err && <p role="alert" className="w-full text-[13px] font-medium text-[#c42b52]">{err}</p>}
          </div>

          <div className={side}>
            <div className="flex gap-1 overflow-x-auto border-b border-line px-2" role="tablist" aria-label="Timeline">
              {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`pill -mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] font-semibold ${tab === k ? "border-teal-d text-teal-d" : "border-transparent text-muted hover:text-ink"}`}>{l}</button>)}
            </div>
            <div className="p-4">
              {tab === "tasks" ? (
                <>
                  <div className="mb-2 flex justify-end"><Button size="sm" variant="soft" icon="plus" onClick={() => setModal("task")}>Add task</Button></div>
                  {tasks.length === 0 ? <p className="py-6 text-center text-muted">No tasks yet.</p> : (
                    <ul className="divide-y divide-line">
                      {[...tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.due_date ?? "9").localeCompare(b.due_date ?? "9")).map((x) => (
                        <li key={x.id} className="flex items-center gap-3 py-2.5">
                          <button onClick={() => update("tasks", x.id, { done: !x.done })} aria-label={x.done ? "Mark not done" : "Mark done"}
                            className={`pill grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition ${x.done ? "border-teal bg-teal text-white" : "border-[#b9c2d6] text-transparent hover:border-teal hover:text-teal"}`}><Icon name="check" className="size-3" /></button>
                          <span className={`min-w-0 flex-1 truncate ${x.done ? "text-muted line-through" : "font-medium text-ink"}`}>{x.title}</span>
                          {!x.done && <span className={`text-[12.5px] font-semibold ${x.due_date && x.due_date < today ? "text-[#c42b52]" : "text-muted"}`}>{dueLabel(x.due_date)}</span>}
                          <button onClick={() => remove("tasks", x.id)} className="text-[#b3bdd2] hover:text-rose" aria-label="Delete task"><Icon name="trash" className="size-4" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  {tab !== "emails" && tab !== "messages" && (
                    <form onSubmit={logActivity} className="mb-5 rounded-lg border border-line bg-[#f8f9fc] p-3">
                      <div className="mb-2 flex gap-1" role="group" aria-label="Type">
                        {KINDS.map((k) => (
                          <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}
                            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-semibold transition ${kind === k.id ? "bg-ink text-white" : "text-body hover:bg-[#e9edf4]"}`}><Icon name={k.icon} className="size-3.5" />{k.label}</button>
                        ))}
                      </div>
                      <textarea id="activity-box" className="field !min-h-[72px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "note" ? "Write a note…" : kind === "call" ? "What did you talk about?" : "What was discussed?"} aria-label="Activity details" />
                      <div className="mt-2 flex justify-end"><Button type="submit" size="sm" disabled={!text.trim()}>Save {kind}</Button></div>
                    </form>
                  )}
                  {tab === "messages" && <div className="mb-4 flex justify-end"><a href={`/mobile/inbox?c=${contact.id}`} target="_blank" rel="noopener"><Button size="sm" icon="chat">Open conversation</Button></a></div>}
                  {tab === "emails" && <div className="mb-4 flex justify-end"><Button size="sm" icon="send" onClick={() => (contact.email ? setModal("email") : toast("Add an email address first", "error"))}>Write email</Button></div>}
                  {shown.length === 0 ? <p className="py-6 text-center text-muted">Nothing here yet.</p> : (
                    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-line">
                      {shown.map((x) => {
                        const mail = x.kind.startsWith("email");
                        const icon = mail ? "mail" : x.kind === "sms" || x.kind === "whatsapp" ? "chat" : x.kind === "call" ? "phone" : x.kind === "meeting" ? "calendar" : "note";
                        return (
                          <li key={x.key} className="relative flex gap-3">
                            <span className={`pill z-10 grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-white ${x.kind === "email-failed" ? "bg-rose-t text-[#c42b52]" : mail ? "bg-iris-t text-iris" : "bg-teal-t text-teal-d"}`}><Icon name={icon} className="size-4" /></span>
                            <div className="min-w-0 flex-1 rounded-lg border border-line px-3.5 py-2.5">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
                                <span className="font-semibold capitalize text-ink">{x.kind === "email" ? "Email sent" : x.kind === "email-failed" ? "Email failed" : x.kind === "sms" ? "SMS" : x.kind === "whatsapp" ? "WhatsApp" : x.kind}</span>
                                <span>{timeAgo(x.at)}</span>
                              </div>
                              {x.title && <div className="mt-0.5 text-[13.5px] font-semibold text-ink">{x.title}</div>}
                              <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-[13.5px]">{x.body.startsWith("PIQDESIGN:") ? "Designed email" : x.body}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4 lg:col-span-2 xl:col-span-1" aria-label="Related records">
          <section className={`${side} p-4`}>
            <h2 className="mb-2 text-[14.5px] font-semibold">Deals <span className="font-normal text-muted">{deals.length}</span></h2>
            {deals.length === 0 ? <p className="text-[13px] text-muted">No deals with {contact.name.split(" ")[0]} yet.</p> : (
              <ul className="space-y-2">{deals.map((d) => { const st = columnOf(d, pipelines); return (
                <li key={d.id}><Link href={`/pipeline?deal=${d.id}`} className="block rounded-lg border border-line px-3 py-2.5 hover:bg-cloud">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{d.title}</span>
                  <span className="mt-1 flex items-center justify-between gap-2"><span className="text-[13px] text-muted">{d.value ? money(d.value) : "No amount"}</span><Badge tone={st.kind === "won" ? "green" : st.kind === "lost" ? "gray" : "iris"}>{st.label}</Badge></span></Link></li>
              ); })}</ul>
            )}
          </section>
          <ContactBookings contactId={contact.id} />
          <RelatedRecords contactId={contact.id} />
        </aside>
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
