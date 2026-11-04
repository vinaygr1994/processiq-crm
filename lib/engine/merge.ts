import { firstName } from "../format";
import type { Contact, Deal, Settings, Visit } from "../types";

export const MERGE_TAGS = ["first", "name", "project", "rep", "business", "amount", "when", "address", "review_link", "booking_link", "booking_line"] as const;

export const customTag = (label: string) => "cf_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function fmtWhen(iso: string, tz: string) {
  try { return new Date(iso).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
}

export function mergeVars(deal: Deal | undefined, contact: Contact | undefined, visit: Visit | undefined, s: Settings | undefined): Record<string, string> {
  const tz = s?.timezone || "UTC";
  const booking = s?.booking_link || "";
  const custom: Record<string, string> = {};
  for (const f of s?.custom_fields ?? []) custom[customTag(f.label)] = (f.on === "deal" ? deal?.custom : contact?.custom)?.[f.id] ?? "";
  return {
    ...custom,
    first: firstName(contact?.name ?? "there"),
    name: contact?.name ?? "there",
    project: (deal?.project || "project").toLowerCase(),
    rep: deal?.rep || s?.sender_name || "our team",
    business: s?.business_name || "our team",
    amount: deal?.value ? "$" + Math.round(deal.value).toLocaleString("en-US") : "",
    when: visit ? fmtWhen(visit.starts_at, tz) : "",
    address: deal?.address || "",
    review_link: s?.review_link || "",
    booking_link: booking,
    booking_line: booking ? `You can pick a time here: ${booking}` : "Just reply with a day and time that suits you and we'll lock it in.",
  };
}
export const render = (text: string, vars: Record<string, string>) => text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k: string) => vars[k.toLowerCase()] ?? "");
