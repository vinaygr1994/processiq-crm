// Journey Builder helpers: the activity catalogue, tree editing, starter journeys and live stats.
import type { Workflow, WorkflowRun, EmailLog } from "./types";
import { branches, uid, type Cond, type Path, type Step, type Trigger } from "./engine/types";
import { PRESETS, bid, stringifyDesign, type Design } from "./emailDesign";

export const isJourney = (w: Pick<Workflow, "template_id">) => w.template_id?.startsWith("journey");

/* ---------- Activities ---------- */
export type Group = "Messages" | "Timing" | "Flow control" | "Actions";
export interface Activity { key: string; label: string; group: Group; icon: string; hint: string; make: () => Step }
const path = (label: string, extra: Partial<Path> = {}): Path => ({ id: uid(), label, steps: [], ...extra });

export const ACTIVITIES: Activity[] = [
  { key: "email", label: "Email", group: "Messages", icon: "mail", hint: "Send a designed or plain email", make: () => ({ id: uid(), type: "email", subject: "", body: "Hi {{first_name}},\n\n", marketing: true }) },
  { key: "sms", label: "Text message", group: "Messages", icon: "phone", hint: "Send an SMS", make: () => ({ id: uid(), type: "sms", body: "Hi {{first}}, " }) },
  { key: "wait", label: "Wait", group: "Timing", icon: "clock", hint: "Pause for minutes, hours or days", make: () => ({ id: uid(), type: "wait", mode: "delay", amount: 2, unit: "days" }) },
  { key: "waittime", label: "Wait until time", group: "Timing", icon: "clock", hint: "Continue at a time of day", make: () => ({ id: uid(), type: "wait", mode: "time", time: "09:00" }) },
  { key: "split", label: "Decision split", group: "Flow control", icon: "chevron", hint: "Different paths by who they are", make: () => ({ id: uid(), type: "split", paths: [path("Path 1", { cond: { field: "contact.tags", op: "is", value: "vip" } }), path("Everyone else", { cond: null })] }) },
  { key: "ab", label: "Random split (A/B)", group: "Flow control", icon: "sparkle", hint: "Test two versions", make: () => ({ id: uid(), type: "ab", paths: [path("Version A", { pct: 50 }), path("Version B", { pct: 50 })] }) },
  { key: "engage", label: "Engagement split", group: "Flow control", icon: "send", hint: "Opened or clicked an email?", make: () => ({ id: uid(), type: "engage", ref: "", event: "open", paths: [path("Yes"), path("No")] }) },
  { key: "tag", label: "Add a tag", group: "Actions", icon: "tag", hint: "Label the contact", make: () => ({ id: uid(), type: "tag", tag: "" }) },
  { key: "untag", label: "Remove a tag", group: "Actions", icon: "tag", hint: "Remove a label", make: () => ({ id: uid(), type: "tag", tag: "", remove: true }) },
  { key: "task", label: "Create a task", group: "Actions", icon: "check", hint: "A to-do for your team", make: () => ({ id: uid(), type: "task", title: "Call {{name}}", days: 0 }) },
  { key: "stage", label: "Move job stage", group: "Actions", icon: "pipeline", hint: "Update the pipeline", make: () => ({ id: uid(), type: "stage", stage: "contacted" }) },
  { key: "assign", label: "Assign a rep", group: "Actions", icon: "users", hint: "Round robin", make: () => ({ id: uid(), type: "assign" }) },
  { key: "notify", label: "Alert me", group: "Actions", icon: "alert", hint: "Log and email you", make: () => ({ id: uid(), type: "notify", message: "" }) },
  { key: "log", label: "Add a note", group: "Actions", icon: "note", hint: "Shows in Activity", make: () => ({ id: uid(), type: "log", message: "" }) },
];
export const activityOf = (s: Step): Activity => {
  const k = s.type === "wait" ? (s.mode === "delay" ? "wait" : "waittime") : s.type === "tag" ? (s.remove ? "untag" : "tag") : s.type === "if" ? "split" : s.type;
  return ACTIVITIES.find((a) => a.key === k) ?? { key: s.type, label: s.type, group: "Actions", icon: "bolt", hint: "", make: () => s };
};
export const GROUP_TONE: Record<Group, string> = {
  Messages: "bg-teal-t text-teal-d", Timing: "bg-sun-t text-[#9a5a00]", "Flow control": "bg-iris-t text-iris", Actions: "bg-cloud text-body",
};

