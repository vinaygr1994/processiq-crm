import type { CrmObject, FieldType, ObjField } from "./types";

export const FIELD_TYPES: { id: FieldType; label: string }[] = [
  { id: "text", label: "Short text" },
  { id: "textarea", label: "Long text" },
  { id: "number", label: "Number" },
  { id: "currency", label: "Amount ($)" },
  { id: "date", label: "Date" },
  { id: "datetime", label: "Date and time" },
  { id: "select", label: "Dropdown" },
  { id: "checkbox", label: "Yes / no" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "url", label: "Link" },
];

export const ICONS = ["calendar", "users", "heart", "dumbbell", "stethoscope", "briefcase", "home", "key", "box", "shield", "star", "note", "clock", "tag", "building", "layers"];
export const COLORS = ["#0b8a8a", "#5a5bef", "#ec5b7f", "#e8a317", "#2f9e5c", "#3b82f6", "#8b5cf6", "#64748b"];

export const keyOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "field";

type Tpl = Omit<CrmObject, "id" | "created_at"> & { blurb: string };
const f = (label: string, type: FieldType, options?: string[]): ObjField => ({ key: keyOf(label), label, type, ...(options ? { options } : {}) });

/** Starting points for common industries. Everything can be edited after it's created. */
export const TEMPLATES: Tpl[] = [
  { name: "Consultation", plural: "Consultations", icon: "stethoscope", color: "#5a5bef", link_contact: true, link_deal: true, blurb: "Clinics, med spas, advisors",
    statuses: ["Requested", "Scheduled", "Completed", "No-show", "Cancelled"],
    fields: [f("Date and time", "datetime"), f("Type", "select", ["In person", "Video call", "Phone"]), f("Practitioner", "text"), f("Reason for visit", "textarea"), f("Fee", "currency"), f("Intake form received", "checkbox")] },
  { name: "Class booking", plural: "Class bookings", icon: "dumbbell", color: "#ec5b7f", link_contact: true, link_deal: false, blurb: "Gyms, yoga, studios",
    statuses: ["Booked", "Attended", "No-show", "Cancelled"],
    fields: [f("Class", "select", ["Yoga", "Strength", "HIIT", "Pilates", "Spin"]), f("Date and time", "datetime"), f("Instructor", "text"), f("Trial class", "checkbox"), f("Notes", "textarea")] },
  { name: "Treatment", plural: "Treatments", icon: "heart", color: "#e8a317", link_contact: true, link_deal: true, blurb: "Cosmetic, physio, wellness",
    statuses: ["Planned", "In progress", "Completed", "Follow-up due"],
    fields: [f("Treatment", "text"), f("Area", "text"), f("Session number", "number"), f("Date", "date"), f("Price", "currency"), f("Aftercare notes", "textarea")] },
  { name: "Property viewing", plural: "Property viewings", icon: "key", color: "#2f9e5c", link_contact: true, link_deal: true, blurb: "Real estate, rentals",
    statuses: ["Requested", "Confirmed", "Viewed", "Offer made", "Not interested"],
    fields: [f("Address", "text"), f("Date and time", "datetime"), f("Listing price", "currency"), f("Bedrooms", "number"), f("Listing link", "url"), f("Feedback", "textarea")] },
  { name: "Project", plural: "Projects", icon: "briefcase", color: "#3b82f6", link_contact: true, link_deal: true, blurb: "Agencies, contractors, B2B",
    statuses: ["Not started", "In progress", "On hold", "Delivered"],
    fields: [f("Start date", "date"), f("Due date", "date"), f("Budget", "currency"), f("Scope", "textarea"), f("Priority", "select", ["Low", "Medium", "High"])] },
  { name: "Service request", plural: "Service requests", icon: "shield", color: "#8b5cf6", link_contact: true, link_deal: false, blurb: "Support, repairs, maintenance",
    statuses: ["New", "Assigned", "Waiting on customer", "Resolved"],
    fields: [f("Category", "select", ["Question", "Problem", "Repair", "Billing"]), f("Priority", "select", ["Low", "Normal", "Urgent"]), f("Description", "textarea"), f("Due date", "date")] },
];

/** Status colours: last two statuses read as "closed" (done / lost) by default. */
export function statusTone(o: CrmObject, s: string): "teal" | "iris" | "green" | "gray" | "sun" {
  const i = o.statuses.indexOf(s);
  if (/cancel|no-show|not interested|lost/i.test(s)) return "gray";
  if (/complete|attended|delivered|resolved|viewed|done|won/i.test(s)) return "green";
  if (i === 0) return "sun";
  return i < 0 ? "gray" : "iris";
}

export function showValue(fl: ObjField, v: string | undefined): string {
  if (v == null || v === "") return "";
  if (fl.type === "checkbox") return v === "Yes" || v === "true" ? "Yes" : "No";
  if (fl.type === "currency") { const n = Number(v); return Number.isFinite(n) ? `$${n.toLocaleString()}` : v; }
  if (fl.type === "datetime") { const d = new Date(v); return isNaN(+d) ? v : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  if (fl.type === "date") { const d = new Date(v + "T12:00"); return isNaN(+d) ? v : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  return v;
}
