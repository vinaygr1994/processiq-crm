import { isEmail } from "./format";
import type { Contact, DataExtension, DeField, DeFieldType, DeRow } from "./types";

export const DE_TYPES: { id: DeFieldType; label: string }[] = [
  { id: "text", label: "Text" }, { id: "number", label: "Number" }, { id: "decimal", label: "Decimal" }, { id: "date", label: "Date" },
  { id: "boolean", label: "Boolean" }, { id: "email", label: "EmailAddress" }, { id: "phone", label: "Phone" },
];
export const typeLabel = (t: DeFieldType) => DE_TYPES.find((x) => x.id === t)?.label ?? t;
export const keyOf = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "data_extension";
export const MAX_ROWS = 5000;

type Tpl = Pick<DataExtension, "name" | "description" | "fields" | "sendable" | "link"> & { blurb: string };
const f = (name: string, type: DeFieldType, o: Partial<DeField> = {}): DeField => ({ name, type, ...(type === "text" ? { length: 100 } : {}), ...o });
export const DE_TEMPLATES: Tpl[] = [
  { name: "Subscribers", blurb: "Sendable audience keyed by email", description: "People you can send to.", sendable: true, link: { field: "Email", to: "email" },
    fields: [f("Email", "email", { primary: true, required: true }), f("FirstName", "text"), f("LastName", "text"), f("Phone", "phone"), f("City", "text"), f("SignupDate", "date")] },
  { name: "Appointments", blurb: "One row per booking or visit", description: "Upcoming and past appointments.", sendable: true, link: { field: "Email", to: "email" },
    fields: [f("AppointmentId", "text", { primary: true, required: true }), f("Email", "email", { required: true }), f("FirstName", "text"), f("Service", "text"), f("AppointmentDate", "date"), f("Amount", "decimal"), f("Confirmed", "boolean", { default: "false" })] },
  { name: "Orders", blurb: "Purchases for follow-ups and win-backs", description: "One row per order.", sendable: false, link: { field: "Email", to: "email" },
    fields: [f("OrderId", "text", { primary: true, required: true }), f("Email", "email", { required: true }), f("OrderDate", "date"), f("Product", "text"), f("Quantity", "number"), f("Total", "decimal")] },
  { name: "Event registrations", blurb: "Sign-ups for a class, webinar or open day", description: "One row per registration.", sendable: true, link: { field: "Email", to: "email" },
    fields: [f("Email", "email", { primary: true, required: true }), f("FirstName", "text"), f("Event", "text"), f("EventDate", "date"), f("Attended", "boolean", { default: "false" })] },
];

/** Cleans one value for its field type. Returns an error message when it can't be stored. */
export function coerce(fl: DeField, raw: string | undefined): { v: string; err?: string } {
  let v = (raw ?? "").trim();
  if (!v && fl.default) v = fl.default;
  if (!v) return fl.required || fl.primary ? { v, err: `${fl.name} is required` } : { v };
  switch (fl.type) {
    case "number": return /^-?\d+$/.test(v) ? { v } : { v, err: `${fl.name} must be a whole number` };
    case "decimal": { const n = Number(v.replace(/[$,]/g, "")); return Number.isFinite(n) ? { v: String(n) } : { v, err: `${fl.name} must be a number` }; }
    case "boolean": { const l = v.toLowerCase(); if (["true", "1", "yes", "y"].includes(l)) return { v: "true" }; if (["false", "0", "no", "n"].includes(l)) return { v: "false" }; return { v, err: `${fl.name} must be true or false` }; }
    case "date": { const d = new Date(v); return isNaN(+d) ? { v, err: `${fl.name} must be a date` } : { v: /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d.toISOString().slice(0, 10) }; }
    case "email": return isEmail(v) ? { v: v.toLowerCase() } : { v, err: `${fl.name} must be an email address` };
    case "text": return fl.length && v.length > fl.length ? { v, err: `${fl.name} is longer than ${fl.length} characters` } : { v };
    default: return { v };
  }
}
export function cleanRow(de: DataExtension, raw: Record<string, string>): { data: Record<string, string>; errors: string[] } {
  const data: Record<string, string> = {}, errors: string[] = [];
  for (const fl of de.fields) { const r = coerce(fl, raw[fl.name]); if (r.err) errors.push(r.err); data[fl.name] = r.v; }
  return { data, errors };
}
export const pkOf = (de: DataExtension, data: Record<string, string>) => de.fields.filter((x) => x.primary).map((x) => (data[x.name] ?? "").toLowerCase()).join("\u0001");

export type DeOp = "eq" | "neq" | "contains" | "starts" | "gt" | "lt" | "empty" | "notempty";
export interface DeRule { field: string; op: DeOp; value: string }
export const DE_OPS: { id: DeOp; label: string; noValue?: boolean }[] = [
  { id: "eq", label: "is equal to" }, { id: "neq", label: "is not equal to" }, { id: "contains", label: "contains" }, { id: "starts", label: "starts with" },
  { id: "gt", label: "is greater than / after" }, { id: "lt", label: "is less than / before" }, { id: "empty", label: "is empty", noValue: true }, { id: "notempty", label: "is not empty", noValue: true },
];
export function matches(de: DataExtension, row: DeRow, rules: DeRule[]) {
  return rules.every((r) => {
    const fl = de.fields.find((x) => x.name === r.field); if (!fl) return true;
    const a = (row.data[r.field] ?? "").trim(), b = r.value.trim();
    const num = fl.type === "number" || fl.type === "decimal";
    const cmp = num ? Number(a) - Number(b) : a.toLowerCase().localeCompare(b.toLowerCase());
    switch (r.op) {
      case "eq": return num ? a !== "" && cmp === 0 : a.toLowerCase() === b.toLowerCase();
      case "neq": return num ? cmp !== 0 : a.toLowerCase() !== b.toLowerCase();
      case "contains": return a.toLowerCase().includes(b.toLowerCase());
      case "starts": return a.toLowerCase().startsWith(b.toLowerCase());
      case "gt": return a !== "" && cmp > 0;
      case "lt": return a !== "" && cmp < 0;
      case "empty": return a === "";
      case "notempty": return a !== "";
    }
  });
}

const digits = (s: string) => s.replace(/\D/g, "").slice(-10);
/** Rows in a linked data extension that belong to this contact. */
export function rowsFor(de: DataExtension, rows: DeRow[], c: Contact) {
  if (!de.link) return [];
  const want = de.link.to === "email" ? c.email.toLowerCase() : de.link.to === "phone" ? digits(c.phone) : c.id;
  if (!want) return [];
  return rows.filter((r) => r.de_id === de.id && (de.link!.to === "phone" ? digits(r.data[de.link!.field] ?? "") : (r.data[de.link!.field] ?? "").toLowerCase()) === want);
}
export const toCsv = (de: DataExtension, rows: DeRow[]) => {
  const cell = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  return [de.fields.map((x) => cell(x.name)).join(","), ...rows.map((r) => de.fields.map((x) => cell(r.data[x.name] ?? "")).join(","))].join("\n");
};
