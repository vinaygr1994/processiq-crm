/** The twelve Lead-to-Job automations (mirrors the live demo at processiqautomation.com/demo). */
export interface AutomationDef { id: string; stage: string; title: string; text: string; channel: "email" | "task" | "alert" }

export const AUTOMATIONS: AutomationDef[] = [
  { id: "speed", stage: "NEW LEAD", title: "Speed-to-lead reply", text: "A reply goes out within a minute, with a link to book a visit.", channel: "email" },
  { id: "assign", stage: "NEW LEAD", title: "Lead assignment", text: "Round-robin between your reps. Duplicates are caught on arrival.", channel: "task" },
  { id: "chase", stage: "CONTACT", title: "Call-back chase", text: "Tasks at 15 min, 2 h and next morning, then an alert to the manager.", channel: "task" },
  { id: "confirm", stage: "VISIT", title: "Confirmations", text: "A confirmation email the moment a visit is booked, with a calendar file.", channel: "email" },
  { id: "reminders", stage: "VISIT", title: "Visit reminders", text: "Reminders 24 h and 2 h before the visit.", channel: "email" },
  { id: "noshow", stage: "VISIT", title: "No-show rescue", text: "Rebooking message to the homeowner and a task for the rep, automatically.", channel: "email" },
  { id: "results", stage: "VISIT", title: "Visit results to the team", text: "Rep saves one short form; the result is copied to the lead and the manager is alerted.", channel: "alert" },
  { id: "quote", stage: "QUOTE", title: "Quote follow-up", text: "Messages on days 2, 5, 10 and 21 until there's a decision.", channel: "email" },
  { id: "stale", stage: "QUOTE", title: "Stale-deal alert", text: "No activity for 7 days? A task for the rep and an alert for the manager.", channel: "alert" },
  { id: "nurture", stage: "LOST", title: "Long-term nurture", text: "A check-in every 90 days, so lost leads can come back.", channel: "email" },
  { id: "review", stage: "COMPLETE", title: "Review request", text: "Your Google review link when the job is done, plus one reminder.", channel: "email" },
  { id: "referral", stage: "COMPLETE", title: "Referral ask", text: "A referral request 30 days after the job, when customers are happiest.", channel: "email" },
];

export interface MsgCtx { first: string; project: string; rep: string; business: string; when?: string; amount?: string; review?: string; booking?: string }
const p = (c: MsgCtx) => c.project.toLowerCase() || "project";
const book = (c: MsgCtx) => (c.booking ? `You can pick a time here: ${c.booking}` : "Just reply with a day and time that suits you and we'll lock it in.");

export const MSG = {
  speed: (c: MsgCtx) => ({ subject: `We got your ${p(c)} enquiry, ${c.first}`, body: `Hi ${c.first},\n\nThanks for reaching out to ${c.business} about your ${p(c)}. ${c.rep || "One of our team"} will call you shortly.\n\n${book(c)}` }),
  confirm: (c: MsgCtx) => ({ subject: `Your visit is booked: ${c.when}`, body: `Hi ${c.first},\n\nYour free in-home visit for your ${p(c)} is confirmed for ${c.when}. ${c.rep} will meet you there to measure up and talk through your options.\n\nNeed to change the time? Just reply to this email.` }),
  remind24: (c: MsgCtx) => ({ subject: `Reminder: your visit is tomorrow (${c.when})`, body: `Hi ${c.first},\n\nA quick reminder that ${c.rep} is visiting tomorrow, ${c.when}, to look at your ${p(c)}.\n\nIf anything changes, reply and let us know.` }),
  remind2: (c: MsgCtx) => ({ subject: `${c.rep} is on the way soon (${c.when})`, body: `Hi ${c.first},\n\nSee you in about two hours (${c.when}). ${c.rep} from ${c.business} will be with you shortly.` }),
  noshow: (c: MsgCtx) => ({ subject: `Sorry we missed you, ${c.first}`, body: `Hi ${c.first},\n\nWe didn't manage to meet today. No problem at all. ${book(c)}\n\nWe'd love to still help with your ${p(c)}.` }),
  quote: (c: MsgCtx) => ({ subject: `Your ${p(c)} quote: ${c.amount}`, body: `Hi ${c.first},\n\nThanks for having us out. Your quote for the ${p(c)} is ${c.amount}. Have a look and let us know what you think. Happy to walk you through any line item.\n\nWe can usually hold your start date for two weeks.` }),
  q2: (c: MsgCtx) => ({ subject: `Did you get our quote, ${c.first}?`, body: `Hi ${c.first},\n\nJust making sure the quote for your ${p(c)} (${c.amount}) reached you. Any questions at all, we're happy to help.` }),
  q5: (c: MsgCtx) => ({ subject: `Any questions about your ${p(c)} quote?`, body: `Hi ${c.first},\n\nWanted to check in on the ${c.amount} quote. If something doesn't fit your budget or timeline, tell us and we'll see what we can adjust.` }),
  q10: (c: MsgCtx) => ({ subject: `Still thinking it over, ${c.first}?`, body: `Hi ${c.first},\n\nNo pressure. We just don't want your ${p(c)} quote to get lost. If now isn't the right time, tell us when to check back and we will.` }),
  q21: (c: MsgCtx) => ({ subject: `Should we keep your quote open?`, body: `Hi ${c.first},\n\nIt's been a few weeks since we sent your ${p(c)} quote. Shall we keep it open, or would you like us to close it for now? Either is fine.` }),
  nurture: (c: MsgCtx) => ({ subject: `Thinking of your ${p(c)}, ${c.first}`, body: `Hi ${c.first},\n\nIt's ${c.business} checking in. If your ${p(c)} is back on the cards, we'd be glad to take another look. A quick reply is all it takes.` }),
  review: (c: MsgCtx) => ({ subject: `How did we do, ${c.first}?`, body: `Hi ${c.first},\n\nThank you for trusting ${c.business} with your ${p(c)}. If you're happy with the result, a quick review would mean a lot to a small team like ours:\n\n${c.review || "(add your review link in Settings)"}` }),
  review2: (c: MsgCtx) => ({ subject: `A quick favour, ${c.first}`, body: `Hi ${c.first},\n\nIf you have a minute, we'd really appreciate your review of the ${p(c)}: ${c.review || ""}\n\nThank you!` }),
  referral: (c: MsgCtx) => ({ subject: `Know someone planning a renovation?`, body: `Hi ${c.first},\n\nWe hope you're enjoying your ${p(c)}. If a friend or neighbour is planning a project, we'd be grateful for an introduction, and we'll look after them the way we looked after you.` }),
};
