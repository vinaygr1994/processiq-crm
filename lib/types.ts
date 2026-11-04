export type Stage = "new" | "contacted" | "visit_booked" | "visit_done" | "quoted" | "won" | "completed" | "lost";

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  tags: string[];
  source: string;
  unsubscribed: boolean;
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
  status: "draft" | "sent";
  sent_count: number;
  failed_count: number;
  sent_at: string | null;
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
  created_at: string;
}

export interface Tables {
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
