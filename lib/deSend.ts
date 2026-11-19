// Sending to data extensions, like SFMC Email Studio: pick sendable DEs as the audience (and DEs to exclude).
// Each row is matched to a contact through the DE's send relationship (Email, Phone or Contact ID).
// Rows with a new email address become contacts at send time, the way SFMC adds them to All Subscribers,
// so unsubscribes, bounces and suppression work exactly as for any other contact.
import type { Contact, DataExtension, DeRow } from "./types";

export const DE = "de:";
type Vars = Record<string, string>;

/** Every DE field as a merge field: {{FirstName}}, {{City}}… (keys are lower-cased, like all merge fields). */
export function rowVars(de: DataExtension, row: DeRow): Vars {
  const v: Vars = {};
  for (const f of de.fields) {
    const k = f.name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    // Blank cells are skipped, so {{first_name}} falls back to the contact's name instead of going empty.
    if (k && row.data[f.name] != null && String(row.data[f.name]).trim() !== "") v[k] = String(row.data[f.name]).slice(0, 300);
  }
  return v;
}
const digits = (s: string) => s.replace(/\D/g, "").slice(-10);
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
export const canSend = (de: DataExtension) => de.sendable && !!de.link?.field;

export interface DeMember { contact: Contact; vars: Vars }
export interface DeNew { email: string; name: string; phone: string; source: string; vars: Vars }

/** Who the chosen DEs reach: existing contacts (with their row's merge fields) and new addresses to add as contacts. */
export function deMembers(deIds: string[], des: DataExtension[], rows: DeRow[], contacts: Contact[]) {
  const byEmail = new Map(contacts.filter((c) => c.email).map((c) => [c.email.toLowerCase(), c]));
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const byPhone = new Map(contacts.filter((c) => c.phone).map((c) => [digits(c.phone), c]));
  const matched: DeMember[] = [], fresh: DeNew[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const id of deIds) {
    const de = des.find((d) => d.id === id);
    if (!de || !canSend(de)) continue;
    const { field, to } = de.link!;
    const nameF = de.fields.find((f) => /^(full)?_?name$/i.test(f.name)) ?? de.fields.find((f) => /first/i.test(f.name));
    const lastF = de.fields.find((f) => /last/i.test(f.name));
    const phoneF = de.fields.find((f) => f.type === "phone");
    for (const r of rows) {
      if (r.de_id !== id) continue;
      const key = String(r.data[field] ?? "").trim();
      if (!key) { skipped++; continue; }
      const c = to === "email" ? byEmail.get(key.toLowerCase()) : to === "id" ? byId.get(key) : byPhone.get(digits(key));
      const vars = rowVars(de, r);
      if (c) {
        if (seen.has(c.id)) continue;
        seen.add(c.id); matched.push({ contact: c, vars });
      } else if (to === "email" && EMAIL.test(key)) {
        const e = key.toLowerCase();
        if (seen.has(e)) continue;
        seen.add(e);
        const name = [nameF && r.data[nameF.name], lastF && r.data[lastF.name]].filter(Boolean).join(" ").trim() || e.split("@")[0];
        fresh.push({ email: e, name, phone: phoneF ? String(r.data[phoneF.name] ?? "") : "", source: de.name, vars });
      } else skipped++;
    }
  }
  return { matched, fresh, skipped };
}

/** Email addresses (lower case) in the given DEs, for exclusions. */
export function deEmails(deIds: string[], des: DataExtension[], rows: DeRow[], contacts: Contact[]): Set<string> {
  const { matched, fresh } = deMembers(deIds, des, rows, contacts);
  return new Set([...matched.map((m) => m.contact.email.toLowerCase()), ...fresh.map((f) => f.email)]);
}

/** Contact fields for a new contact made from a DE row. */
export const newContact = (n: DeNew) => ({ name: n.name, email: n.email, phone: n.phone, company: "", tags: [] as string[], source: `Data extension: ${n.source}`, unsubscribed: false, owner: "" });

/** Fills any merge field from vars ({{FirstName}}, {{city}}…); unknown ones are left for the standard fill. */
export const fillVars = (t: string, v: Vars) => t.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (m, k: string) => v[k.toLowerCase()] ?? m);
