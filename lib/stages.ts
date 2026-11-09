import type { Stage } from "./types";

/** Legacy stage list kept for older code paths. Pipelines now live in lib/pipelines.ts. */
export const STAGES: { id: Stage; label: string; hint: string; dot: string; step: number }[] = [
  { id: "new", label: "New lead", hint: "Just came in", dot: "bg-iris", step: 0 },
  { id: "contacted", label: "Contacted", hint: "First reply done", dot: "bg-sky-500", step: 1 },
  { id: "visit_booked", label: "Visit booked", hint: "On the calendar", dot: "bg-sun", step: 2 },
  { id: "visit_done", label: "Visit done", hint: "Measured & discussed", dot: "bg-amber-600", step: 2 },
  { id: "quoted", label: "Quote sent", hint: "Waiting for a decision", dot: "bg-teal", step: 3 },
  { id: "won", label: "Won", hint: "Contract signed", dot: "bg-emerald-500", step: 4 },
  { id: "completed", label: "Job complete", hint: "Review & referral", dot: "bg-green-700", step: 5 },
  { id: "lost", label: "Lost", hint: "Kept warm for later", dot: "bg-slate-400", step: 4 },
];
/** The six steps shown in the demo: Enquiry → Reply → Visit → Quote → Decision → Review */
export const JOURNEY = ["Enquiry", "Reply", "Visit", "Quote", "Decision", "Review"];
export const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)?.label ?? s;
export const isOpen = (s: Stage) => !["won", "completed", "lost"].includes(s);
export const isActive = (s: Stage) => s !== "lost" && s !== "completed";

export const PROJECTS = ["General enquiry", "Consultation", "Pricing or quote", "Booking", "Membership", "Partnership", "Other"];
export const BUDGETS = ["Under $10k", "$10–30k", "$30–60k", "$60–100k", "$100k+", "Not sure yet"];
export const SOURCES = ["Website form", "Google Ads", "Google search", "Facebook / Instagram", "Referral", "Phone call", "Email", "Walk-in", "Event", "Repeat customer", "Other"];
export const LOST_REASONS = ["Chose a competitor", "Price too high", "Not the right time", "No response", "Not a good fit", "Out of our area", "Other"];
