"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "./Icon";
import { Avatar, Badge, Button, ConfirmModal, Field, Modal } from "./ui";
import { RelatedRecords } from "./RecordModal";
import { BookVisitModal, LostModal, QuoteModal, VisitResultModal } from "./flowModals";
import { useCrm } from "@/lib/store";
import { useFlow } from "@/lib/flow";
import { downloadIcs } from "@/lib/ics";
import { money, timeAgo } from "@/lib/format";
import { useStages } from "@/lib/useStages";
import { PRIORITIES, columnOf, interestsOf, pipelineOf, wonStage, type PStage } from "@/lib/pipelines";
import { SOURCES } from "@/lib/stages";
import { CustomFields } from "./CustomFields";
import type { Visit } from "@/lib/types";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const toneOf = { info: "bg-teal-t text-teal-d", warn: "bg-sun-t text-[#9a5a00]", won: "bg-emerald-50 text-emerald-700", skip: "bg-cloud text-muted" } as const;

export function DealModal({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const { data, settings, update, remove, removeMany, add, toast, can, team } = useCrm();
  const flow = useFlow();
  const { pipelines } = useStages();
  const deal = data.deals.find((d) => d.id === dealId);
  const [sub, setSub] = useState<"visit" | "result" | "quote" | "lost" | "delete" | null>(null);
  const [resultFor, setResultFor] = useState<Visit | null>(null);
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState("");
  const [f, setF] = useState({ title: "", value: "", close_date: "", rep: "", priority: "", project: "", source: "", address: "", pipeline: "" });
  if (!deal) return null;

  const pipe = pipelineOf(deal, pipelines);
  const stage = columnOf(deal, pipelines);
  const contact = data.contacts.find((c) => c.id === deal.contact_id);
  const visits = data.visits.filter((v) => v.deal_id === deal.id).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const nextMeeting = visits.find((v) => v.status === "scheduled");
  const log = data.autolog.filter((l) => l.deal_id === deal.id && l.tone !== "skip").map((l) => ({ id: l.id, at: l.created_at, kind: l.kind, text: l.message, tone: l.tone }));
  const acts = contact ? data.activities.filter((a) => a.contact_id === contact.id).map((a) => ({ id: a.id, at: a.created_at, kind: a.kind[0].toUpperCase() + a.kind.slice(1), text: a.body, tone: "skip" as const })) : [];
  const timeline = [...log, ...acts].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  const closed = stage.kind !== "open";
  const prio = PRIORITIES.find((p) => p.id === deal.priority);
  const overdue = deal.close_date && !closed && deal.close_date < new Date().toISOString().slice(0, 10);

  function moveTo(to: PStage) {
    if (to.id === stage.id) return;
    if (to.kind === "lost") return setSub("lost");
    if (to.kind === "won") return void (to.id === "completed" ? flow.complete(deal!) : flow.markWon(deal!, undefined, to.id));
    if (to.id === "visit_booked") return setSub("visit");
    if (to.id === "quoted") return setSub("quote");
    void flow.moveSimple(deal!, to.id);
  }
  function startEdit() {
    setF({ title: deal!.title, value: String(deal!.value || ""), close_date: deal!.close_date ?? "", rep: deal!.rep, priority: deal!.priority ?? "", project: deal!.project, source: deal!.source, address: deal!.address, pipeline: pipe.id });
    setEdit(true);
  }
  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    const np = pipelines.find((p) => p.id === f.pipeline) ?? pipe;
    const patch: Record<string, unknown> = { title: f.title.trim() || deal!.title, value: Number(f.value.replace(/[^0-9.]/g, "")) || 0, close_date: f.close_date || null, rep: f.rep.trim(), priority: f.priority, project: f.project.trim(), source: f.source, address: f.address.trim(), pipeline: np.id };
    if (np.id !== pipe.id && !np.stages.some((s) => s.id === deal!.stage)) patch.stage = np.stages[0].id;
    await update("deals", deal!.id, patch);
    setEdit(false); toast("Deal updated");
  }
  async function addNote() {
    if (!note.trim() || !contact) return;
    await add("activities", { contact_id: contact.id, kind: "note", body: `${deal!.title}: ${note.trim()}` });
    setNote(""); toast("Note added");
  }

  const openStages = pipe.stages.filter((s) => s.kind === "open");
  const idx = openStages.findIndex((s) => s.id === stage.id);
  const stat = (label: string, value: React.ReactNode) => <div className="min-w-0"><div className="text-[12.5px] font-medium text-muted">{label}</div><div className="truncate font-semibold text-ink">{value}</div></div>;

  return (
    <>
      <Modal title={deal.title} onClose={onClose} wide="xl">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={stage.kind === "won" ? "green" : stage.kind === "lost" ? "gray" : "iris"}>{stage.label}</Badge>
            {prio && <Badge tone={prio.tone}>{prio.label} priority</Badge>}
            {stage.kind === "lost" && deal.lost_reason && <Badge tone="gray">{deal.lost_reason}</Badge>}
            <span className="text-sm text-muted">{pipe.name} · in this stage {timeAgo(deal.stage_at).replace(" ago", "")}</span>
          </div>

          <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Stages">
            {openStages.map((s, i) => {
              const done = closed ? stage.kind === "won" : i < idx, cur = !closed && i === idx;
              return (
                <li key={s.id} className="min-w-[90px] flex-1">
                  <button type="button" onClick={() => moveTo(s)} title={`Move to ${s.label}`} className="w-full text-left">
                    <div className={`h-2 rounded-full transition ${cur ? "bg-gradient-to-r from-teal to-iris" : done ? "bg-teal" : "bg-line hover:bg-[#cfd6e6]"}`} />
                    <div className={`mt-1.5 truncate text-[12px] font-semibold ${cur ? "text-ink" : "text-muted"}`}>{s.label}</div>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="grid gap-4 rounded-2xl border border-line bg-[#f8f9fc] p-4 sm:grid-cols-4">
            {stat("Amount", deal.value ? money(deal.value) : "–")}
            {stat("Close date", deal.close_date ? <span className={overdue ? "text-rose" : ""}>{new Date(deal.close_date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}{overdue ? " (overdue)" : ""}</span> : "–")}
            {stat("Owner", deal.rep ? <span className="inline-flex items-center gap-1.5"><Avatar name={deal.rep} size="size-5 text-[9px]" />{deal.rep}</span> : "Unassigned")}
            {stat("Win probability", `${stage.prob}%`)}
          </div>

          <div className="flex flex-wrap gap-2">
            {!closed && <Button size="sm" icon="check" onClick={() => flow.markWon(deal, undefined, wonStage(pipe))}>Mark won</Button>}
            {!closed && <Button size="sm" variant="soft" icon="x" onClick={() => setSub("lost")}>Mark lost</Button>}
            {!closed && <Button size="sm" variant="soft" icon="calendar" onClick={() => setSub("visit")}>{nextMeeting ? "Reschedule meeting" : "Book meeting"}</Button>}
            {nextMeeting && <Button size="sm" variant="soft" icon="note" onClick={() => { setResultFor(nextMeeting); setSub("result"); }}>Log meeting notes</Button>}
            {!closed && <Button size="sm" variant="soft" icon="send" onClick={() => setSub("quote")}>Proposal amount</Button>}
            {closed && <Button size="sm" variant="soft" icon="back" onClick={() => flow.moveSimple(deal, openStages[Math.min(1, openStages.length - 1)].id)}>Reopen</Button>}
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="space-y-5">
              <section>
                <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-ink">About this deal</h3>{!edit && <button className="text-sm font-semibold text-teal-d hover:underline" onClick={startEdit}>Edit</button>}</div>
                {edit ? (
                  <form className="space-y-3 rounded-2xl border border-line p-4" onSubmit={saveEdit}>
                    <Field label="Deal name"><input className="field" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Amount"><input className="field" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
                      <Field label="Close date"><input type="date" className="field" value={f.close_date} onChange={(e) => setF({ ...f, close_date: e.target.value })} /></Field>
                      <Field label="Owner"><select className="field" value={f.rep} disabled={!can("assign")} onChange={(e) => setF({ ...f, rep: e.target.value })}><option value="">Unassigned</option>{[...new Set([...team, f.rep].filter(Boolean))].map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
                      <Field label="Priority"><select className="field" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="">None</option>{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
                      <Field label="Interested in"><input className="field" list="deal-int" value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })} /><datalist id="deal-int">{interestsOf(settings).map((i) => <option key={i} value={i} />)}</datalist></Field>
                      <Field label="Source"><select className="field" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{[...new Set([f.source, ...SOURCES])].filter(Boolean).map((s) => <option key={s}>{s}</option>)}</select></Field>
                      <Field label="Location"><input className="field" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
                      {pipelines.length > 1 && <Field label="Pipeline"><select className="field" value={f.pipeline} onChange={(e) => setF({ ...f, pipeline: e.target.value })}>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
                    </div>
                    <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="soft" onClick={() => setEdit(false)}>Cancel</Button><Button type="submit" size="sm">Save</Button></div>
                  </form>
                ) : (
                  <dl className="divide-y divide-line rounded-2xl border border-line text-sm">
                    {[["Interested in", deal.project], ["Source", deal.source], ["Location", deal.address], ["Created", new Date(deal.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })]].map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[120px_1fr] gap-2 px-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="min-w-0 break-words font-medium text-ink">{v || "–"}</dd></div>
                    ))}
                  </dl>
                )}
              </section>
              <CustomFields on="deal" record={deal} compact />
              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">Contact</h3>
                {contact ? (
                  <Link href={`/contacts/${contact.id}`} className="flex items-center gap-3 rounded-2xl border border-line p-3 hover:bg-cloud">
                    <Avatar name={contact.name} />
                    <span className="min-w-0"><span className="block font-semibold text-ink">{contact.name}</span><span className="block truncate text-[13px] text-muted">{[contact.company, contact.email, contact.phone].filter(Boolean).join(" · ")}</span></span>
                  </Link>
                ) : <p className="text-sm text-muted">No contact linked.</p>}
              </section>
              <RelatedRecords dealId={deal.id} />
              {visits.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-ink">Meetings</h3>
                  <ul className="space-y-2">
                    {visits.map((v) => (
                      <li key={v.id} className="rounded-2xl border border-line px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-ink">{when(v.starts_at)} <span className="font-normal text-muted">· {v.rep}</span></div>
                          <div className="flex items-center gap-2">
                            <Badge tone={v.status === "done" ? "green" : v.status === "no_show" ? "rose" : "sun"}>{v.status === "no_show" ? "No-show" : v.status === "done" ? "Held" : v.status === "cancelled" ? "Cancelled" : "Scheduled"}</Badge>
                            {v.status === "scheduled" && <button className="text-[13px] font-semibold text-teal-d hover:underline" onClick={() => downloadIcs({ id: v.id, start: v.starts_at, summary: `Meeting: ${deal.title}`, location: deal.address, description: contact ? `${contact.name} ${contact.phone}` : "" })}>Add to calendar</button>}
                            {v.status === "scheduled" && <button className="text-[13px] font-semibold text-muted hover:underline" onClick={() => flow.noShow(v)}>No-show</button>}
                          </div>
                        </div>
                        {v.result && <p className="mt-1.5 text-sm">{v.result}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink">Activity</h3>
              {contact && (
                <div className="mb-3 flex gap-2">
                  <input className="field" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} placeholder="Add a note…" aria-label="Add a note" />
                  <Button variant="soft" onClick={addNote} disabled={!note.trim()}>Add</Button>
                </div>
              )}
              {timeline.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
                <ol className="relative space-y-3 border-l-2 border-line pl-4">
                  {timeline.map((l) => (
                    <li key={l.id} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-white bg-teal" />
                      <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${toneOf[l.tone]}`}>{l.kind}</span><span className="text-[12px] text-muted">{timeAgo(l.at)}</span></div>
                      <p className="mt-1 whitespace-pre-wrap text-ink">{l.text}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <div className="flex items-center justify-between border-t border-line pt-4">
            {can("delete") ? <Button size="sm" variant="danger" icon="trash" onClick={() => setSub("delete")}>Delete deal</Button> : <span />}
            {contact?.email && <Link href={`/marketing/send?to=${contact.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-d hover:underline"><Icon name="mail" className="size-4" />Email {contact.name.split(" ")[0]}</Link>}
          </div>
        </div>
      </Modal>
      {sub === "visit" && <BookVisitModal deal={deal} onClose={() => setSub(null)} />}
      {sub === "result" && resultFor && <VisitResultModal visit={resultFor} onClose={() => setSub(null)} />}
      {sub === "quote" && <QuoteModal deal={deal} onClose={() => setSub(null)} />}
      {sub === "lost" && <LostModal deal={deal} onClose={() => setSub(null)} />}
      {sub === "delete" && <ConfirmModal title="Delete this deal?" text="The deal, its meetings and its history are removed. The contact stays in your CRM." onClose={() => setSub(null)}
        onConfirm={async () => { await removeMany("visits", visits.map((v) => v.id)); await removeMany("autolog", log.map((l) => l.id)); await remove("deals", deal.id); onClose(); }} />}
    </>
  );
}
