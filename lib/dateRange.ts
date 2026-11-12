const DAY = 86400000;

export type RangeId = "today" | "7" | "30" | "90" | "thisMonth" | "lastMonth" | "ytd" | "365" | "custom";
export const RANGE_OPTIONS: { id: RangeId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "90", label: "Last 90 days" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "ytd", label: "This year" },
  { id: "365", label: "Last 12 months" },
  { id: "custom", label: "Custom range" },
];

export type Custom = { from: string; to: string };
export type Resolved = { from: number; to: number; prevFrom: number; label: string };

/** "2026-11-12" -> local midnight. */
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1).getTime(); };
export const ymd = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const short = (ms: number, withYear: boolean) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });

/** `to` is exclusive. Rolling ranges end at "now" (Infinity so nothing recent is cut off). */
export function resolveRange(id: RangeId, custom: Custom, now: number): Resolved {
  const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const today = startOfDay(now);
  let from: number, to = Infinity, label = RANGE_OPTIONS.find((o) => o.id === id)!.label.toLowerCase();
  switch (id) {
    case "today": from = today; break;
    case "7": case "30": case "90": case "365": from = now - Number(id) * DAY; break;
    case "thisMonth": { const d = new Date(now); from = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); break; }
    case "lastMonth": { const d = new Date(now); from = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(); to = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); break; }
    case "ytd": from = new Date(new Date(now).getFullYear(), 0, 1).getTime(); break;
    case "custom": {
      let a = custom.from ? parse(custom.from) : today - 29 * DAY;
      let b = custom.to ? parse(custom.to) : today;
      if (a > b) [a, b] = [b, a];
      from = a; to = b + DAY;
      const y = new Date(a).getFullYear() !== new Date(b).getFullYear() || new Date(b).getFullYear() !== new Date(now).getFullYear();
      label = a === b ? short(a, y) : `${short(a, y)} to ${short(b, y)}`;
      break;
    }
  }
  const end = Number.isFinite(to) ? to : now;
  return { from, to, prevFrom: from - Math.max(DAY, end - from), label };
}