/* ---------- Entry sources ---------- */
export const ENTRY: { id: Trigger["type"]; label: string; group: string; hint: string }[] = [
  { id: "contact_created", label: "New contact added", group: "Contacts", hint: "Anyone added to your CRM, by hand, import or form." },
  { id: "tag_added", label: "Contact gets a tag", group: "Contacts", hint: "Everyone with this tag enters once, including people who already have it." },
  { id: "audience", label: "Audience (one-time send)", group: "Contacts", hint: "Everyone with an email address (or a tag) enters once when you activate, plus anyone who matches later." },
  { id: "lead_created", label: "New lead or deal", group: "Deals", hint: "A new lead arrives from any source." },
  { id: "stage_changed", label: "Deal moves to a stage", group: "Deals", hint: "For example Won or Completed." },
  { id: "quote_sent", label: "Quote sent", group: "Deals", hint: "When you send a quote." },
  { id: "visit_booked", label: "Appointment booked", group: "Appointments", hint: "A visit, class or meeting is booked." },
  { id: "visit_done", label: "Appointment completed", group: "Appointments", hint: "A result is logged." },
  { id: "visit_no_show", label: "Appointment no-show", group: "Appointments", hint: "Marked as a no-show." },
];

/* ---------- Tree editing ---------- */
/** Where a list of steps lives: [] is the main line; [[stepId, pathIndex], …] walks into splits. */
export type ListPath = [string, number][];
function setBranch(s: Step, k: number, list: Step[]): Step {
  if (s.type === "if") return k === 0 ? { ...s, then: list } : { ...s, else: list };
  if (s.type === "split" || s.type === "ab" || s.type === "engage") return { ...s, paths: s.paths.map((p, i) => (i === k ? { ...p, steps: list } : p)) } as Step;
  return s;
}
export function mapList(steps: Step[], lp: ListPath, fn: (l: Step[]) => Step[]): Step[] {
  if (!lp.length) return fn(steps);
  const [[id, k], ...rest] = lp;
  return steps.map((s) => (s.id === id ? setBranch(s, k, mapList(branches(s)?.[k] ?? [], rest, fn)) : s));
}
export function mapStep(steps: Step[], id: string, fn: (s: Step) => Step): Step[] {
  return steps.map((s) => {
    if (s.id === id) return fn(s);
    const br = branches(s);
    return br ? br.reduce<Step>((acc, l, k) => setBranch(acc, k, mapStep(l, id, fn)), s) : s;
  });
}
export function removeStep(steps: Step[], id: string): Step[] {
  return steps.filter((s) => s.id !== id).map((s) => { const br = branches(s); return br ? br.reduce<Step>((acc, l, k) => setBranch(acc, k, removeStep(l, id)), s) : s; });
}
export function findStep(steps: Step[], id: string): Step | null {
  for (const s of steps) { if (s.id === id) return s; const br = branches(s); if (br) for (const l of br) { const f = findStep(l, id); if (f) return f; } }
  return null;
}
export function allSteps(steps: Step[]): Step[] {
  return steps.flatMap((s) => [s, ...(branches(s)?.flatMap(allSteps) ?? [])]);
}
/** Gives every step (and path) a fresh id, for copying a starter. */
export function reIdAll(steps: Step[]): Step[] {
  const map = new Map<string, string>();
  const walk = (l: Step[]): Step[] => l.map((s) => {
    const id = uid(); map.set(s.id, id);
    if (s.type === "if") return { ...s, id, then: walk(s.then), else: walk(s.else) };
    if (s.type === "split" || s.type === "ab" || s.type === "engage") return { ...s, id, paths: s.paths.map((p) => ({ ...p, id: uid(), steps: walk(p.steps) })) } as Step;
    return { ...s, id };
  });
  const out = walk(steps);
  const fix = (l: Step[]): Step[] => l.map((s): Step => {
    const br = branches(s);
    const withKids = br ? br.reduce<Step>((acc, b, k) => setBranch(acc, k, fix(b)), s) : s;
    return withKids.type === "engage" ? { ...withKids, ref: map.get(withKids.ref) ?? withKids.ref } : withKids;
  });
  return fix(out);
}

/* ---------- Stats ---------- */
export interface JourneyStats { entered: number; active: number; done: number; goal: number; stopped: number }
export function journeyStats(runs: WorkflowRun[]): JourneyStats {
  return {
    entered: runs.length,
    active: runs.filter((r) => r.status === "active").length,
    done: runs.filter((r) => r.status === "done").length,
    goal: runs.filter((r) => r.status === "stopped" && r.note === "Reached the goal").length,
    stopped: runs.filter((r) => r.status === "stopped" && r.note !== "Reached the goal").length,
  };
}
export const posKey = (p: number[]) => p.join(".");
/** People waiting at each step right now, keyed by position. */
export function waitingAt(runs: WorkflowRun[]) {
  const m = new Map<string, number>();
  for (const r of runs) if (r.status === "active") m.set(posKey(r.pos), (m.get(posKey(r.pos)) ?? 0) + 1);
  return m;
}
/** People whose position is inside a path (prefix match). */
export function inPath(runs: WorkflowRun[], prefix: number[]) {
  const k = posKey(prefix) + ".";
  return runs.filter((r) => r.status === "active" && (posKey(r.pos) + ".").startsWith(k)).length;
}
export function emailStats(emails: EmailLog[], stepId: string) {
  const m = emails.filter((e) => e.step_id === stepId && e.status !== "failed");
  return { sent: m.length, opened: m.filter((e) => e.opened_at || e.clicked_at).length, clicked: m.filter((e) => e.clicked_at).length };
}

