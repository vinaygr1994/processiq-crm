import { isDemo } from "./config";
import { supabase } from "./supabase";
import { seedRows } from "./seed";
import type { Rows, TableName, Tables } from "./types";

const TABLES: TableName[] = ["contacts", "deals", "visits", "autolog", "tasks", "activities", "templates", "campaigns", "emails", "settings", "workflows", "workflow_runs"];
const KEY = "piq-crm-demo-v3";

export interface Backend {
  loadAll(): Promise<Rows>;
  insert<T extends TableName>(t: T, row: Omit<Tables[T], "id" | "created_at">): Promise<Tables[T]>;
  update<T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>): Promise<void>;
  remove(t: TableName, id: string): Promise<void>;
  removeMany(t: TableName, ids: string[]): Promise<void>;
}

/* ---------- Demo backend: everything lives in this browser ---------- */
function readLocal(): Rows {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...seedRows(), ...(JSON.parse(raw) as Rows) };
  } catch {}
  return seedRows();
}
function writeLocal(rows: Rows) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {}
}
export function resetDemo() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
const localBackend: Backend = {
  async loadAll() {
    return readLocal();
  },
  async insert(t, row) {
    const rows = readLocal();
    const full = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row } as Tables[typeof t];
    (rows[t] as Tables[typeof t][]).unshift(full);
    writeLocal(rows);
    return full;
  },
  async update(t, id, patch) {
    const rows = readLocal();
    const list = rows[t] as Tables[typeof t][];
    const i = list.findIndex((r) => r.id === id);
    if (i >= 0) list[i] = { ...list[i], ...patch };
    writeLocal(rows);
  },
  async remove(t, id) {
    const rows = readLocal();
    (rows[t] as unknown as Tables[typeof t][]) = (rows[t] as Tables[typeof t][]).filter((r) => r.id !== id);
    writeLocal(rows);
  },
  async removeMany(t, ids) {
    const rows = readLocal();
    const gone = new Set(ids);
    (rows[t] as unknown as Tables[typeof t][]) = (rows[t] as Tables[typeof t][]).filter((r) => !gone.has(r.id));
    writeLocal(rows);
  },
};

/* ---------- Supabase backend: Postgres with row-level security ---------- */
async function fetchAll<T>(table: TableName): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase().from(table).select("*").order("created_at", { ascending: false }).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}
const remoteBackend: Backend = {
  async loadAll() {
    const entries = await Promise.all(TABLES.map(async (t) => [t, await fetchAll(t)] as const));
    return Object.fromEntries(entries) as unknown as Rows;
  },
  async insert(t, row) {
    const { data, error } = await supabase().from(t).insert(row as never).select().single();
    if (error) throw new Error(error.message);
    return data as Tables[typeof t];
  },
  async update(t, id, patch) {
    const { error } = await supabase().from(t).update(patch as never).eq("id", id);
    if (error) throw new Error(error.message);
  },
  async remove(t, id) {
    const { error } = await supabase().from(t).delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
  async removeMany(t, ids) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase().from(t).delete().in("id", ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
  },
};

export const backend: Backend = isDemo ? localBackend : remoteBackend;
