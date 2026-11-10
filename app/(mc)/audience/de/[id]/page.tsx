"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { DeBuilder } from "@/components/DeBuilder";
import { Badge, Button, Card, ConfirmModal, Empty, Field, Modal } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { useDeBulk } from "@/lib/deClient";
import { parseCsv } from "@/lib/csv";
import { DE_OPS, MAX_ROWS, cleanRow, keyOf, matches, pkOf, toCsv, typeLabel, type DeRule } from "@/lib/de";
import type { DataExtension, DeField, DeRow } from "@/lib/types";

const PER = 50;
function Cell({ fl, value, onChange }: { fl: DeField; value: string; onChange: (v: string) => void }) {
  if (fl.type === "boolean") return <select className="field" value={value} onChange={(e) => onChange(e.target.value)} aria-label={fl.name}><option value="">–</option><option value="true">True</option><option value="false">False</option></select>;
  return <input className="field" aria-label={fl.name} type={fl.type === "date" ? "date" : fl.type === "number" || fl.type === "decimal" ? "number" : fl.type === "email" ? "email" : "text"} step={fl.type === "decimal" ? "any" : undefined} maxLength={fl.type === "text" ? fl.length : undefined} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function RowModal({ de, row, onClose }: { de: DataExtension; row?: DeRow; onClose: () => void }) {
  const { data, add, update, toast } = useCrm();
  const [v, setV] = useState<Record<string, string>>(() => ({ ...Object.fromEntries(de.fields.map((f) => [f.name, f.default ?? ""])), ...(row?.data ?? {}) }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = cleanRow(de, v);
    if (r.errors.length) return toast(r.errors[0], "error");
    const pk = pkOf(de, r.data);
    if (pk && data.de_rows.some((x) => x.de_id === de.id && x.id !== row?.id && pkOf(de, x.data) === pk)) return toast("A record with that primary key already exists", "error");
    if (row) await update("de_rows", row.id, { data: r.data }); else await add("de_rows", { de_id: de.id, data: r.data });
    toast(row ? "Record saved" : "Record added"); onClose();
  }
  return (
    <Modal title={row ? "Edit record" : "Add record"} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">{de.fields.map((f) => <Field key={f.name} label={`${f.name}${f.primary ? " (primary key)" : f.required ? " *" : ""}`} hint={typeLabel(f.type)}><Cell fl={f} value={v[f.name] ?? ""} onChange={(x) => setV({ ...v, [f.name]: x })} /></Field>)}</div>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">{row ? "Save" : "Add record"}</Button></div>
      </form>
    </Modal>
  );
}

function ImportModal({ de, onClose }: { de: DataExtension; onClose: () => void }) {
  const { data, update, toast } = useCrm();
  const bulk = useDeBulk();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<"add" | "upsert">("upsert");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const hasPk = de.fields.some((f) => f.primary);
  async function pick(f: File | undefined) {
    if (!f) return;
    const all = parseCsv(await f.text()).filter((r) => r.some((c) => c.trim()));
    if (all.length < 2) return toast("That file has no data rows", "error");
    setRows(all);
    setMap(Object.fromEntries(de.fields.map((fl) => [fl.name, all[0].findIndex((h) => keyOf(h) === keyOf(fl.name))])));
  }
  const body = useMemo(() => rows?.slice(1) ?? [], [rows]);
  const prepared = useMemo(() => {
    const good: Record<string, string>[] = []; let bad = 0; const firstErr: string[] = [];
    for (const r of body) { const c = cleanRow(de, Object.fromEntries(de.fields.map((f) => [f.name, map[f.name] >= 0 ? r[map[f.name]] ?? "" : ""]))); if (c.errors.length) { bad++; if (firstErr.length < 3) firstErr.push(c.errors[0]); } else good.push(c.data); }
    return { good, bad, firstErr };
  }, [body, map, de]);
  async function run() {
    setBusy(true);
    try {
      const existing = new Map(data.de_rows.filter((x) => x.de_id === de.id).map((x) => [pkOf(de, x.data), x]));
      const seen = new Set<string>(); const fresh: Record<string, string>[] = []; let updated = 0, dup = 0;
      for (const d of prepared.good) {
        const pk = hasPk ? pkOf(de, d) : "";
        if (pk) { if (seen.has(pk)) { dup++; continue; } seen.add(pk); const hit = existing.get(pk); if (hit) { if (mode === "upsert") { await update("de_rows", hit.id, { data: d }); updated++; } else dup++; continue; } }
        fresh.push(d);
      }
      const room = MAX_ROWS - existing.size; const add = fresh.slice(0, Math.max(0, room));
      const n = add.length ? await bulk(de.id, add) : 0;
      toast(`${n} added${updated ? `, ${updated} updated` : ""}${dup ? `, ${dup} duplicates skipped` : ""}${prepared.bad ? `, ${prepared.bad} invalid rows skipped` : ""}${fresh.length > add.length ? `. Limit of ${MAX_ROWS.toLocaleString()} records reached` : ""}`);
      onClose();
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  }
  return (
    <Modal title={`Import into ${de.name}`} onClose={onClose} wide>
      {!rows ? (
        <div className="rounded-lg border border-dashed border-[#b9c2d6] px-6 py-10 text-center">
          <p className="mb-3 text-muted">Choose a CSV file. The first row must be the column names.</p>
          <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <Button icon="upload" onClick={() => file.current?.click()}>Choose CSV file</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div><h3 className="mb-2 text-[14.5px] font-semibold">Map columns</h3>
            <div className="grid gap-2 sm:grid-cols-2">{de.fields.map((f) => <label key={f.name} className="flex items-center gap-2 text-sm"><span className="w-36 shrink-0 truncate font-medium text-ink">{f.name}{f.required || f.primary ? " *" : ""}</span><select className="field" value={map[f.name] ?? -1} onChange={(e) => setMap({ ...map, [f.name]: Number(e.target.value) })} aria-label={`Column for ${f.name}`}><option value={-1}>Don&apos;t import</option>{rows[0].map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}</select></label>)}</div></div>
          {hasPk && <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" className="accent-[#0b8a8a]" checked={mode === "upsert"} onChange={() => setMode("upsert")} />Add new and update existing records</label><label className="flex items-center gap-2"><input type="radio" className="accent-[#0b8a8a]" checked={mode === "add"} onChange={() => setMode("add")} />Add new records only</label></div>}
          <div className="rounded-lg bg-cloud px-4 py-3 text-[13.5px]"><strong className="text-ink">{prepared.good.length}</strong> of {body.length} rows are ready to import.{prepared.bad > 0 && <span className="text-[#c42b52]"> {prepared.bad} will be skipped ({prepared.firstErr.join("; ")}).</span>}</div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={busy || !prepared.good.length} onClick={run}>{busy ? "Importing…" : `Import ${prepared.good.length} rows`}</Button></div>
        </div>
      )}
    </Modal>
  );
}

export default function DataExtensionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, can, add, update, remove, removeMany, toast } = useCrm();
  const bulk = useDeBulk();
  const de = data.data_extensions.find((d) => d.id === id);
  const [tab, setTab] = useState<"records" | "fields">("records");
  const [q, setQ] = useState("");
  const [rules, setRules] = useState<DeRule[]>([]);
  const [showFilter, setShowFilter] = useState(false);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [modal, setModal] = useState<null | "add" | "import" | "edit" | "clear" | "delete" | "copy" | DeRow>(null);
  const [copyName, setCopyName] = useState("");
  const [busy, setBusy] = useState(false);

  const all = useMemo(() => data.de_rows.filter((r) => r.de_id === id), [data.de_rows, id]);
  const rows = useMemo(() => {
    if (!de) return [];
    const s = q.trim().toLowerCase(); const live = rules.filter((r) => r.field && (DE_OPS.find((o) => o.id === r.op)?.noValue || r.value.trim()));
    return all.filter((r) => matches(de, r, live) && (!s || Object.values(r.data).some((v) => v.toLowerCase().includes(s))));
  }, [all, de, q, rules]);
  if (!de) return <Card><Empty icon="layers" title="Data extension not found" text="It may have been deleted." action={<Link href="/audience?tab=extensions"><Button>All data extensions</Button></Link>} /></Card>;

  const w = can("write"); const shown = rows.slice(page * PER, page * PER + PER); const filtered = rules.length > 0 || !!q.trim();
  const allOn = shown.length > 0 && shown.every((r) => sel.includes(r.id));
  function exportCsv() { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([toCsv(de!, rows)], { type: "text/csv" })); a.download = `${de!.external_key || "data-extension"}.csv`; a.click(); }
  async function saveCopy() {
    const name = copyName.trim(); if (!name) return toast("Name the new data extension", "error");
    if (data.data_extensions.some((x) => x.name.toLowerCase() === name.toLowerCase())) return toast("That name is already used", "error");
    setBusy(true);
    try {
      const made = await add("data_extensions", { name, external_key: keyOf(name), description: `Filtered from ${de!.name}`, folder: de!.folder, fields: de!.fields, sendable: de!.sendable, link: de!.link });
      if (made) { await bulk(made.id, rows.map((r) => r.data)); toast(`${name} created with ${rows.length} records`); router.push(`/audience/de/${made.id}`); }
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false); setModal(null);
  }
  async function sync() {
    if (!de!.link || de!.link.to !== "email") return;
    setBusy(true);
    const list = keyOf(de!.name).replace(/_/g, "-"); const byEmail = new Map(data.contacts.filter((c) => c.email).map((c) => [c.email.toLowerCase(), c]));
    const nameF = de!.fields.find((f) => /^(full)?name$/i.test(f.name)) ?? de!.fields.find((f) => /first/i.test(f.name)); const lastF = de!.fields.find((f) => /last/i.test(f.name)); const phoneF = de!.fields.find((f) => f.type === "phone");
    let made = 0, tagged = 0; const done = new Set<string>();
    for (const r of all) {
      const email = (r.data[de!.link!.field] ?? "").toLowerCase(); if (!email || done.has(email)) continue; done.add(email);
      const hit = byEmail.get(email);
      if (hit) { if (!hit.tags.includes(list)) { await update("contacts", hit.id, { tags: [...hit.tags, list] }); tagged++; } }
      else { const nm = [nameF && r.data[nameF.name], lastF && r.data[lastF.name]].filter(Boolean).join(" ") || email.split("@")[0]; await add("contacts", { name: nm, email, phone: phoneF ? r.data[phoneF.name] ?? "" : "", company: "", tags: [list], source: de!.name, unsubscribed: false, owner: "" } as never); made++; }
    }
    setBusy(false); toast(`${made} new contact${made === 1 ? "" : "s"} created, ${tagged} added to the list “${list}”. Send to that list from Email or Mobile Studio.`);
  }

  return (
    <div>
      <nav className="mb-3 flex items-center gap-1.5 text-[13px] text-muted" aria-label="Breadcrumb"><Link href="/audience" className="font-semibold hover:text-ink">Contact Builder</Link><Icon name="chevron" className="size-3.5" /><Link href="/audience?tab=extensions" className="font-semibold hover:text-ink">Data Extensions</Link><Icon name="chevron" className="size-3.5" /><span className="text-ink">{de.name}</span></nav>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="flex flex-wrap items-center gap-2 text-[22px] font-semibold leading-tight">{de.name}{de.sendable ? <Badge tone="green">Sendable</Badge> : <Badge>Standard</Badge>}{de.link && <Badge tone="teal">Linked on {de.link.field}</Badge>}</h1>
          <p className="mt-0.5 text-[13.5px] text-muted">{de.description || "No description"} · External key <code className="text-[12.5px]">{de.external_key}</code>{de.folder ? ` · Folder ${de.folder}` : ""}</p></div>
        {w && <div className="flex flex-wrap gap-2">
          {de.sendable && de.link?.to === "email" && <Button variant="soft" icon="users" disabled={busy || !all.length} onClick={sync}>{busy ? "Syncing…" : "Sync to contacts"}</Button>}
          <Button variant="soft" icon="upload" onClick={() => setModal("import")}>Import</Button><Button icon="plus" onClick={() => setModal("add")}>Add record</Button>
        </div>}
      </div>
      <div className="mb-3 flex gap-1 border-b border-line" role="tablist">
        {([["records", `Records (${all.length.toLocaleString()})`], ["fields", `Fields (${de.fields.length})`]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`pill -mb-px border-b-2 px-3 py-2 text-[13.5px] font-semibold ${tab === k ? "border-teal-d text-teal-d" : "border-transparent text-muted hover:text-ink"}`}>{l}</button>)}
      </div>

      {tab === "fields" && (
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm"><thead className="border-b border-line bg-[#f8f9fc] text-left text-muted"><tr><th className="px-5 py-2.5 font-semibold">Name</th><th className="px-3 py-2.5 font-semibold">Data type</th><th className="px-3 py-2.5 font-semibold">Length</th><th className="px-3 py-2.5 font-semibold">Primary key</th><th className="px-3 py-2.5 font-semibold">Required</th><th className="px-5 py-2.5 font-semibold">Default</th></tr></thead>
            <tbody className="divide-y divide-line">{de.fields.map((f) => <tr key={f.name}><td className="px-5 py-2.5 font-semibold text-ink">{f.name}</td><td className="px-3 py-2.5">{typeLabel(f.type)}</td><td className="px-3 py-2.5">{f.length ?? "–"}</td><td className="px-3 py-2.5">{f.primary ? "Yes" : "–"}</td><td className="px-3 py-2.5">{f.required || f.primary ? "Yes" : "–"}</td><td className="px-5 py-2.5">{f.default ?? "–"}</td></tr>)}</tbody></table>
          {w && <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3"><Button size="sm" variant="soft" onClick={() => setModal("edit")}>Edit properties and fields</Button><Button size="sm" variant="soft" disabled={!all.length} onClick={() => setModal("clear")}>Clear all records</Button><Button size="sm" variant="danger" onClick={() => setModal("delete")}>Delete data extension</Button></div>}
        </Card>
      )}

      {tab === "records" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field !pl-9" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search records" aria-label="Search records" /></div>
            <Button variant="soft" aria-expanded={showFilter} onClick={() => { setShowFilter(!showFilter); if (!rules.length) setRules([{ field: de.fields[0].name, op: "eq", value: "" }]); }}>Filter{rules.length ? ` (${rules.length})` : ""}</Button>
            <Button variant="soft" icon="download" disabled={!rows.length} onClick={exportCsv}>Export{filtered ? " filtered" : ""}</Button>
            {w && filtered && rows.length > 0 && <Button variant="soft" onClick={() => { setCopyName(`${de.name} filtered`); setModal("copy"); }}>Save as new data extension</Button>}
            <span className="ml-auto text-[13px] text-muted">{rows.length.toLocaleString()} of {all.length.toLocaleString()} records</span>
          </div>
          {showFilter && (
            <Card className="mb-3 !p-4">
              <div className="space-y-2">{rules.map((r, i) => { const noV = DE_OPS.find((o) => o.id === r.op)?.noValue; const set = (p: Partial<DeRule>) => { setRules(rules.map((x, j) => (j === i ? { ...x, ...p } : x))); setPage(0); }; return (
                <div key={i} className="flex flex-wrap items-center gap-2"><span className="w-10 text-[13px] text-muted">{i ? "and" : "Where"}</span>
                  <select className="field !w-auto" aria-label="Field" value={r.field} onChange={(e) => set({ field: e.target.value })}>{de.fields.map((f) => <option key={f.name}>{f.name}</option>)}</select>
                  <select className="field !w-auto" aria-label="Operator" value={r.op} onChange={(e) => set({ op: e.target.value as DeRule["op"] })}>{DE_OPS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
                  {!noV && <input className="field !w-48" aria-label="Value" value={r.value} onChange={(e) => set({ value: e.target.value })} placeholder="Value" />}
                  <button onClick={() => setRules(rules.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-md text-muted hover:bg-rose-t hover:text-rose" aria-label="Remove rule"><Icon name="x" className="size-4" /></button></div>); })}</div>
              <div className="mt-3 flex gap-2"><Button size="sm" variant="soft" icon="plus" onClick={() => setRules([...rules, { field: de.fields[0].name, op: "eq", value: "" }])}>Add rule</Button>{rules.length > 0 && <Button size="sm" variant="ghost" onClick={() => setRules([])}>Clear filter</Button>}</div>
            </Card>
          )}
          {sel.length > 0 && <div className="mb-3 flex items-center gap-3 rounded-lg bg-ink px-4 py-2 text-sm text-white"><span className="font-semibold">{sel.length} selected</span><button onClick={async () => { await removeMany("de_rows", sel); toast(`${sel.length} records deleted`); setSel([]); }} className="rounded-md px-3 py-1 font-semibold text-[#ffb3c4] hover:bg-white/15">Delete</button><button onClick={() => setSel([])} className="ml-auto rounded-md px-3 py-1 font-semibold hover:bg-white/15">Clear</button></div>}
          <Card className="!p-0 overflow-hidden">
            {all.length === 0 ? <Empty icon="layers" title="No records yet" text="Add a record by hand or import a CSV file." action={w ? <div className="flex gap-2"><Button onClick={() => setModal("add")}>Add record</Button><Button variant="soft" onClick={() => setModal("import")}>Import CSV</Button></div> : undefined} /> : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="border-b border-line bg-[#f8f9fc] text-left text-muted"><tr>{w && <th className="w-10 py-2.5 pl-4"><input type="checkbox" aria-label="Select page" className="size-4 accent-[#0b8a8a]" checked={allOn} onChange={() => setSel(allOn ? [] : shown.map((r) => r.id))} /></th>}{de.fields.map((f) => <th key={f.name} className="px-3 py-2.5 font-semibold">{f.name}{f.primary && <span className="ml-1 text-[10.5px] font-bold text-teal-d">PK</span>}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {shown.length === 0 && <tr><td colSpan={de.fields.length + 1} className="px-5 py-8 text-center text-muted">No records match.</td></tr>}
                  {shown.map((r) => <tr key={r.id} className={`hover:bg-cloud/70 ${w ? "cursor-pointer" : ""} ${sel.includes(r.id) ? "bg-teal-t/30" : ""}`} onClick={() => w && setModal(r)}>
                    {w && <td className="py-2 pl-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Select record" className="size-4 accent-[#0b8a8a]" checked={sel.includes(r.id)} onChange={() => setSel(sel.includes(r.id) ? sel.filter((x) => x !== r.id) : [...sel, r.id])} /></td>}
                    {de.fields.map((f) => <td key={f.name} className="max-w-[260px] truncate whitespace-nowrap px-3 py-2">{f.type === "boolean" && r.data[f.name] ? <Badge tone={r.data[f.name] === "true" ? "green" : "gray"}>{r.data[f.name] === "true" ? "True" : "False"}</Badge> : r.data[f.name] || <span className="text-muted">–</span>}</td>)}
                  </tr>)}
                </tbody></table></div>
            )}
            {rows.length > PER && <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[13px] text-muted"><span>{page * PER + 1}–{Math.min(rows.length, page * PER + PER)} of {rows.length.toLocaleString()}</span><span className="flex gap-2"><Button size="sm" variant="soft" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="soft" disabled={(page + 1) * PER >= rows.length} onClick={() => setPage(page + 1)}>Next</Button></span></div>}
          </Card>
        </>
      )}

      {modal === "add" && <RowModal de={de} onClose={() => setModal(null)} />}
      {modal && typeof modal === "object" && <RowModal de={de} row={modal} onClose={() => setModal(null)} />}
      {modal === "import" && <ImportModal de={de} onClose={() => setModal(null)} />}
      {modal === "edit" && <DeBuilder de={de} onClose={() => setModal(null)} />}
      {modal === "copy" && <Modal title="Save as new data extension" onClose={() => setModal(null)}><p className="mb-3 text-muted">Copies the {rows.length} records that match your filter into a new data extension with the same fields.</p><Field label="Name"><input className="field" autoFocus value={copyName} onChange={(e) => setCopyName(e.target.value)} /></Field><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button disabled={busy} onClick={saveCopy}>{busy ? "Creating…" : "Create"}</Button></div></Modal>}
      {modal === "clear" && <ConfirmModal title="Clear all records?" text={`This deletes all ${all.length} records in ${de.name}. The fields stay. This can't be undone.`} confirmLabel="Clear records" onClose={() => setModal(null)} onConfirm={async () => { await removeMany("de_rows", all.map((r) => r.id)); toast("Records cleared"); }} />}
      {modal === "delete" && <ConfirmModal title={`Delete ${de.name}?`} text={`This deletes the data extension and its ${all.length} records. This can't be undone.`} onClose={() => setModal(null)} onConfirm={async () => { await removeMany("de_rows", all.map((r) => r.id)); await remove("data_extensions", de.id); toast("Data extension deleted"); router.replace("/audience?tab=extensions"); }} />}
    </div>
  );
}
