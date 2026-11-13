export type TriggerType =
  | "lead_created" | "stage_changed" | "visit_booked" | "visit_done" | "visit_no_show" | "quote_sent" | "manual"
  // Contact-based entry sources (journeys)
  | "contact_created" | "tag_added" | "audience" | "segment" | "form_submitted"
  // Bookings
  | "booking_made" | "booking_checked_in" | "booking_no_show";
/** source: lead/contact source filter. tag: for tag_added and audience ("" = everyone with an email). */
export interface Trigger {
  type: TriggerType; stage?: string; source?: string; tag?: string; segment?: string; form?: string; service?: string;
  /** Journey settings. once = a contact can only ever enter once; after_exit = again, but only once they've left; event (default) = once per event. */
  reentry?: "event" | "once" | "after_exit";
  /** Journey goal: people who meet it leave and count as converted. (Exit criteria live on the workflow.) */
  goal?: Cond[];
  /** Journey version shown in the builder; bumps each time a running journey is changed and saved. */
  version?: number;
}

export type ContactField = "company" | "source" | "owner" | "unsubscribed" | "sms_opt_out";
export type CondField = "deal.stage" | "deal.source" | "deal.project" | "deal.value" | "deal.rep" | "deal.budget" | "contact.email" | "contact.phone" | "contact.tags" | "contact.company" | "contact.source" | "contact.unsubscribed" | "visit.status" | "visit.priority";
export type CondOp = "is" | "is_not" | "contains" | "gt" | "lt" | "empty" | "not_empty";
export interface Cond { field: CondField; op: CondOp; value?: string }

interface Base { id: string }
/** One outgoing path of a split. cond null = "everyone else". pct is used by random (A/B) splits. */
export interface Path { id: string; label: string; cond?: Cond | null; pct?: number; steps: Step[] }
export type Step =
  | (Base & { type: "email"; subject: string; body: string; marketing?: boolean })
  | (Base & { type: "sms"; body: string })
  /** WhatsApp: free text inside the 24-hour window, or an approved template (params = merge text, one per {{n}}). */
  | (Base & { type: "whatsapp"; body: string; template?: string; lang?: string; params?: string[] })
  /** Join: send people on to another activity in this journey. */
  | (Base & { type: "join"; target: string })
  /** Update contact: set one field on the contact. */
  | (Base & { type: "update"; field: ContactField; value: string })
  | (Base & { type: "task"; title: string; days: number })
  | (Base & { type: "stage"; stage: string })
  | (Base & { type: "tag"; tag: string; remove?: boolean })
  | (Base & { type: "notify"; message: string })
  | (Base & { type: "assign" })
  | (Base & { type: "noshow" })
  | (Base & { type: "log"; message: string })
  | (Base & { type: "wait"; mode: "delay"; amount: number; unit: "minutes" | "hours" | "days" })
  | (Base & { type: "wait"; mode: "until"; ref: "visit_start" | "quote_sent"; offset: number; late: "skip" | "run" | "stop" })
  | (Base & { type: "wait"; mode: "time"; time: string })
  /** Wait until a date and time (in the account's time zone, "YYYY-MM-DDTHH:mm"). */
  | (Base & { type: "wait"; mode: "date"; date: string })
  | (Base & { type: "if"; cond: Cond; then: Step[]; else: Step[] })
  /** Decision split: first path whose condition matches. */
  | (Base & { type: "split"; paths: Path[] })
  /** Random split: sends people down paths by percentage (A/B tests). */
  | (Base & { type: "ab"; paths: Path[] })
  /** Engagement split: did they open / click an earlier email in this journey? paths[0] = yes, paths[1] = no. */
  | (Base & { type: "engage"; ref: string; event: "open" | "click"; paths: Path[] });

export type Branching = Extract<Step, { type: "if" | "split" | "ab" | "engage" }>;
/** The step lists a branching step leads to, in order. */
export function branches(s: Step): Step[][] | null {
  if (s.type === "if") return [s.then, s.else];
  if (s.type === "split" || s.type === "ab" || s.type === "engage") return s.paths.map((p) => p.steps);
  return null;
}

export const uid = () => Math.random().toString(36).slice(2, 10);
