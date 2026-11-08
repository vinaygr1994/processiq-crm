export type Stage = string;
export type DefaultStage = "new" | "contacted" | "visit_booked" | "visit_done" | "quoted" | "won" | "completed" | "lost";

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  tags: string[];
  source: string;
  unsubscribed: boolean;
  custom?: Record<string, string>;
  created_at: string;
}
export interface Deal {
  id: string;
  title: string;
  value: number;
  stage: Stage;
  contact_id: string | null;
  source: string;
  project: string;
  budget: string;
  address: string;
  rep: string;
  lost_reason: string;
  stage_at: string; // when it entered the current stage
  quote_sent_at: string | null;
  custom?: Record<string, string>;
  created_at: string;
}
export type VisitStatus = "scheduled" | "done" | "no_show" | "cancelled";
export interface Visit {
  id: string;
  deal_id: string;
  contact_id: string | null;
  rep: string;
  starts_at: string;
  status: VisitStatus;
  priority: "" | "hot" | "warm" | "cold";
  result: string;
  created_at: string;
}
export type LogKind = "Lead" | "Routing" | "Auto" | "Task" | "Chase" | "Visit" | "Alert" | "Quote" | "Won" | "Lost" | "Nurture" | "Review" | "Referral" | "Job";
export interface AutoLog {
  id: string;
  deal_id: string | null;
  kind: LogKind;
  message: string;
  tone: "info" | "warn" | "won" | "skip";
  key: string; // makes automations run once per step
  created_at: string;
}
export interface Task {
  id: string;
  title: string;
  due_date: string | null; // YYYY-MM-DD
  done: boolean;
  contact_id: string | null;
  deal_id: string | null;
  created_at: string;
}
export type ActivityKind = "note" | "call" | "meeting";
export interface Activity {
  id: string;
  contact_id: string;
  kind: ActivityKind;
  body: string;
  created_at: string;
}
export interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
}
export interface Campaign {
  id: string;
  name: string;
  subject: string;
  body: string;
  audience: string; // "all" or a tag
  status: "draft" | "scheduled" | "sending" | "sent" | "canceled";
  sent_count: number;
  failed_count: number;
  sent_at: string | null;
  /** Scheduled sends (migration 007). */
  scheduled_at?: string | null;
  spec?: unknown;
  created_at: string;
}
export interface EmailLog {
  id: string;
  contact_id: string | null;
  to_email: string;
  subject: string;
  body: string;
  status: "sent" | "failed" | "demo";
  error: string;
  campaign_id: string | null;
  /** Tracking (needs migration 006). */
  opened_at?: string | null;
  clicked_at?: string | null;
  run_id?: string | null;
  step_id?: string | null;
  created_at: string;
}
export interface Settings {
  id: string;
  business_name: string;
  sender_name: string;
  reply_to: string;
  address: string;
  signature: string;
  reps: string[];
  owner_email: string;
  review_link: string;
  booking_link: string;
  automations_off: string[];
  rr_index: number;
  timezone: string;
  starters_installed: boolean;
  intake_key: string;
  stage_labels: Record<string, string>;
  custom_fields: CustomField[];
  created_at: string;
}

export interface CustomField { id: string; label: string; on: "deal" | "contact"; type: "text" | "number" | "date" | "select"; options?: string[] }

export interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger: import("./engine/types").Trigger;
  steps: import("./engine/types").Step[];
  exit: import("./engine/types").Cond[];
  active: boolean;
  activated_at: string;
  template_id: string;
  created_at: string;
}
export interface WorkflowRun {
  id: string;
  workflow_id: string;
  deal_id: string | null;
  contact_id: string | null;
  visit_id: string | null;
  trigger_key: string;
  pos: number[];
  status: "active" | "done" | "stopped";
  next_run_at: string;
  locked_until: string | null;
  note: string;
  created_at: string;
}

export interface Tables {
  workflows: Workflow;
  workflow_runs: WorkflowRun;
  contacts: Contact;
  deals: Deal;
  visits: Visit;
  autolog: AutoLog;
  tasks: Task;
  activities: Activity;
  templates: Template;
  campaigns: Campaign;
  emails: EmailLog;
  settings: Settings;
}
export type TableName = keyof Tables;
export type Rows = { [K in TableName]: Tables[K][] };
export type NewRow<T extends TableName> = Omit<Tables[T], "id" | "created_at">;
