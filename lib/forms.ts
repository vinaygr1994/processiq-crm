// Forms and landing pages: the form definition, starter forms, validation and what happens on submit.
// Pure, plus one function (handleSubmission) that works against any engine Db (Supabase or demo storage).
import type { Db } from "./engine/engine";
import type { Contact, FormDef } from "./types";

export type FieldType = "text" | "email" | "phone" | "textarea" | "select" | "checkbox" | "date" | "number";
/** Where an answer goes on the contact. "custom" keeps it in the contact's custom fields under `key`. */
export type MapTo = "name" | "email" | "phone" | "company" | "custom" | "none";
export interface FormField { id: string; type: FieldType; label: string; required: boolean; placeholder?: string; options?: string[]; mapTo: MapTo; key?: string; help?: string }
export interface FormPage { enabled: boolean; headline: string; subtext: string; image: string; bullets: string; layout: "side" | "stacked" }
export interface FormConfig {
  title: string; intro: string; button: string;
  fields: FormField[];
  brand: string;
  consent: { enabled: boolean; text: string; required: boolean };
  /** After submit. */
  thanks: string; redirect: string;
  tags: string[]; createDeal: boolean; dealStage: string; notify: boolean;
  page: FormPage;
}

let n = 0;
export const fid = () => `f${Date.now().toString(36)}${(n++).toString(36)}`;
export const F = (type: FieldType, label: string, mapTo: MapTo, required = false, extra: Partial<FormField> = {}): FormField =>
  ({ id: fid(), type, label, required, mapTo, ...(mapTo === "custom" ? { key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) } : {}), ...extra });

export const FIELD_TYPES: { type: FieldType; label: string }[] = [
  { type: "text", label: "Short text" }, { type: "email", label: "Email" }, { type: "phone", label: "Phone" }, { type: "textarea", label: "Long text" },
  { type: "select", label: "Dropdown" }, { type: "checkbox", label: "Checkbox" }, { type: "date", label: "Date" }, { type: "number", label: "Number" },
];

export function blankConfig(): FormConfig {
  return {
    title: "Get in touch", intro: "Leave your details and we'll get back to you within one business day.", button: "Send",
    fields: [F("text", "Full name", "name", true), F("email", "Email", "email", true), F("phone", "Phone", "phone"), F("textarea", "How can we help?", "none")],
    brand: "#0b8a8a", consent: { enabled: true, text: "Send me news and offers by email. I can unsubscribe at any time.", required: false },
    thanks: "Thanks! We've got your details and will be in touch soon.", redirect: "",
    tags: [], createDeal: false, dealStage: "new", notify: true,
    page: { enabled: false, headline: "", subtext: "", image: "", bullets: "", layout: "side" },
  };
}

export interface FormStarter { id: string; name: string; text: string; config: () => FormConfig }
export const FORM_STARTERS: FormStarter[] = [
  { id: "contact", name: "Contact us", text: "Name, email, phone and a message.", config: () => ({ ...blankConfig(), tags: ["enquiry"] }) },
  { id: "quote", name: "Free quote landing page", text: "A landing page with a quote request form that creates a deal.", config: () => ({
    ...blankConfig(), title: "Request your free quote", intro: "Tell us about your project. We'll call you back the same day.", button: "Get my free quote",
    fields: [F("text", "Full name", "name", true), F("phone", "Phone", "phone", true), F("email", "Email", "email", true), F("select", "What do you need?", "custom", true, { options: ["Kitchen", "Bathroom", "Basement", "Addition", "Other"] }), F("text", "Postcode or city", "custom"), F("textarea", "Tell us more", "none")],
    tags: ["lead"], createDeal: true, thanks: "Thanks! We'll call you within one business day to book your free visit.",
    page: { enabled: true, headline: "Renovations done right, on time and on budget", subtext: "Free in-home visit, a fixed-price quote within 48 hours and one project lead from start to finish.", image: "/email/hs-kitchen-navy.jpg", bullets: "Free design visit\nFixed-price quote in 48 hours\n5-year workmanship warranty", layout: "side" },
  }) },
  { id: "newsletter", name: "Newsletter sign-up", text: "Just name and email, added to your newsletter list.", config: () => ({
    ...blankConfig(), title: "Get tips and offers", intro: "One useful email a month. No spam.", button: "Sign me up",
    fields: [F("text", "First name", "name", true), F("email", "Email", "email", true)], tags: ["newsletter"],
    consent: { enabled: true, text: "Yes, send me the newsletter. I can unsubscribe at any time.", required: true }, thanks: "You're on the list. Check your inbox soon.",
  }) },
  { id: "booking", name: "Class or appointment request", text: "Preferred date and time, for studios, clinics and services.", config: () => ({
    ...blankConfig(), title: "Book a session", intro: "Pick a day that suits you and we'll confirm by email.", button: "Request booking",
    fields: [F("text", "Full name", "name", true), F("email", "Email", "email", true), F("phone", "Phone", "phone"), F("select", "Service", "custom", true, { options: ["First visit", "Consultation", "Class", "Other"] }), F("date", "Preferred date", "custom", true), F("select", "Preferred time", "custom", false, { options: ["Morning", "Afternoon", "Evening"] })],
    tags: ["booking-request"], createDeal: true,
    page: { enabled: true, headline: "Your first session is on us", subtext: "Small groups, friendly coaches and flexible times.", image: "/email/fit-stretch.jpg", bullets: "No contract\nAll levels welcome\nFree parking", layout: "side" },
  }) },
  { id: "event", name: "Event registration", text: "Sign-ups for an open house, workshop or webinar.", config: () => ({
    ...blankConfig(), title: "Save your spot", intro: "Places are limited. Register below and we'll send the details.", button: "Register",
    fields: [F("text", "Full name", "name", true), F("email", "Email", "email", true), F("number", "Number of guests", "custom", false), F("checkbox", "I need parking", "custom")], tags: ["event"],
    page: { enabled: true, headline: "Open house: see our latest projects", subtext: "Meet the team, see finished rooms and get ideas for your home.", image: "/email/rs-living3.jpg", bullets: "Saturday, 10am to 2pm\nFree coffee and snacks\nBring your floor plans", layout: "stacked" },
  }) },
];

