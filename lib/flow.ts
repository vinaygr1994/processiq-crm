"use client";
import { useCallback, useRef } from "react";
import { useCrm } from "./store";
import { callApi } from "./api";
import { nowIso, nowMs } from "./clock";
import { MSG, type MsgCtx } from "./automations";
import { firstName, todayStr } from "./format";
import type { ActivityKind, AutoLog, Contact, Deal, LogKind, Stage, Visit } from "./types";

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const digits = (s: string) => s.replace(/\D/g, "");
const whenStr = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const money0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export interface LeadForm { name: string; phone: string; email: string; project: string; budget: string; source: string; address: string }
type Send = "sent" | "demo" | "failed" | "skipped";

export function useFlow() {
  const crm = useCrm();
  const { data, settings, add, update, saveSettings, toast } = crm;
  const dataRef = useRef(data); dataRef.current = data;
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const fired = useRef(new Set<string>());
  const running = useRef(false);

  const on = (id: string) => !(settingsRef.current?.automations_off ?? []).includes(id);
  const done = (key: string) => fired.current.has(key) || dataRef.current.autolog.some((l) => l.key === key);

  /** Writes one line to the activity log. A key makes it run only once. */
  const log = useCallback(async (kind: LogKind, message: string, tone: AutoLog["tone"], dealId: string | null, key = "") => {
    if (key) { if (done(key)) return false; fired.current.add(key); }
    await add("autolog", { deal_id: dealId, kind, message, tone, key, created_at: nowIso() } as never);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [add]);

  const task = useCallback(async (title: string, dealId: string | null, contactId: string | null, dueOffsetDays = 0) => {
    await add("tasks", { title, due_date: todayStr(new Date(nowMs() + dueOffsetDays * DAY)), done: false, contact_id: contactId, deal_id: dealId });
  }, [add]);

  const ctxOf = (deal: Deal, contact: Contact | undefined, extra: Partial<MsgCtx> = {}): MsgCtx => ({
    first: firstName(contact?.name ?? "there"), project: deal.project, rep: deal.rep || settingsRef.current?.sender_name || "our team",
    business: settingsRef.current?.business_name || "our team", review: settingsRef.current?.review_link, booking: settingsRef.current?.booking_link,
    amount: deal.value ? money0(deal.value) : "", ...extra,
  });

  async function send(contact: Contact | undefined, msg: { subject: string; body: string }, marketing = false): Promise<Send> {
    if (!contact || !contact.email) return "skipped";
    if (marketing && contact.unsubscribed) return "skipped";
    const sig = settingsRef.current?.signature?.trim();
    const body = msg.body + (sig ? `\n\n${sig}` : "");
    let status: Send = "demo", error = "";
    try {
      const r = await callApi<{ status: "sent" | "demo" }>("/api/email/send", { to: contact.email, subject: msg.subject, body, contactId: contact.id, marketing });
      status = r.status;
    } catch (e) { status = "failed"; error = (e as Error).message; }
    await add("emails", { contact_id: contact.id, to_email: contact.email, subject: msg.subject, body, status: status === "failed" ? "failed" : status, error, campaign_id: null, created_at: nowIso() } as never);
    return status;
  }
  const contactOf = (d: Deal) => dataRef.current.contacts.find((c) => c.id === d.contact_id);
  const setStage = (d: Deal, stage: Stage, patch: Partial<Deal> = {}) => update("deals", d.id, { stage, stage_at: nowIso(), ...patch });

  /* ---------------- Event-driven actions ---------------- */

  async function newLead(f: LeadForm): Promise<Deal | null> {
    const t0 = Date.now();
    const email = f.email.trim().toLowerCase(), ph = digits(f.phone);
    const existing = dataRef.current.contacts.find((c) => (email && c.email.toLowerCase() === email) || (ph.length >= 7 && digits(c.phone) === ph));
    let contact = existing;
    if (!contact) {
      const created = await add("contacts", { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), company: "", tags: ["homeowner"], source: f.source, unsubscribed: false });
      if (!created) return null;
      contact = created;
    }
    const reps = settingsRef.current?.reps ?? [];
    let rep = "";
    if (reps.length && on("assign")) {
      const i = settingsRef.current?.rr_index ?? 0;
      rep = reps[i % reps.length];
      await saveSettings({ rr_index: i + 1 });
    }
    const deal = await add("deals", {
      title: `${f.project} · ${contact.name}`, value: 0, stage: "new", contact_id: contact.id, source: f.source, project: f.project, budget: f.budget,
      address: f.address.trim(), rep, lost_reason: "", stage_at: nowIso(), quote_sent_at: null, created_at: nowIso(),
    } as never);
    if (!deal) return null;
    await log("Lead", `New lead from ${f.source}: ${contact.name}, ${f.project}`, "info", deal.id, `lead:${deal.id}`);
    await log("Routing", existing ? `Duplicate found · linked to existing contact ${existing.name}` : `Duplicate check passed${rep ? ` · assigned to ${rep} by round robin` : ""}`, "info", deal.id, `route:${deal.id}`);
    if (on("speed")) {
      const r = await send(contact, MSG.speed(ctxOf(deal, contact)));
      const secs = Math.max(1, Math.round((Date.now() - t0) / 1000));
      if (r === "skipped") await log("Auto", "No email address on file, so no automatic reply. Call or text now.", "warn", deal.id, `speed:${deal.id}`);
      else if (r === "failed") await log("Auto", "Speed-to-lead email failed. Check Settings → Connections.", "warn", deal.id, `speed:${deal.id}`);
      else await log("Auto", `Speed-to-lead email sent in ${secs} second${secs === 1 ? "" : "s"}`, "info", deal.id, `speed:${deal.id}`);
    }
    await task(`Call ${contact.name} (new ${f.source} lead)`, deal.id, contact.id);
    await log("Task", `Call task created for ${rep || "the team"}, due in 15 min`, "info", deal.id, `calltask:${deal.id}`);
    return deal;
  }

  async function logActivity(contactId: string, kind: ActivityKind, body: string) {
    await add("activities", { contact_id: contactId, kind, body, created_at: nowIso() } as never);
    const d = dataRef.current.deals.find((x) => x.contact_id === contactId && x.stage === "new");
    if (d) { await setStage(d, "contacted"); await log("Chase", `First contact logged (${kind}) · call-back chase stopped`, "info", d.id, `contacted:${d.id}`); }
  }

  async function bookVisit(deal: Deal, o: { starts_at: string; rep: string }) {
    const contact = contactOf(deal);
    const rebook = dataRef.current.visits.some((v) => v.deal_id === deal.id && v.status === "no_show");
    const v = await add("visits", { deal_id: deal.id, contact_id: deal.contact_id, rep: o.rep, starts_at: o.starts_at, status: "scheduled", priority: "", result: "", created_at: nowIso() } as never);
    if (!v) return null;
    await setStage(deal, "visit_booked", { rep: o.rep });
    await log("Visit", `Visit ${rebook ? "rebooked" : "booked"} for ${whenStr(o.starts_at)} with ${o.rep} · calendar updated`, "info", deal.id, `book:${v.id}`);
    if (on("confirm")) {
      const r = await send(contact, MSG.confirm(ctxOf({ ...deal, rep: o.rep }, contact, { when: whenStr(o.starts_at) })));
      await log("Auto", r === "skipped" ? "No email on file, so the confirmation was not sent." : "Visit confirmation sent to the homeowner", r === "skipped" ? "warn" : "info", deal.id, `confirm:${v.id}`);
    }
    return v;
  }

  async function visitResult(v: Visit, o: { priority: Visit["priority"]; result: string }) {
    await update("visits", v.id, { status: "done", priority: o.priority, result: o.result });
    const deal = dataRef.current.deals.find((d) => d.id === v.deal_id);
    if (!deal) return;
    await setStage(deal, "visit_done");
    if (on("results")) {
      await log("Visit", `Visit result saved and copied to the lead · priority: ${o.priority || "none"}`, "info", deal.id, `res:${v.id}`);
      await log("Alert", "Visit summary sent to the sales manager and owner", "info", deal.id, `resalert:${v.id}`);
    }
    await task(`Send quote to ${contactOf(deal)?.name ?? "the homeowner"}`, deal.id, deal.contact_id, 1);
  }

  async function noShow(v: Visit, auto = false) {
    await update("visits", v.id, { status: "no_show" });
    const deal = dataRef.current.deals.find((d) => d.id === v.deal_id);
    if (!deal) return;
    await setStage(deal, "contacted");
    await log("Visit", auto ? "No visit result 30 min after start · no-show rescue started" : "Marked as a no-show · rescue started", "warn", deal.id, `noshow:${v.id}`);
    if (on("noshow")) {
      const contact = contactOf(deal);
      const r = await send(contact, MSG.noshow(ctxOf(deal, contact)));
      await task(`Rebook ${contact?.name ?? "the homeowner"}'s visit`, deal.id, deal.contact_id);
      await log("Auto", r === "skipped" ? "Rebooking task created (no email on file)" : "Rebooking message sent and a task created for the rep", "info", deal.id, `rescue:${v.id}`);
    }
  }

  async function sendQuote(deal: Deal, o: { amount: number }) {
    const contact = contactOf(deal);
    const next = { ...deal, value: o.amount };
    await setStage(deal, "quoted", { value: o.amount, quote_sent_at: nowIso() });
    const r = await send(contact, MSG.quote(ctxOf(next, contact)));
    await log("Quote", `Quote for ${money0(o.amount)} ${r === "skipped" ? "saved (no email on file)" : `sent to ${contact?.name ?? "the homeowner"}`}`, "info", deal.id, `quote:${deal.id}:${nowMs()}`);
  }

  async function markWon(deal: Deal, amount?: number) {
    const value = amount ?? deal.value;
    await setStage(deal, "won", { value });
    await log("Won", `Contract signed · Closed Won ${money0(value)}`, "won", deal.id, `won:${deal.id}`);
    await log("Job", "Owner notified · job handed to production", "info", deal.id, `handoff:${deal.id}`);
    await task(`Hand over to production: ${deal.title}`, deal.id, deal.contact_id, 1);
  }

  async function complete(deal: Deal) {
    await setStage(deal, "completed");
    await log("Job", "Job marked complete", "won", deal.id, `complete:${deal.id}`);
    if (on("review")) {
      const contact = contactOf(deal);
      const r = await send(contact, MSG.review(ctxOf(deal, contact)), true);
      await log("Review", r === "skipped" || r === "failed" ? "Review request could not be sent (check email setup and the contact's email)" : `Review request sent to ${contact?.name ?? "the homeowner"}`, r === "failed" ? "warn" : "info", deal.id, `review:${deal.id}`);
    }
  }

  async function markLost(deal: Deal, reason: string) {
    await setStage(deal, "lost", { lost_reason: reason });
    await log("Lost", `Marked lost: ${reason}${on("nurture") ? " · moved to 90-day nurture" : ""}`, "warn", deal.id, `lost:${deal.id}:${nowMs()}`);
  }

  async function moveSimple(deal: Deal, stage: Stage) { await setStage(deal, stage); }

  /* ---------------- Time-driven rules ---------------- */

  async function runDue() {
    if (running.current || !dataRef.current.deals.length) return;
    running.current = true;
    try {
      const now = nowMs();
      const d = dataRef.current;
      const lastTouch = (deal: Deal) => {
        let t = new Date(deal.stage_at).getTime();
        d.activities.forEach((a) => a.contact_id === deal.contact_id && (t = Math.max(t, new Date(a.created_at).getTime())));
        d.emails.forEach((e) => e.contact_id === deal.contact_id && e.status !== "failed" && (t = Math.max(t, new Date(e.created_at).getTime())));
        return t;
      };
      for (const deal of d.deals) {
        const contact = contactOf(deal);
        const name = contact?.name ?? "the homeowner";
        const age = now - new Date(deal.created_at).getTime();
        const inStage = now - new Date(deal.stage_at).getTime();

        // 1. Call-back chase (new leads nobody has contacted yet)
        if (deal.stage === "new" && on("chase")) {
          const created = new Date(deal.created_at);
          const morning = new Date(created); if (created.getHours() >= 9) morning.setDate(morning.getDate() + 1); morning.setHours(9, 0, 0, 0);
          if (now >= morning.getTime()) {
            if (await log("Alert", `Not reached by next morning · sales manager alerted about ${name}`, "warn", deal.id, `chasemgr:${deal.id}`)) { fired.current.add(`chase2h:${deal.id}`); fired.current.add(`chase15:${deal.id}`); await task(`Manager: ${name} still hasn't been called`, deal.id, deal.contact_id); }
          } else if (age >= 2 * HOUR) {
            if (await log("Chase", `Still no contact after 2 h · second call attempt needed for ${name}`, "warn", deal.id, `chase2h:${deal.id}`)) { fired.current.add(`chase15:${deal.id}`); await task(`Call ${name} again (2 h, no contact)`, deal.id, deal.contact_id); }
          } else if (age >= 15 * MIN) {
            if (await log("Chase", `No contact after 15 min · reminder task for ${deal.rep || "the rep"}`, "warn", deal.id, `chase15:${deal.id}`)) await task(`Call ${name} now (15 min, no contact)`, deal.id, deal.contact_id);
          }
        }

        // 2-3. Visits: reminders and no-show detection
        for (const v of d.visits.filter((x) => x.deal_id === deal.id && x.status === "scheduled")) {
          const start = new Date(v.starts_at).getTime();
          if (now >= start + 30 * MIN) { if (!done(`noshow:${v.id}`)) await noShow(v, true); continue; }
          if (!on("reminders")) continue;
          if (now >= start - 2 * HOUR && now < start) {
            fired.current.add(`rem24:${v.id}`);
            if (!done(`rem2:${v.id}`)) { const r = await send(contact, MSG.remind2(ctxOf(deal, contact, { when: whenStr(v.starts_at) }))); await log("Auto", r === "skipped" ? "2-hour reminder skipped (no email on file)" : "2-hour reminder sent to the homeowner", "info", deal.id, `rem2:${v.id}`); }
          } else if (now >= start - 24 * HOUR && now < start - 2 * HOUR) {
            if (!done(`rem24:${v.id}`)) { const r = await send(contact, MSG.remind24(ctxOf(deal, contact, { when: whenStr(v.starts_at) }))); await log("Auto", r === "skipped" ? "24-hour reminder skipped (no email on file)" : "24-hour reminder sent to the homeowner", "info", deal.id, `rem24:${v.id}`); }
          }
        }

        // 4. Quote follow-ups (days 2, 5, 10, 21), only the latest due step is sent
        if (deal.stage === "quoted" && deal.quote_sent_at && on("quote")) {
          const days = (now - new Date(deal.quote_sent_at).getTime()) / DAY;
          const steps: [number, "q2" | "q5" | "q10" | "q21"][] = [[2, "q2"], [5, "q5"], [10, "q10"], [21, "q21"]];
          const dueSteps = steps.filter(([n]) => days >= n);
          const latest = dueSteps[dueSteps.length - 1];
          if (latest && !done(`${latest[1]}:${deal.id}`)) {
            dueSteps.slice(0, -1).forEach(([, k]) => fired.current.add(`${k}:${deal.id}`));
            const r = await send(contact, MSG[latest[1]](ctxOf(deal, contact)));
            await log("Quote", r === "skipped" ? `Day-${latest[0]} follow-up skipped (no email on file)` : `Day-${latest[0]} quote follow-up sent`, "info", deal.id, `${latest[1]}:${deal.id}`);
          }
        }

        // 5. Stale deals (7+ days without activity)
        if (["contacted", "visit_booked", "visit_done", "quoted"].includes(deal.stage) && on("stale")) {
          const quiet = Math.floor((now - lastTouch(deal)) / DAY);
          if (quiet >= 7) {
            const week = Math.floor(quiet / 7);
            if (await log("Alert", `No activity for ${quiet} days · stale-deal alert to ${deal.rep || "the rep"} and the manager (${name})`, "warn", deal.id, `stale:${deal.id}:${week}`))
              await task(`Follow up: ${deal.title} has gone quiet (${quiet} days)`, deal.id, deal.contact_id);
          }
        }

        // 6. Long-term nurture for lost leads (every 90 days)
        if (deal.stage === "lost" && on("nurture")) {
          const n = Math.floor(inStage / (90 * DAY));
          if (n >= 1 && !done(`nurture:${deal.id}:${n}`)) {
            const r = await send(contact, MSG.nurture(ctxOf(deal, contact)), true);
            await log("Nurture", r === "sent" || r === "demo" ? "Nurture check-in sent · lead can come back as a new enquiry" : "Nurture check-in skipped (no email, unsubscribed or email not set up)", "info", deal.id, `nurture:${deal.id}:${n}`);
          }
        }

        // 7. After the job: review reminder (+3 days) and referral ask (+30 days)
        if (deal.stage === "completed") {
          if (on("review") && inStage >= 3 * DAY && done(`review:${deal.id}`) && !done(`review2:${deal.id}`)) {
            const r = await send(contact, MSG.review2(ctxOf(deal, contact)), true);
            await log("Review", r === "skipped" || r === "failed" ? "Review reminder skipped" : "Review reminder sent", "info", deal.id, `review2:${deal.id}`);
          }
          if (on("referral") && inStage >= 30 * DAY && !done(`referral:${deal.id}`)) {
            const r = await send(contact, MSG.referral(ctxOf(deal, contact)), true);
            await log("Referral", r === "skipped" || r === "failed" ? "Referral ask skipped" : "Referral ask sent 30 days after the job", "info", deal.id, `referral:${deal.id}`);
          }
        }
      }
    } finally { running.current = false; }
  }

  return { newLead, logActivity, bookVisit, visitResult, noShow, sendQuote, markWon, complete, markLost, moveSimple, runDue, toast };
}
export type Flow = ReturnType<typeof useFlow>;
