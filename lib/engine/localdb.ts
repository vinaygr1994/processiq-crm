import type { Db } from "./engine";
import type { Rows, Tables } from "../types";
import { seedRows } from "../seed";

const KEY = "piq-crm-demo-v3";
const read = (): Rows => { try { const raw = localStorage.getItem(KEY); if (raw) return { ...seedRows(), ...(JSON.parse(raw) as Rows) }; } catch {} return seedRows(); };
const write = (r: Rows) => { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch {} };

/** Demo storage: this browser's localStorage. */
export const localDb: Db = {
  async list(t) { return (read()[t] as unknown as never[]).slice(); },
  async insert(t, row) {
    const rows = read();
    const full = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row } as unknown as Tables[typeof t];
    (rows[t] as Tables[typeof t][]).unshift(full); write(rows); return full;
  },
  async update(t, id, patch) {
    const rows = read(); const list = rows[t] as Tables[typeof t][]; const i = list.findIndex((r) => r.id === id);
    if (i >= 0) list[i] = { ...list[i], ...patch }; write(rows);
  },
  async claim() { return true; },
};
