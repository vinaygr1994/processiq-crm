"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "./Icon";
import { Badge, Button, ConfirmModal, Field, Modal } from "./ui";
import { BookVisitModal, LostModal, QuoteModal, VisitResultModal } from "./flowModals";
import { useCrm } from "@/lib/store";
import { useFlow } from "@/lib/flow";
import { downloadIcs } from "@/lib/ics";
import { money, timeAgo } from "@/lib/format";
import { JOURNEY, STAGES, stageLabel } from "@/lib/stages";
import type { Visit } from "@/lib/types";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const toneOf = { info: "bg-teal-t text-teal-d", warn: "bg-sun-t text-[#9a5a00]", won: "bg-emerald-50 text-emerald-700", skip: "bg-cloud text-muted" } as const;

export function DealModal({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const { data, update, remove, removeMany, toast } = useCrm();
  const flow = useFlow();
  const deal = data.deals.find((d) => d.id === dealId);
  const [sub, setSub] = useState<"visit" | "result" | "quote" | "lost" | "delete" | null>(null);
  const [resultFor, setResultFor] = useState<Visit | null>(null);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ value: "", rep: "", address: "" });
  if (!deal) return null;

  const contact = data.contacts.find((c) => c.id === deal.contact_id);
  const visits = data.visits.filter((v) => v.deal_id === deal.id).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const open = visits.find((v) => v.status === "scheduled");
  const log = data.autolog.filter((l) => l.deal_id === deal.id && l.tone !== "skip");
  const stage = STAGES.find((s) => s.id === deal.stage)!;
  const lost = deal.stage === "lost";

  const actions: React.ReactNode[] = [];
  const A = (label: string, fn: () => void, icon: string, primary = false) => actions.push(<Button key={label} size="sm" variant={primary ? "primary" : "soft"} icon={icon} onClick={fn}>{label}</Button>);
  if (deal.stage === "new") { A("I've contacted them", () => flow.moveSimple(deal, "contacted"), "phone", true); A("Book visit", () => setSub("visit"), "calendar"); }
  if (deal.stage === "contacted") { A("Book visit", () => setSub("visit"), "calendar", true); A("Send quote", () => setSub("quote"), "send"); }
  if (deal.stage === "visit_booked" && open) {
    A("Log visit result", () => { setResultFor(open); setSub("result"); }, "check", true);
    A("No-show", () => flow.noShow(open), "alert");
    A("Reschedule", () => setSub("visit"), "calendar");
  }
  if (deal.stage === "visit_done") { A("Send quote", () => setSub("quote"), "send", true); }
  if (deal.stage === "quoted") { A("Mark won", () => flow.markWon(deal), "check", true); A("Re-send quote", () => setSub("quote"), "send"); }
  if (deal.stage === "won") A("Mark job complete", () => flow.complete(deal), "check", true);
  if (!["won", "completed", "lost"].includes(deal.stage)) A("Mark lost", () => setSub("lost"), "x");
  if (lost) A("Reopen", () => flow.moveSimple(deal, "contacted"), "back");

  const stepIdx = lost ? -1 : stage.step;

  return (
    <>
      <Modal title={deal.title} onClose={onClose} wide>
        <div className="space-y-6">
          <ol className="grid grid-cols-6 gap-1.5" aria-label="Progress">
            {JOURNEY.map((j, i) => (
              <li key={j} className="text-center">
                <div className={`h-1.5 rounded-full ${lost ? "bg-line" : i < stepIdx ? "bg-teal" : i === stepIdx ? "bg-gradient-to-r from-teal to-iris" : "bg-line"}`} />
                <div className={`mt-1.5 text-[11.5px] font-semibold ${i === stepIdx ? "text-ink" : "text-muted"}`}>{j}</div>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={lost ? "gray" : deal.stage === "won" || deal.stage === "completed" ? "green" : "iris"}>{stageLabel(deal.stage)}</Badge>
            {lost && deal.lost_reason && <Badge tone="gray">{deal.lost_reason}</Badge>}
            <span className="text-sm text-muted">in this stage {timeAgo(deal.stage_at).replace(" ago", "")}</span>
          </div>

          <div className="grid gap-x-6 gap-y-3 rounded-2xl bg-cloud px-5 py-4 text-sm sm:grid-cols-3">
            <div><div className="text-muted">Homeowner</div>{contact ? <Link href={`/contacts/${contact.id}`} className="font-semibold text-ink hover:underline">{contact.name}</Link> : "—"}</div>
            <div><div className="text-muted">Project</div><div className="font-semibold text-ink">{deal.project || "—"}</div></div>
            <div><div className="text-muted">Value</div><div className="font-semibold text-ink">{deal.value ? money(deal.value) : deal.budget || "—"}</div></div>
            <div><div className="text-muted">Rep</div><div className="font-semibold text-ink">{deal.rep || "Unassigned"}</div></div>
            <div><div className="text-muted">Source</div><div className="font-semibold text-ink">{deal.source || "—"}</div></div>
            <div><div className="text-muted">Where</div><div className="font-semibold text-ink">{deal.address || "—"}</div></div>
          </div>

          {actions.length > 0 && <div><div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Next step</div><div className="flex flex-wrap gap-2">{actions}</div></div>}

          {visits.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">Visits</div>
              <ul className="space-y-2">
                {visits.map((v) => (
                  <li key={v.id} className="rounded-2xl border border-line px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-ink">{when(v.starts_at)} <span className="font-normal text-muted">· {v.rep}</span></div>
                      <div className="flex items-center gap-2">
                        <Badge tone={v.status === "done" ? "green" : v.status === "no_show" ? "rose" : "sun"}>{v.status === "no_show" ? "No-show" : v.status === "done" ? "Done" : v.status === "cancelled" ? "Cancelled" : "Scheduled"}</Badge>
                        {v.priority && <Badge tone={v.priority === "hot" ? "rose" : v.priority === "warm" ? "sun" : "gray"}>{v.priority}</Badge>}
                        {v.status === "scheduled" && <button className="text-sm font-semibold text-teal-d hover:underline" onClick={() => downloadIcs({ id: v.id, start: v.starts_at, summary: `Visit: ${deal.project} · ${contact?.name ?? ""}`, location: deal.address, description: `Rep: ${v.rep}` })}>Add to calendar</button>}
                      </div>
                    </div>
                    {v.result && <p className="mt-1.5 text-sm">{v.result}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between"><div className="text-xs font-bold uppercase tracking-wider text-muted">What the system did</div><span className="text-[13px] text-muted">{log.length} event{log.length === 1 ? "" : "s"}</span></div>
            {log.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : (
              <ol className="space-y-2">
                {log.map((l) => (
                  <li key={l.id} className="flex items-start gap-3 text-sm">
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${toneOf[l.tone]}`}>{l.kind}</span>
                    <span className="min-w-0 flex-1 text-ink">{l.message}</span>
                    <span className="shrink-0 text-[12px] text-muted">{timeAgo(l.created_at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {edit ? (
            <form className="space-y-3 rounded-2xl border border-line p-4" onSubmit={async (e) => { e.preventDefault(); await update("deals", deal.id, { value: Number(f.value) || 0, rep: f.rep.trim(), address: f.address.trim() }); setEdit(false); toast("Details saved"); }}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Value ($)"><input className="field" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
                <Field label="Rep"><input className="field" value={f.rep} onChange={(e) => setF({ ...f, rep: e.target.value })} /></Field>
                <Field label="Address"><input className="field" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
              </div>
              <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="soft" onClick={() => setEdit(false)}>Cancel</Button><Button type="submit" size="sm">Save</Button></div>
            </form>
          ) : (
            <div className="flex items-center justify-between border-t border-line pt-4">
              <Button size="sm" variant="danger" icon="trash" onClick={() => setSub("delete")}>Delete</Button>
              <button className="text-sm font-semibold text-teal-d hover:underline" onClick={() => { setF({ value: String(deal.value || ""), rep: deal.rep, address: deal.address }); setEdit(true); }}>Edit details</button>
            </div>
          )}
        </div>
      </Modal>
      {sub === "visit" && <BookVisitModal deal={deal} onClose={() => setSub(null)} />}
      {sub === "result" && resultFor && <VisitResultModal visit={resultFor} onClose={() => setSub(null)} />}
      {sub === "quote" && <QuoteModal deal={deal} onClose={() => setSub(null)} />}
      {sub === "lost" && <LostModal deal={deal} onClose={() => setSub(null)} />}
      {sub === "delete" && <ConfirmModal title="Delete this job?" text="The lead, its visits and its history are removed. The homeowner stays in your contacts." onClose={() => setSub(null)}
        onConfirm={async () => { await removeMany("visits", visits.map((v) => v.id)); await removeMany("autolog", log.map((l) => l.id)); await remove("deals", deal.id); onClose(); }} />}
    </>
  );
}