export function readConfig(f: Pick<FormDef, "config">): FormConfig {
  const c = (f.config ?? {}) as Partial<FormConfig>;
  const b = blankConfig();
  return { ...b, ...c, consent: { ...b.consent, ...(c.consent ?? {}) }, page: { ...b.page, ...(c.page ?? {}) }, fields: Array.isArray(c.fields) ? c.fields : b.fields, tags: Array.isArray(c.tags) ? c.tags : [] };
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "form";
export const newSlug = (name: string) => `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
/** Checks answers against the form. Returns cleaned values (by field id) or an error message. */
export function validate(cfg: FormConfig, raw: Record<string, unknown>): { values: Record<string, string>; consent: boolean } | { error: string } {
  const values: Record<string, string> = {};
  for (const f of cfg.fields) {
    let v = raw[f.id];
    if (f.type === "checkbox") v = v === true || v === "true" || v === "on" ? "Yes" : "";
    const s = String(v ?? "").trim().slice(0, f.type === "textarea" ? 5000 : 300);
    if (f.required && !s) return { error: `Please fill in “${f.label}”.` };
    if (s && f.type === "email" && !isEmail(s)) return { error: "Please enter a valid email address." };
    if (s && f.type === "select" && f.options?.length && !f.options.includes(s)) return { error: `Please choose an option for “${f.label}”.` };
    values[f.id] = s;
  }
  const consent = raw.consent === true || raw.consent === "true" || raw.consent === "on";
  if (cfg.consent.enabled && cfg.consent.required && !consent) return { error: "Please tick the box to continue." };
  if (!cfg.fields.some((f) => (f.mapTo === "email" || f.mapTo === "phone") && values[f.id])) return { error: "Please add an email address or phone number." };
  return { values, consent };
}

const digits = (s: string) => s.replace(/\D/g, "");

/** Saves a submission: finds or creates the contact, tags them, optionally opens a deal, and logs it. */
export async function handleSubmission(db: Db, form: FormDef, values: Record<string, string>, consent: boolean): Promise<{ contactId: string; created: boolean }> {
  const cfg = readConfig(form);
  const pick = (m: MapTo) => cfg.fields.filter((f) => f.mapTo === m).map((f) => values[f.id]).find(Boolean) ?? "";
  const name = pick("name") || pick("email").split("@")[0] || "New contact", email = pick("email").toLowerCase(), phone = pick("phone"), company = pick("company");
  const custom: Record<string, string> = {};
  for (const f of cfg.fields) if (f.mapTo === "custom" && f.key && values[f.id]) custom[f.key] = values[f.id];

  const contacts = await db.list("contacts");
  const ph = digits(phone);
  const found = contacts.find((c) => (email && c.email.toLowerCase() === email) || (ph.length >= 7 && digits(c.phone) === ph));
  const tags = [...new Set([...(found?.tags ?? []), ...cfg.tags.map((t) => t.toLowerCase().trim()).filter(Boolean)])];
  let contact: Contact;
  if (found) {
    const patch: Partial<Contact> = { tags, custom: { ...(found.custom ?? {}), ...custom } };
    if (!found.phone && phone) patch.phone = phone;
    if (!found.email && email) patch.email = email;
    if (!found.company && company) patch.company = company;
    if (consent && found.unsubscribed) patch.unsubscribed = false; // they opted back in
    await db.update("contacts", found.id, patch);
    contact = { ...found, ...patch } as Contact;
  } else {
    contact = await db.insert("contacts", { name, email, phone, company, tags, source: `Form: ${form.name}`, unsubscribed: false, custom });
  }
  const answers = cfg.fields.filter((f) => values[f.id]).map((f) => `${f.label}: ${values[f.id]}`).join("\n");
  if (cfg.createDeal) {
    const deal = await db.insert("deals", { title: `${form.name} · ${contact.name}`, value: 0, stage: cfg.dealStage || "new", contact_id: contact.id, source: `Form: ${form.name}`, project: "", budget: "", address: "", rep: "", lost_reason: "", stage_at: new Date().toISOString(), quote_sent_at: null, custom });
    await db.insert("autolog", { deal_id: deal.id, kind: "Lead", message: `New lead from the form “${form.name}”: ${contact.name}`, tone: "info", key: `form:${deal.id}` });
  }
  await db.insert("activities", { contact_id: contact.id, kind: "note", body: `Submitted “${form.name}”${consent ? " (agreed to marketing emails)" : ""}\n${answers}` });
  await db.insert("form_submissions", { form_id: form.id, contact_id: contact.id, data: { ...values, ...(consent ? { consent: "yes" } : {}) } });
  return { contactId: contact.id, created: !found };
}
