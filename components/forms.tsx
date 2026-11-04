"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Modal } from "./ui";
import { useCrm } from "@/lib/store";
import { isEmail, todayStr } from "@/lib/format";
import { mapContacts, parseCsv, type ImportedContact } from "@/lib/csv";

export function AddContactModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: string) => void }) {
  const { add, data, toast } = useCrm();
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", phone: "", company: "", tags: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setErr("Please enter a name.");
    if (f.email && !isEmail(f.email)) return setErr("That email address doesn't look right.");
    if (f.email && data.contacts.some((c) => c.email.toLowerCase() === f.email.trim().toLowerCase()))
      return setErr("You already have a contact with this email.");
    setBusy(true);
    const c = await add("contacts", {
      name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), company: f.company.trim(),
      tags: f.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean), source: "Added by hand", unsubscribed: false,
    });
    setBusy(false);
    if (!c) return;
    toast(`${c.name} added`);
    onClose();
    if (onCreated) onCreated(c.id);
    else router.push(`/contacts/${c.id}`);
  }
  return (
    <Modal title="Add a contact" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name"><input className="field" autoFocus value={f.name} onChange={set("name")} placeholder="e.g. Maria Santos" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email"><input className="field" type="email" value={f.email} onChange={set("email")} placeholder="maria@company.com" /></Field>
          <Field label="Phone"><input className="field" type="tel" value={f.phone} onChange={set("phone")} placeholder="Optional" /></Field>
        </div>
        <Field label="Company"><input className="field" value={f.company} onChange={set("company")} placeholder="Optional" /></Field>
        <Field label="Tags" hint="Separate with commas, e.g. lead, customer. Handy for email lists later."><input className="field" value={f.tags} onChange={set("tags")} placeholder="lead, referral" /></Field>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="soft" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>Add contact</Button>
        </div>
      </form>
    </Modal>
  );
}

const plusDays = (n: number) => todayStr(new Date(Date.now() + n * 86400000));
export function AddTaskModal({ onClose, contactId, dealId }: { onClose: () => void; contactId?: string; dealId?: string }) {
  const { add, data, toast } = useCrm();
  const [f, setF] = useState({ title: "", due: plusDays(0), contact_id: contactId ?? "" });
  const [err, setErr] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.title.trim()) return setErr("What do you need to do?");
    const t = await add("tasks", { title: f.title.trim(), due_date: f.due || null, done: false, contact_id: f.contact_id || null, deal_id: dealId ?? null });
    if (t) { toast("Task added"); onClose(); }
  }
  const quick = [["Today", 0], ["Tomorrow", 1], ["Next week", 7]] as const;
  return (
    <Modal title="Add a task" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="What needs doing?"><input className="field" autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Call back about the quote" /></Field>
        <Field label="When?">
          <div className="mb-2 flex flex-wrap gap-2">
            {quick.map(([l, n]) => (
              <button key={l} type="button" onClick={() => setF({ ...f, due: plusDays(n) })}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${f.due === plusDays(n) ? "border-teal bg-teal-t text-teal-d" : "border-line bg-white text-body hover:bg-cloud"}`}>{l}</button>
            ))}
          </div>
          <input className="field" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
        </Field>
        <Field label="Related contact">
          <select className="field" value={f.contact_id} onChange={(e) => setF({ ...f, contact_id: e.target.value })}>
            <option value="">None</option>
            {[...data.contacts].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="soft" onClick={onClose}>Cancel</Button>
          <Button type="submit">Add task</Button>
        </div>
      </form>
    </Modal>
  );
}

export function ImportModal({ onClose }: { onClose: () => void }) {
  const { add, data, toast } = useCrm();
  const [rows, setRows] = useState<ImportedContact[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const existing = new Set(data.contacts.map((c) => c.email.toLowerCase()).filter(Boolean));
  const fresh = (rows ?? []).filter((r, i, a) => !r.email || (!existing.has(r.email.toLowerCase()) && a.findIndex((x) => x.email.toLowerCase() === r.email.toLowerCase()) === i));

  async function onFile(f: File | undefined) {
    if (!f) return;
    setErr("");
    if (f.size > 5_000_000) return setErr("That file is too large (5 MB max).");
    const parsed = mapContacts(parseCsv(await f.text()));
    if (!parsed.length) return setErr("We couldn't find any contacts. Make sure the first row has headings like Name, Email, Phone, Company.");
    setRows(parsed);
  }
  async function run() {
    setBusy(true);
    let n = 0;
    for (const r of fresh) {
      const c = await add("contacts", { ...r, source: "CSV import", unsubscribed: false });
      if (c) n++;
    }
    setBusy(false);
    toast(`${n} contact${n === 1 ? "" : "s"} imported`);
    onClose();
  }
  return (
    <Modal title="Import contacts from a spreadsheet" onClose={onClose}>
      {!rows ? (
        <div className="space-y-4">
          <p>Export your contacts as a <strong>CSV file</strong> from Excel, Google Sheets or your old CRM, then choose it here. We look for columns named Name, Email, Phone, Company and Tags.</p>
          <button type="button" onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line bg-cloud/60 px-6 py-10 text-center transition hover:border-teal hover:bg-teal-t/40">
            <span className="font-semibold text-ink">Choose a CSV file</span>
            <span className="text-sm text-muted">Up to 5 MB</span>
          </button>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <p><strong>{fresh.length}</strong> new contact{fresh.length === 1 ? "" : "s"} ready to import{rows.length - fresh.length > 0 && <> · {rows.length - fresh.length} skipped (already in your CRM)</>}.</p>
          <div className="max-h-56 overflow-auto rounded-2xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-cloud text-muted"><tr><th className="px-3 py-2 font-semibold">Name</th><th className="px-3 py-2 font-semibold">Email</th><th className="px-3 py-2 font-semibold">Company</th></tr></thead>
              <tbody>{fresh.slice(0, 8).map((r, i) => <tr key={i} className="border-t border-line"><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{r.email}</td><td className="px-3 py-2">{r.company}</td></tr>)}</tbody>
            </table>
          </div>
          {fresh.length > 8 && <p className="text-sm text-muted">…and {fresh.length - 8} more.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="soft" onClick={() => setRows(null)}>Choose another file</Button>
            <Button onClick={run} disabled={busy || !fresh.length}>{busy ? "Importing…" : `Import ${fresh.length}`}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
