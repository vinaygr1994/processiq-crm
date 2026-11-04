import type { Workflow } from "../types";
import type { Cond, Step } from "./types";
import { uid } from "./types";

type W = Omit<Workflow, "id" | "created_at" | "activated_at" | "active">;
const E = (subject: string, body: string, marketing = false): Step => ({ id: uid(), type: "email", subject, body, marketing });
const T = (title: string, days = 0): Step => ({ id: uid(), type: "task", title, days });
const wd = (amount: number, unit: "minutes" | "hours" | "days"): Step => ({ id: uid(), type: "wait", mode: "delay", amount, unit });
const wu = (ref: "visit_start" | "quote_sent", offset: number, late: "skip" | "run" | "stop" = "skip"): Step => ({ id: uid(), type: "wait", mode: "until", ref, offset, late });
const N = (message: string): Step => ({ id: uid(), type: "notify", message });
const stageNot = (s: string): Cond => ({ field: "deal.stage", op: "is_not", value: s });

export const STARTERS: W[] = [
  { template_id: "speed", name: "New lead: assign and reply instantly", description: "Assigns a rep, sends the first reply and creates a call task the moment a lead arrives.",
    trigger: { type: "lead_created" }, exit: [],
    steps: [{ id: uid(), type: "assign" }, E("We got your {{project}} enquiry, {{first}}", "Hi {{first}},\n\nThanks for reaching out to {{business}} about your {{project}}. {{rep}} will call you shortly.\n\n{{booking_line}}"), T("Call {{name}} (new lead)")] },
  { template_id: "chase", name: "Call-back chase", description: "Nobody has called yet? Reminder at 15 minutes, again at 2 hours, then alert the manager next morning.",
    trigger: { type: "lead_created" }, exit: [stageNot("new")],
    steps: [wd(15, "minutes"), T("Call {{name}} now (15 min, no contact)"), wd(105, "minutes"), T("Call {{name}} again (2 h, no contact)"), { id: uid(), type: "wait", mode: "time", time: "09:00" }, N("{{name}} still hasn't been called. Sales manager alerted."), T("Manager: {{name}} still hasn't been called")] },
  { template_id: "confirm", name: "Visit confirmation", description: "Confirms the visit by email as soon as it is booked.",
    trigger: { type: "visit_booked" }, exit: [],
    steps: [E("Your visit is booked: {{when}}", "Hi {{first}},\n\nYour free in-home visit for your {{project}} is confirmed for {{when}}. {{rep}} will meet you there to measure up and talk through your options.\n\nNeed to change the time? Just reply to this email.")] },
  { template_id: "reminders", name: "Visit reminders", description: "Reminders 24 hours and 2 hours before the visit.",
    trigger: { type: "visit_booked" }, exit: [{ field: "visit.status", op: "is_not", value: "scheduled" }],
    steps: [wu("visit_start", -1440), E("Reminder: your visit is tomorrow ({{when}})", "Hi {{first}},\n\nA quick reminder that {{rep}} is visiting tomorrow, {{when}}, to look at your {{project}}.\n\nIf anything changes, reply and let us know."), wu("visit_start", -120), E("{{rep}} is on the way soon ({{when}})", "Hi {{first}},\n\nSee you in about two hours ({{when}}). {{rep}} from {{business}} will be with you shortly.")] },
  { template_id: "autonoshow", name: "Detect no-shows", description: "No result logged 30 minutes after the visit started? It is marked as a no-show.",
    trigger: { type: "visit_booked" }, exit: [{ field: "visit.status", op: "is_not", value: "scheduled" }],
    steps: [wu("visit_start", 30, "run"), { id: uid(), type: "noshow" }] },
  { template_id: "noshow", name: "No-show rescue", description: "Sends a rebooking message and gives the rep a task.",
    trigger: { type: "visit_no_show" }, exit: [],
    steps: [E("Sorry we missed you, {{first}}", "Hi {{first}},\n\nWe didn't manage to meet today. No problem at all. {{booking_line}}\n\nWe'd love to still help with your {{project}}."), T("Rebook {{name}}'s visit")] },
  { template_id: "results", name: "Visit results to the team", description: "When the rep saves the visit result, alert the manager and set a task to send the quote.",
    trigger: { type: "visit_done" }, exit: [],
    steps: [N("Visit done for {{name}} ({{project}}). Result saved to the lead."), T("Send quote to {{name}}", 1)] },
  { template_id: "quote", name: "Quote follow-up", description: "Follow-ups on days 2, 5, 10 and 21 until there is a decision.",
    trigger: { type: "quote_sent" }, exit: [stageNot("quoted")],
    steps: [E("Your {{project}} quote: {{amount}}", "Hi {{first}},\n\nThanks for having us out. Your quote for the {{project}} is {{amount}}. Have a look and let us know what you think. Happy to walk you through any line item.\n\nWe can usually hold your start date for two weeks."), wd(2, "days"),
      E("Did you get our quote, {{first}}?", "Hi {{first}},\n\nJust making sure the quote for your {{project}} ({{amount}}) reached you. Any questions at all, we're happy to help."), wd(3, "days"),
      E("Any questions about your {{project}} quote?", "Hi {{first}},\n\nWanted to check in on the {{amount}} quote. If something doesn't fit your budget or timeline, tell us and we'll see what we can adjust."), wd(5, "days"),
      E("Still thinking it over, {{first}}?", "Hi {{first}},\n\nNo pressure. We just don't want your {{project}} quote to get lost. If now isn't the right time, tell us when to check back and we will."), wd(11, "days"),
      E("Should we keep your quote open?", "Hi {{first}},\n\nIt's been a few weeks since we sent your {{project}} quote. Shall we keep it open, or would you like us to close it for now? Either is fine.")] },
  { template_id: "stale", name: "Stale-deal alert", description: "A quote with no decision after 7 days creates a task and alerts the manager.",
    trigger: { type: "quote_sent" }, exit: [stageNot("quoted")],
    steps: [wd(7, "days"), T("Follow up: {{name}}'s quote has gone quiet (7 days)"), N("{{name}}'s quote has had no reply for 7 days.")] },
  { template_id: "won", name: "Won: hand over to production", description: "Tells the team and creates a hand-over task when a contract is signed.",
    trigger: { type: "stage_changed", stage: "won" }, exit: [],
    steps: [N("Contract signed with {{name}} ({{amount}}). Job handed to production."), T("Hand over to production: {{name}}", 1)] },
  { template_id: "nurture", name: "Long-term nurture (lost leads)", description: "A friendly check-in every 90 days for a year, so lost leads can come back.",
    trigger: { type: "stage_changed", stage: "lost" }, exit: [stageNot("lost")],
    steps: [wd(90, "days"), E("Thinking of your {{project}}, {{first}}", "Hi {{first}},\n\nIt's {{business}} checking in. If your {{project}} is back on the cards, we'd be glad to take another look. A quick reply is all it takes.", true),
      wd(90, "days"), E("Still planning your {{project}}?", "Hi {{first}},\n\nJust a friendly check-in from {{business}}. If your {{project}} is back on the cards, reply and we'll pick up where we left off.", true)] },
  { template_id: "review", name: "Review request", description: "Asks for a Google review when the job is complete, with one reminder three days later.",
    trigger: { type: "stage_changed", stage: "completed" }, exit: [],
    steps: [E("How did we do, {{first}}?", "Hi {{first}},\n\nThank you for trusting {{business}} with your {{project}}. If you're happy with the result, a quick review would mean a lot to a small team like ours:\n\n{{review_link}}", true), wd(3, "days"),
      E("A quick favour, {{first}}", "Hi {{first}},\n\nIf you have a minute, we'd really appreciate your review of the {{project}}: {{review_link}}\n\nThank you!", true)] },
  { template_id: "referral", name: "Referral ask", description: "Asks for an introduction 30 days after the job, when customers are happiest.",
    trigger: { type: "stage_changed", stage: "completed" }, exit: [],
    steps: [wd(30, "days"), E("Know someone planning a renovation?", "Hi {{first}},\n\nWe hope you're enjoying your {{project}}. If a friend or neighbour is planning a project, we'd be grateful for an introduction, and we'll look after them the way we looked after you.", true)] },
];
