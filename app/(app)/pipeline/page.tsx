"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DealModal } from "@/components/DealModal";
import { BookVisitModal, LostModal, NewLeadModal, QuoteModal, VisitResultModal } from "@/components/flowModals";
import { Avatar, Button, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { useFlow } from "@/lib/flow";
import { money } from "@/lib/format";
import { STAGES } from "@/lib/stages";
import type { Deal, Stage, Visit } from "@/lib/types";

type Pending = { kind: "visit" | "result" | "quote" | "lost"; deal: Deal; visit?: Visit };

function Board() {
  const { data } = useCrm();
  const flow = useFlow();
  const router = useRouter();
  const sp = useSearchParams();
  const openId = sp.get("deal");
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const contacts = new Map(data.contacts.map((c) => [c.id, c]));
  const open = data.deals.filter((d) => !["won", "completed", "lost"].includes(d.stage));
  const inFlight = open.reduce((s, d) => s + d.value, 0);
  const nextVisit = (id: string) => data.visits.filter((v) => v.deal_id === id && v.status === "scheduled").sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

  function drop(deal: Deal, to: Stage) {
    if (deal.stage === to) return;
    if (to === "visit_booked") return setPending({ kind: "visit", deal });
    if (to === "quoted") return setPending({ kind: "quote", deal });
    if (to === "lost") return setPending({ kind: "lost", deal });
    if (to === "visit_done") {
      const v = nextVisit(deal.id);
      return v ? setPending({ kind: "result", deal, visit: v }) : flow.moveSimple(deal, "visit_done");
    }
    if (to === "won") return void flow.markWon(deal);
    if (to === "completed") return void flow.complete(deal);
    void flow.moveSimple(deal, to);
  }

  return (
    <div>
      <PageHeader title="Jobs" sub={`${open.length} in progress · ${money(inFlight)} quoted or in play · drag a card to move it along`} action={<Button icon="plus" onClick={() => setAdding(true)}>New lead</Button>} />
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="grid min-w-max grid-flow-col auto-cols-[270px] gap-3.5">
          {STAGES.map((s) => {
            const deals = data.deals.filter((d) => d.stage === s.id).sort((a, b) => b.stage_at.localeCompare(a.stage_at));
            const sum = deals.reduce((a, d) => a + d.value, 0);
            return (
              <section key={s.id} aria-label={s.label}
                onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                onDrop={() => { const d = data.deals.find((x) => x.id === drag); if (d) drop(d, s.id); setDrag(null); setOver(null); }}
                className={`flex min-h-[340px] flex-col rounded-3xl border p-3 transition ${over === s.id ? "border-teal bg-teal-t/50" : "border-line bg-white/60"}`}>
                <header className="mb-3 px-2 pt-1">
                  <div className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${s.dot}`} /><h2 className="font-display text-[15px] font-semibold">{s.label}</h2><span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-bold text-muted">{deals.length}</span></div>
                  <div className="mt-0.5 text-[13px] text-muted">{sum ? money(sum) : s.hint}</div>
                </header>
                <ul className="flex flex-1 flex-col gap-2.5">
                  {deals.map((d) => {
                    const c = d.contact_id ? contacts.get(d.contact_id) : null;
                    const v = nextVisit(d.id);
                    return (
                      <li key={d.id} draggable onDragStart={() => setDrag(d.id)} onDragEnd={() => { setDrag(null); setOver(null); }}
                        className={`cursor-grab rounded-2xl border border-line bg-white p-3.5 shadow-sm transition hover:shadow-md active:cursor-grabbing ${drag === d.id ? "opacity-40" : ""}`}>
                        <button onClick={() => router.push(`/pipeline?deal=${d.id}`)} className="block w-full text-left">
                          <div className="text-[13px] font-semibold text-teal-d">{d.project || "Project"}</div>
                          <div className="font-semibold leading-snug text-ink">{c?.name ?? d.title}</div>
                          <div className="mt-1 text-sm text-muted">{d.value ? <span className="font-display font-semibold text-ink">{money(d.value)}</span> : d.budget}</div>
                          {v && <div className="mt-2 inline-flex items-center rounded-full bg-sun-t px-2.5 py-0.5 text-xs font-semibold text-[#9a5a00]">Visit {new Date(v.starts_at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</div>}
                        </button>
                        <div className="mt-2.5 flex items-center justify-between gap-2 text-[12.5px] text-muted">
                          <span className="flex min-w-0 items-center gap-1.5">{d.rep ? <><Avatar name={d.rep} size="size-5 text-[9px]" /><span className="truncate">{d.rep}</span></> : "Unassigned"}</span>
                          <span className="truncate">{d.source}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
      {adding && <NewLeadModal onClose={() => setAdding(false)} />}
      {openId && <DealModal dealId={openId} onClose={() => router.replace("/pipeline")} />}
      {pending?.kind === "visit" && <BookVisitModal deal={pending.deal} onClose={() => setPending(null)} />}
      {pending?.kind === "result" && pending.visit && <VisitResultModal visit={pending.visit} onClose={() => setPending(null)} />}
      {pending?.kind === "quote" && <QuoteModal deal={pending.deal} onClose={() => setPending(null)} />}
      {pending?.kind === "lost" && <LostModal deal={pending.deal} onClose={() => setPending(null)} />}
      <p className="mt-2 text-sm text-muted">Tip: <Link href="/automations" className="font-semibold text-teal-d hover:underline">Autopilot</Link> sends the replies, reminders and follow-ups for you as jobs move along.</p>
    </div>
  );
}

export default function PipelinePage() {
  return <Suspense><Board /></Suspense>;
}
