// Smart segments: lists that keep themselves up to date from rules about contacts, their emails,
// their deals and their journeys. Pure functions, used by the browser and the engine.
import type { Contact, Deal, EmailLog, Segment, SegmentRule, WorkflowRun } from "./types";

export type FieldKind = "tag" | "text" | "choice" | "days" | "bool" | "number" | "campaign" | "journey" | "stage";
export interface FieldDef { id: SegmentRule["field"]; label: string; group: string; kind: FieldKind; ops: { id: string; label: string }[] }

const DAYS_OPS = [{ id: "within", label: "in the last" }, { id: "not_within", label: "not in the last" }];
export const FIELDS: FieldDef[] = [
  { id: "tag", label: "List / tag", group: "Contact", kind: "tag", ops: [{ id: "has", label: "is on" }, { id: "not_has", label: "is not on" }] },
  { id: "email", label: "Email address", group: "Contact", kind: "bool", ops: [{ id: "set", label: "is known" }, { id: "not_set", label: "is missing" }] },
  { id: "phone", label: "Phone number", group: "Contact", kind: "bool", ops: [{ id: "set", label: "is known" }, { id: "not_set", label: "is missing" }] },
  { id: "company", label: "Company", group: "Contact", kind: "text", ops: [{ id: "contains", label: "contains" }, { id: "is", label: "is" }, { id: "set", label: "is known" }, { id: "not_set", label: "is missing" }] },
  { id: "source", label: "Source", group: "Contact", kind: "text", ops: [{ id: "is", label: "is" }, { id: "is_not", label: "is not" }] },
  { id: "created", label: "Added to the CRM", group: "Contact", kind: "days", ops: DAYS_OPS },
  { id: "unsubscribed", label: "Email status", group: "Contact", kind: "bool", ops: [{ id: "subscribed", label: "is subscribed" }, { id: "unsubscribed", label: "has unsubscribed" }] },
  { id: "opened", label: "Opened an email", group: "Email engagement", kind: "days", ops: DAYS_OPS },
  { id: "clicked", label: "Clicked an email", group: "Email engagement", kind: "days", ops: DAYS_OPS },
  { id: "received", label: "Was sent an email", group: "Email engagement", kind: "days", ops: DAYS_OPS },
  { id: "campaign", label: "A specific send", group: "Email engagement", kind: "campaign", ops: [{ id: "received", label: "received" }, { id: "opened", label: "opened" }, { id: "clicked", label: "clicked" }, { id: "not_opened", label: "received but didn't open" }] },
  { id: "deal_stage", label: "Has a deal in stage", group: "Deals", kind: "stage", ops: [{ id: "has", label: "yes" }, { id: "not_has", label: "no" }] },
  { id: "deal_value", label: "Total deal value", group: "Deals", kind: "number", ops: [{ id: "gt", label: "is more than" }, { id: "lt", label: "is less than" }] },
  { id: "deals", label: "Number of deals", group: "Deals", kind: "number", ops: [{ id: "gt", label: "is more than" }, { id: "lt", label: "is less than" }, { id: "eq", label: "is exactly" }] },
  { id: "journey", label: "Journey", group: "Journeys", kind: "journey", ops: [{ id: "in", label: "is in" }, { id: "done", label: "has finished" }, { id: "never", label: "has never been in" }] },
];
export const fieldDef = (id: string) => FIELDS.find((f) => f.id === id) ?? FIELDS[0];
export const newRule = (): SegmentRule => ({ field: "tag", op: "has", value: "" });

export interface SegCtx { now: number; emails: Map<string, EmailLog[]>; deals: Map<string, Deal[]>; runs: Map<string, WorkflowRun[]> }
export function segCtx(emails: EmailLog[], deals: Deal[], runs: WorkflowRun[], now = Date.now()): SegCtx {
  const group = <T,>(rows: T[], key: (r: T) => string | null) => { const m = new Map<string, T[]>(); for (const r of rows) { const k = key(r); if (k) m.set(k, [...(m.get(k) ?? []), r]); } return m; };
  return { now, emails: group(emails.filter((e) => e.status !== "failed"), (e) => e.contact_id), deals: group(deals, (d) => d.contact_id), runs: group(runs, (r) => r.contact_id) };
}