/* ---------- Starter journeys ---------- */
const design = (id: string, patch?: (d: Design) => Design) => {
  const p = PRESETS.find((x) => x.id === id)!;
  const d: Design = { ...p.design, blocks: p.design.blocks.map((b) => ({ ...b, id: bid(), cols: b.cols?.map((c) => ({ ...c })) })) };
  return stringifyDesign(patch ? patch(d) : d);
};
const E = (subject: string, body: string): Step => ({ id: uid(), type: "email", subject, body, marketing: true });
const W = (amount: number, unit: "hours" | "days" = "days"): Step => ({ id: uid(), type: "wait", mode: "delay", amount, unit });
const tag = (t: string, remove = false): Step => ({ id: uid(), type: "tag", tag: t, remove });
const task = (title: string): Step => ({ id: uid(), type: "task", title, days: 0 });

export interface Starter { id: string; name: string; description: string; trigger: Trigger; exit: Cond[]; steps: Step[] }
export function journeyStarters(): Starter[] {
  const welcome = E("Welcome to {{business}}, {{first_name}}", design("welcome"));
  const promo = E("{{first_name}}, a special offer for you", design("promo"));
  const winback = E("Still thinking about it, {{first_name}}?", design("reengage"));
  const quote = E("Any questions on your quote, {{first_name}}?", design("quote-follow"));
  const review = E("How did we do, {{first_name}}?", design("review"));
  return [
    { id: "blank", name: "Blank journey", description: "Start from an empty canvas.", trigger: { type: "contact_created" }, exit: [], steps: [] },
    {
      id: "welcome", name: "Welcome series", description: "Welcome email, then a different follow-up depending on whether they opened it.",
      trigger: { type: "contact_created" }, exit: [{ field: "contact.unsubscribed", op: "is", value: "true" }],
      steps: [welcome, W(2), { id: uid(), type: "engage", ref: welcome.id, event: "open", paths: [
        { id: uid(), label: "Opened", steps: [E("Here's how we can help, {{first_name}}", design("newsletter")), tag("engaged")] },
        { id: uid(), label: "Didn't open", steps: [E("Did you see this, {{first_name}}?", design("welcome")), W(3), task("Call {{name}}: hasn't opened the welcome emails")] },
      ] }, W(4), promo],
    },
    {
      id: "ab", name: "A/B test a promotion", description: "Half get version A, half get version B. Compare opens and clicks on each email.",
      trigger: { type: "audience", tag: "" }, exit: [],
      steps: [{ id: uid(), type: "ab", paths: [
        { id: uid(), label: "Version A", pct: 50, steps: [E("{{first_name}}, 10% off if you book this month", design("promo"))] },
        { id: uid(), label: "Version B", pct: 50, steps: [E("Only a few spots left this season", design("promo"))] },
      ] }],
    },
    {
      id: "reengage", name: "Win back quiet contacts", description: "For contacts tagged 'inactive': email, check for a click, then tag them hot or cold.",
      trigger: { type: "tag_added", tag: "inactive" }, exit: [],
      steps: [winback, W(5), { id: uid(), type: "engage", ref: winback.id, event: "click", paths: [
        { id: uid(), label: "Clicked", steps: [tag("inactive", true), tag("re-engaged"), task("{{name}} clicked the win-back email: call today")] },
        { id: uid(), label: "No click", steps: [E("Last chance: should we stay in touch?", design("plain")), W(7), tag("cold")] },
      ] }],
    },
    {
      id: "quote", name: "Quote follow-up", description: "Nudges after a quote, with a call task for big deals. Leaves the journey when the deal is won.",
      trigger: { type: "quote_sent" }, exit: [{ field: "deal.stage", op: "is", value: "won" }],
      steps: [W(2), quote, W(3), { id: uid(), type: "split", paths: [
        { id: uid(), label: "Big deal", cond: { field: "deal.value", op: "gt", value: "10000" }, steps: [task("Call {{name}} about the quote ({{amount}})")] },
        { id: uid(), label: "Everyone else", cond: null, steps: [E("Ready to get started, {{first_name}}?", design("plain"))] },
      ] }],
    },
    {
      id: "review", name: "After the job: review and referral", description: "When a deal is completed, ask for a review, then follow up with clickers.",
      trigger: { type: "stage_changed", stage: "completed" }, exit: [],
      steps: [W(2), review, W(5), { id: uid(), type: "engage", ref: review.id, event: "click", paths: [
        { id: uid(), label: "Clicked", steps: [tag("promoter")] },
        { id: uid(), label: "No click", steps: [E("A quick favour, {{first_name}}?", design("review"))] },
      ] }],
    },
  ];
}
