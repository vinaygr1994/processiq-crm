export const todayStr = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
export const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
export function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
export function dueLabel(due: string | null) {
  if (!due) return "No date";
  const t = todayStr();
  if (due === t) return "Today";
  const diff = Math.round((new Date(due).getTime() - new Date(t).getTime()) / 86400000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${-diff} days overdue`;
  return new Date(due + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";
export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
export const fill = (text: string, c: { name: string; company: string }) =>
  text.replace(/\{\{\s*first_name\s*\}\}/gi, firstName(c.name)).replace(/\{\{\s*company\s*\}\}/gi, c.company || "your company");
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
