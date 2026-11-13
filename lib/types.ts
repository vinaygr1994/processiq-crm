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
  /** Record owner (team member name). Migration 012. */
  owner?: string;
  custom?: Record<string, string>;
  created_at: string;
  sms_opt_out?: boolean;
  /** Why email is suppressed: "" (active), "unsubscribed", "bounced", "complaint", "suppressed" (on the suppression list), "manual". Migration 016. */
  email_status?: string;
  unsub_reason?: string;
  unsub_at?: string | null;
}
/** An address that must never get marketing email, whether or not it is a contact. */
export interface Suppression { id: string; email: string; reason: string; created_at: string }
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
  /** Migration 011: which pipeline, expected close date, priority. */
  pipeline?: string;
  close_date?: string | null;
  priority?: string;
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
export type AssetKind = "email" | "template" | "block" | "image" | "folder";
/** A Content Builder asset. body: email/template/block = design or text; image = public URL; folder = unused. Migration 017 adds kind, folder, updated_at. */
export interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  kind?: AssetKind;
  folder?: string;
  updated_at?: string;
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
  demo_ids?: Record<string, string[]> | null;
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
  /** Sales pipelines and industry (migration 011). */
  pipelines?: import("./pipelines").Pipeline[];
  industry?: string;
  interests?: string[];
  /** Online booking page (migration 010). */
  booking?: Partial<BookingSettings>;
  created_at: string;
}
export interface Hours { day: number; open: string; close: string }
export interface BookingSettings { enabled: boolean; slug: string; intro: string; hours: Hours[]; lead_hours: number; interval: number; window_days: number }
export interface ClassSlot { day: number; time: string; staff: string }
export interface Service { id: string; name: string; kind: "appointment" | "class"; duration: number; price: number; capacity: number; color: string; description: string; staff: string[]; schedule: ClassSlot[]; active: boolean; created_at: string }
export type BookingStatus = "booked" | "checked_in" | "cancelled" | "no_show";
export interface Booking { id: string; service_id: string | null; contact_id: string | null; staff: string; starts_at: string; ends_at: string; status: BookingStatus; source: string; membership_id: string | null; note: string; created_at: string }
export interface Plan { id: string; name: string; kind: "unlimited" | "pack"; price: number; sessions: number; months: number; active: boolean; created_at: string }
export interface Membership { id: string; contact_id: string; plan_id: string | null; status: "active" | "expired" | "cancelled"; credits: number | null; starts_on: string; ends_on: string | null; created_at: string }

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

export interface SegmentRule {
  field: "tag" | "email" | "phone" | "company" | "source" | "created" | "unsubscribed" | "opened" | "clicked" | "received" | "campaign" | "deal_stage" | "deal_value" | "deals" | "journey";
  op: string;
  value: string;
}
export interface Segment { id: string; name: string; match: "all" | "any"; rules: SegmentRule[]; created_at: string }
export interface FormDef { id: string; name: string; slug: string; status: "draft" | "published"; config: unknown; created_at: string }
export interface FormSubmission { id: string; form_id: string; contact_id: string | null; data: Record<string, string>; created_at: string }
export type Role = "owner" | "admin" | "manager" | "rep" | "viewer";
export interface Member { id: string; org_id: string; user_id: string | null; email: string; name: string; role: Exclude<Role, "owner">; status: "invited" | "active" | "disabled"; own_only: boolean; created_at: string }
export type FieldType = "text" | "textarea" | "number" | "currency" | "date" | "datetime" | "select" | "checkbox" | "email" | "phone" | "url";
export interface ObjField { key: string; label: string; type: FieldType; options?: string[]; required?: boolean }
export interface CrmObject { id: string; name: string; plural: string; icon: string; color: string; fields: ObjField[]; statuses: string[]; link_contact: boolean; link_deal: boolean; created_at: string }
export interface CrmRecord { id: string; object_id: string; contact_id: string | null; deal_id: string | null; title: string; status: string; assigned_to: string; data: Record<string, string>; created_at: string }
export type Channel = "sms" | "whatsapp";
export interface Message { id: string; contact_id: string | null; channel: Channel; direction: "in" | "out"; phone: string; body: string; template: string; status: string; error: string; provider_id: string; read: boolean; created_at: string }

export type DeFieldType = "text" | "number" | "decimal" | "date" | "boolean" | "email" | "phone";
export interface DeField { name: string; type: DeFieldType; length?: number; primary?: boolean; required?: boolean; default?: string }
/** Links a data extension to contacts: rows whose `field` equals the contact's email, phone or id belong to that contact. */
export interface DeLink { field: string; to: "email" | "phone" | "id" }
export interface DataExtension { id: string; name: string; external_key: string; description: string; folder: string; fields: DeField[]; sendable: boolean; link: DeLink | null; created_at: string }
export interface DeRow { id: string; de_id: string; data: Record<string, string>; created_at: string }

export interface Tables {
  suppressions: Suppression;
  data_extensions: DataExtension;
  de_rows: DeRow;
  messages: Message;
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
  segments: Segment;
  forms: FormDef;
  form_submissions: FormSubmission;
  services: Service;
  bookings: Booking;
  plans: Plan;
  memberships: Membership;
  org_members: Member;
  objects: CrmObject;
  records: CrmRecord;
}
export type TableName = keyof Tables;
export type Rows = { [K in TableName]: Tables[K][] };
export type NewRow<T extends TableName> = Omit<Tables[T], "id" | "created_at">;