const DAY = 86_400_000;
function ruleMatches(c: Contact, r: SegmentRule, x: SegCtx): boolean {
  const v = (r.value ?? "").trim(), n = Number(v) || 0;
  const recent = (iso: string | null | undefined) => !!iso && x.now - new Date(iso).getTime() <= n * DAY;
  const days = (hit: boolean) => (r.op === "within" ? hit : !hit);
  const em = x.emails.get(c.id) ?? [], ds = x.deals.get(c.id) ?? [], rs = x.runs.get(c.id) ?? [];
  switch (r.field) {
    case "tag": return r.op === "has" ? c.tags.includes(v.toLowerCase()) : !c.tags.includes(v.toLowerCase());
    case "email": return r.op === "set" ? !!c.email : !c.email;
    case "phone": return r.op === "set" ? !!c.phone : !c.phone;
    case "company": return r.op === "set" ? !!c.company : r.op === "not_set" ? !c.company : r.op === "is" ? c.company.toLowerCase() === v.toLowerCase() : c.company.toLowerCase().includes(v.toLowerCase());
    case "source": return r.op === "is" ? (c.source ?? "").toLowerCase() === v.toLowerCase() : (c.source ?? "").toLowerCase() !== v.toLowerCase();
    case "created": return days(recent(c.created_at));
    case "unsubscribed": return r.op === "unsubscribed" ? !!c.unsubscribed : !c.unsubscribed;
    case "opened": return days(em.some((e) => recent(e.opened_at ?? e.clicked_at)));
    case "clicked": return days(em.some((e) => recent(e.clicked_at)));
    case "received": return days(em.some((e) => recent(e.created_at)));
    case "campaign": {
      const m = em.filter((e) => e.campaign_id === v);
      if (r.op === "received") return m.length > 0;
      if (r.op === "opened") return m.some((e) => e.opened_at || e.clicked_at);
      if (r.op === "clicked") return m.some((e) => e.clicked_at);
      return m.length > 0 && !m.some((e) => e.opened_at || e.clicked_at);
    }
    case "deal_stage": return r.op === "has" ? ds.some((d) => d.stage === v) : !ds.some((d) => d.stage === v);
    case "deal_value": { const total = ds.reduce((a, d) => a + (Number(d.value) || 0), 0); return r.op === "gt" ? total > n : total < n; }
    case "deals": return r.op === "gt" ? ds.length > n : r.op === "lt" ? ds.length < n : ds.length === n;
    case "journey": {
      const mine = rs.filter((q) => q.workflow_id === v);
      return r.op === "in" ? mine.some((q) => q.status === "active") : r.op === "done" ? mine.some((q) => q.status !== "active") : mine.length === 0;
    }
  }
  return false;
}

export function inSegment(c: Contact, s: Pick<Segment, "match" | "rules">, x: SegCtx): boolean {
  const rules = s.rules.filter((r) => r.field);
  if (!rules.length) return false;
  return s.match === "any" ? rules.some((r) => ruleMatches(c, r, x)) : rules.every((r) => ruleMatches(c, r, x));
}
export const segmentMembers = (contacts: Contact[], s: Pick<Segment, "match" | "rules">, x: SegCtx) => contacts.filter((c) => inSegment(c, s, x));

/** "seg:<id>" in a send's list choices means a smart segment. */
export const SEG = "seg:";
export function membersOf(key: string, contacts: Contact[], segments: Segment[], x: SegCtx | null): Contact[] {
  if (!key.startsWith(SEG)) return contacts.filter((c) => c.tags.includes(key));
  const s = segments.find((g) => g.id === key.slice(SEG.length));
  return s && x ? segmentMembers(contacts, s, x) : [];
}
