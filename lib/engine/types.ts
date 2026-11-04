export type TriggerType = "lead_created" | "stage_changed" | "visit_booked" | "visit_done" | "visit_no_show" | "quote_sent" | "manual";
export interface Trigger { type: TriggerType; stage?: string; source?: string }

export type CondField = "deal.stage" | "deal.source" | "deal.project" | "deal.value" | "deal.rep" | "deal.budget" | "contact.email" | "contact.phone" | "contact.tags" | "visit.status" | "visit.priority";
export type CondOp = "is" | "is_not" | "contains" | "gt" | "lt" | "empty" | "not_empty";
export interface Cond { field: CondField; op: CondOp; value?: string }

interface Base { id: string }
export type Step =
  | (Base & { type: "email"; subject: string; body: string; marketing?: boolean })
  | (Base & { type: "sms"; body: string })
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
  | (Base & { type: "if"; cond: Cond; then: Step[]; else: Step[] });

export const uid = () => Math.random().toString(36).slice(2, 10);
