import { isDemo } from "./config";

const KEY = "piq-crm-time-offset";
/** In demo mode you can "skip ahead" in time to watch follow-ups fire. Live mode always uses the real clock. */
export function offsetMs(): number {
  if (!isDemo || typeof localStorage === "undefined") return 0;
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
}
export const nowMs = () => Date.now() + offsetMs();
export const nowIso = () => new Date(nowMs()).toISOString();
export function skipAhead(ms: number) {
  try { localStorage.setItem(KEY, String(offsetMs() + ms)); } catch {}
}
export function resetClock() {
  try { localStorage.removeItem(KEY); } catch {}
}
