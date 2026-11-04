"use client";
import { useRef } from "react";
import { useCrm } from "./store";
import { nowIso, nowMs } from "./clock";
import { useEngine } from "./useEngine";
import type { ActivityKind, AutoLog, Deal, LogKind, Stage, Visit } from "./types";

const digits = (s: string) => s.replace(/\D/g, "");
const whenStr = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export interface LeadForm { name: string; phone: string; email: string; project: string; budget: string; source: string; address: string }

/**
 * What happens when YOU do something (add a lead, book a visit, send a quote…).
 * The follow-up messages, tasks and alerts that come after are not here: they live in Workflows.
 */
export function useFlow() {
  const { data, add, update, toast } = useCrm();
  const run = useEngine();
  const dataRef = useRef(data); dataRef.current = data;

  const log = async (kind: LogKind, message: string, tone: AutoLog["tone"], dealId: string | null) => {
    await add("autolog", { deal_id: dealId, kind, message, tone, key: "", created_at: nowIso() } as never);
  };
  const setStage = (d: Deal, stage: Stage, patch: Partial<Deal> = {}) => update("deals", d.id, { stage, stage_at: nowIso(), ...patch });
  const dealOf = (id: string) => dataRef.current.deals.find((d) => d.id === id);

  async function newLead(f: LeadForm): Promise<Deal | null> {
    const email = f.email.trim().toLowerCase(), ph = digits(f.phone);
    const existing = dataRef.current.contacts.find((c) => (email && c.email.toLowerCase() === email) || (ph.length >= 7 && digits(c.phone) === ph));
    let contact = existing;
    if (!contact) {
      const created = await add("contacts", { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), company: "", tags: ["homeowner"], source: f.source, unsubscribed: false } as never);
      if (!created) return null;
      contact = created;
    }
    const deal = await add("deals", {
      title: `${f.project} · ${contact.name}`, value: 0, stage: "new", contact_id: contact.id, source: f.source, project: f.project, budget: f.budget,
      address: f.address.trim(), rep: "", lost_reason: "", stage_at: nowIso(), quote_sent_at: null, created_at: nowIso(),
    } as never);
    if (!deal) return null;
    await log("Lead", `New lead from ${f.source}: ${contact.name}, ${f.project}${existing ? " · linked to existing contact" : ""}`, "info", deal.id);
    void run();
    return deal;
  }

  async function logActivity(contactId: string, kind: ActivityKind, body: string) {
    await add("activities", { contact_id: contactId, kind, body, created_at: nowIso() } as never);
    const d = dataRef.current.deals.find((x) => x.contact_id === contactId && x.stage === "new");
    if (d) { await setStage(d, "contacted"); await log("Chase", `First contact logged (${kind}) · call-back chase stopped`, "info", d.id); }
  }

  async function bookVisit(deal: Deal, o: { starts_at: string; rep: string }) {
    const rebook = dataRef.current.visits.some((v) => v.deal_id === deal.id && v.status === "no_show");
    // A new booking replaces any earlier scheduled one.
    for (const old of dataRef.current.visits.filter((v) => v.deal_id === deal.id && v.status === "scheduled")) await update("visits", old.id, { status: "cancelled" });
    const v = await add("visits", { deal_id: deal.id, contact_id: deal.contact_id, rep: o.rep, starts_at: o.starts_at, status: "scheduled", priority: "", result: "", created_at: nowIso() } as never);
    if (!v) return null;
    await setStage(deal, "visit_booked", { rep: o.rep });
    await log("Visit", `Visit ${rebook ? "rebooked" : "booked"} for ${whenStr(o.starts_at)} with ${o.rep}`, "info", deal.id);
    void run();
    return v;
  }

  async function visitResult(v: Visit, o: { priority: Visit["priority"]; result: string }) {
    await update("visits", v.id, { status: "done", priority: o.priority, result: o.result });
    const deal = dealOf(v.deal_id);
    if (!deal) return;
    await setStage(deal, "visit_done");
    await log("Visit", `Visit result saved to the lead · priority: ${o.priority || "none"}`, "info", deal.id);
    void run();
  }

  async function noShow(v: Visit) {
    await update("visits", v.id, { status: "no_show" });
    const deal = dealOf(v.deal_id);
    if (!deal) return;
    await setStage(deal, "contacted");
    await log("Visit", "Marked as a no-show", "warn", deal.id);
    void run();
  }

  async function sendQuote(deal: Deal, o: { amount: number }) {
    await setStage(deal, "quoted", { value: o.amount, quote_sent_at: nowIso() });
    await log("Quote", `Quote for ${money0(o.amount)} recorded`, "info", deal.id);
    void run();
  }

  async function markWon(deal: Deal, amount?: number) {
    const value = amount ?? deal.value;
    await setStage(deal, "won", { value });
    await log("Won", `Contract signed · Closed Won ${money0(value)}`, "won", deal.id);
    void run();
  }

  async function complete(deal: Deal) {
    await setStage(deal, "completed");
    await log("Job", "Job marked complete", "won", deal.id);
    void run();
  }

  async function markLost(deal: Deal, reason: string) {
    await setStage(deal, "lost", { lost_reason: reason });
    await log("Lost", `Marked lost: ${reason}`, "warn", deal.id);
    void run();
  }

  async function moveSimple(deal: Deal, stage: Stage) { await setStage(deal, stage); void run(); }

  return { newLead, logActivity, bookVisit, visitResult, noShow, sendQuote, markWon, complete, markLost, moveSimple, runDue: run, toast, now: nowMs };
}
export type Flow = ReturnType<typeof useFlow>;
