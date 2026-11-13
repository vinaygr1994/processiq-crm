const offset = (ms: number, tz: string) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
  const v = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second) - Math.floor(ms / 1000) * 1000;
};
/** The next moment it is HH:MM on the clock in the given time zone. */
export function nextTimeOfDay(ms: number, time: string, tz: string) {
  const [h, m] = time.split(":").map((x) => Number(x) || 0);
  let off = 0;
  try { off = offset(ms, tz); } catch { off = 0; }
  const local = new Date(ms + off);
  let cand = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, m) - off;
  if (cand <= ms) cand += 86400000;
  return cand;
}
/** "YYYY-MM-DDTHH:mm" on the clock in the given time zone → UTC milliseconds. */
export function zonedToUtc(local: string, tz: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return NaN;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let off = 0;
  try { off = offset(guess, tz); off = offset(guess - off, tz); } catch { off = 0; }
  return guess - off;
}
