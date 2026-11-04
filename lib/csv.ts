/** Minimal RFC-4180 style CSV parser (quotes, commas, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    const safe = /^[=+\-@]/.test(s) ? "'" + s : s; // avoid spreadsheet formula injection
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export interface ImportedContact { name: string; email: string; phone: string; company: string; tags: string[] }

export function mapContacts(rows: string[][]): ImportedContact[] {
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const find = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const iName = find("full name", "name", "contact");
  const iFirst = find("first name", "first");
  const iLast = find("last name", "last", "surname");
  const iEmail = find("email", "e-mail");
  const iPhone = find("phone", "mobile", "tel");
  const iCompany = find("company", "organisation", "organization", "business");
  const iTags = find("tags", "tag", "labels");
  const out: ImportedContact[] = [];
  for (const r of rows.slice(1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    let name = iName >= 0 && iName !== iFirst ? get(iName) : "";
    if (!name) name = [get(iFirst), get(iLast)].filter(Boolean).join(" ");
    const email = get(iEmail);
    if (!name && !email) continue;
    out.push({
      name: name || email.split("@")[0],
      email,
      phone: get(iPhone),
      company: get(iCompany),
      tags: get(iTags).split(/[;,|]/).map((t) => t.trim().toLowerCase()).filter(Boolean),
    });
  }
  return out;
}
