"use client";
import { supabase } from "./supabase";
import { seedRows } from "./seed";
import type { Settings, TableName } from "./types";

/** Tables filled by "Load demo data", parents before children. */
const ORDER: TableName[] = ["contacts", "deals", "visits", "autolog", "tasks", "activities", "templates", "services", "plans", "memberships", "bookings", "objects", "records", "messages"];
const FK: Record<string, TableName> = { contact_id: "contacts", deal_id: "deals", object_id: "objects", service_id: "services", plan_id: "plans", membership_id: "memberships" };
const REQUIRED: Partial<Record<TableName, string[]>> = { visits: ["deal_id"], records: ["object_id"], memberships: ["contact_id"], activities: ["contact_id"] };
const LS = "piq-demo-ids";
export const DEMO_REPS = ["Maria", "Dan"];
export type DemoIds = Partial<Record<TableName, string[]>> & { reps_before?: string[] };

export function savedDemoIds(settings: Settings | null): DemoIds | null {
  const s = (settings as (Settings & { demo_ids?: DemoIds | null }) | null)?.demo_ids;
  if (s && Object.keys(s).length) return s;
  try { const v = JSON.parse(localStorage.getItem(LS) || "null"); return v && typeof v === "object" ? v : null; } catch { return null; }
}

/** Copies the sample workspace into the signed-in account. Returns what was added and which tables are missing. */
export async function loadDemoData(settings: Settings | null) {
  const sb = supabase(), rows = seedRows();
  const map: Record<string, Record<string, string>> = {};
  const ids: DemoIds = { reps_before: settings?.reps ?? [] };
  const skipped: string[] = []; let added = 0;
  for (const t of ORDER) {
    const src = rows[t] as unknown as Record<string, unknown>[];
    if (!src.length) continue;
    const out: Record<string, unknown>[] = [], old: string[] = [];
    for (const r of src) {
      const row: Record<string, unknown> = { ...r }; delete row.id; let ok = true;
      for (const [k, parent] of Object.entries(FK)) {
        if (!(k in row) || row[k] == null) continue;
        const to = map[parent]?.[row[k] as string];
        if (to) row[k] = to; else if (REQUIRED[t]?.includes(k)) ok = false; else row[k] = null;
      }
      if (typeof row.key === "string") row.key = (row.key as string).replace(/:(\w+)$/, (m, id: string) => `:${map.deals?.[id] ?? map.contacts?.[id] ?? id}`);
      if (t === "contacts") row.tags = [...new Set([...(row.tags as string[]), "demo"])];
      if (ok) { out.push(row); old.push(r.id as string); }
    }
    if (!out.length) continue;
    const { data, error } = await sb.from(t).insert(out).select("id");
    if (error || !data) { skipped.push(t); continue; }
    map[t] = Object.fromEntries(old.map((o, i) => [o, (data[i] as { id: string }).id]));
    ids[t] = data.map((d) => (d as { id: string }).id); added += data.length;
  }
  try { localStorage.setItem(LS, JSON.stringify(ids)); } catch { /* settings copy below is enough */ }
  return { ids, added, skipped };
}

/** Deletes exactly the records that loadDemoData created. */
export async function removeDemoData(ids: DemoIds) {
  const sb = supabase(); let removed = 0;
  for (const t of [...ORDER].reverse()) {
    const list = ids[t]; if (!list?.length) continue;
    const { error, count } = await sb.from(t).delete({ count: "exact" }).in("id", list);
    if (!error) removed += count ?? 0;
  }
  try { localStorage.removeItem(LS); } catch { /* nothing saved */ }
  return removed;
}
