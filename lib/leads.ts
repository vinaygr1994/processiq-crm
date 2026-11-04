import { PROJECTS, SOURCES } from "./stages";

export interface LeadIn { name: string; email: string; phone: string; project: string; budget: string; address: string; note: string; source: string }
type Bag = Record<string, unknown>;

const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").trim();
const pick = (o: Bag, ...keys: string[]) => { for (const k of keys) { const v = s(o[k]); if (v) return v; } return ""; };

/** Flatten the shapes that ad platforms and form tools send into one plain object. */
function flatten(raw: Bag): Bag {
  const out: Bag = { ...raw };
  // Google Ads lead form webhook: user_column_data: [{ column_id, string_value }]
  const cols = raw.user_column_data;
  if (Array.isArray(cols)) for (const c of cols as Bag[]) { const k = s(c.column_id || c.column_name).toLowerCase(); if (k) out[k] = c.string_value; }
  // Facebook lead payloads: field_data: [{ name, values: [...] }]
  const fd = raw.field_data;
  if (Array.isArray(fd)) for (const c of fd as Bag[]) { const k = s(c.name).toLowerCase(); const v = Array.isArray(c.values) ? c.values[0] : c.values; if (k) out[k] = v; }
  return out;
}

export function matchSource(raw: string, fallback = "Website form") {
  const t = raw.toLowerCase();
  if (!t) return fallback;
  if (/google|gads|adwords/.test(t)) return "Google Ads";
  if (/facebook|instagram|meta|\bfb\b/.test(t)) return "Facebook / Instagram";
  if (/angi|homeadvisor|home advisor/.test(t)) return "Angi / HomeAdvisor";
  if (/yelp|houzz/.test(t)) return "Yelp / Houzz";
  return SOURCES.find((x) => x.toLowerCase() === t) ?? (raw.length <= 40 ? raw : fallback);
}
export function matchProject(raw: string) {
  const t = raw.toLowerCase();
  if (!t) return "Other";
  const rules: [RegExp, string][] = [[/kitchen/, "Kitchen remodel"], [/bath|shower|toilet|washroom/, "Bathroom remodel"], [/basement/, "Basement finishing"], [/addition|extension/, "Home addition"], [/whole|full home|entire/, "Whole-home renovation"], [/roof|siding|exterior|deck|fence/, "Roofing / exterior"], [/floor|tile|hardwood|carpet/, "Flooring"]];
  return rules.find(([r]) => r.test(t))?.[1] ?? PROJECTS.find((p) => p.toLowerCase() === t) ?? "Other";
}

export function normalizeLead(raw: Bag, defaultSource = "Website form"): LeadIn | { error: string } {
  const o = flatten(raw);
  const first = pick(o, "first_name", "firstname", "first"), last = pick(o, "last_name", "lastname", "last");
  const name = pick(o, "name", "full_name", "fullname", "your name") || [first, last].filter(Boolean).join(" ");
  const email = pick(o, "email", "email_address", "work_email").toLowerCase();
  const phone = pick(o, "phone", "phone_number", "mobile", "tel", "telephone");
  if (!name && !email && !phone) return { error: "Send at least a name, email or phone." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email address doesn't look right." };
  const city = pick(o, "city"), street = pick(o, "address", "street_address", "street"), zip = pick(o, "zip", "zip_code", "postal_code", "post_code");
  const projectRaw = pick(o, "project", "project_type", "service", "service_type", "job_type", "what_do_you_need", "category", "task");
  return {
    name: (name || email || phone).slice(0, 120), email: email.slice(0, 200), phone: phone.slice(0, 40),
    project: matchProject(projectRaw), budget: pick(o, "budget").slice(0, 60),
    address: [street, city, zip].filter(Boolean).join(", ").slice(0, 200),
    note: [pick(o, "message", "notes", "comments", "description", "details"), projectRaw && matchProject(projectRaw) === "Other" ? `Project: ${projectRaw}` : ""].filter(Boolean).join("\n").slice(0, 2000),
    source: matchSource(pick(o, "source", "utm_source", "lead_source", "platform"), defaultSource),
  };
}
