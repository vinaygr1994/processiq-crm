"use client";
import { useState } from "react";
import { Button, Field, Modal } from "./ui";
import { useCrm } from "@/lib/store";
import { useFlow } from "@/lib/flow";
import { isEmail } from "@/lib/format";
import { nowMs } from "@/lib/clock";
import { BUDGETS, LOST_REASONS, PROJECTS, SOURCES } from "@/lib/stages";
import type { Deal, Visit } from "@/lib/types";

export function NewLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (d: Deal) => void }) {
  const { toast } = useCrm();
  const flow = useFlow();
  const [f, setF] = useState({ name: "", phone: "", email: "", project: PROJECTS[0], budget: BUDGETS[1], source: SOURCES[0], address: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setErr("Please enter the homeowner's name.");
    if (!f.phone.trim() && !f.email.trim()) return setErr("Add a phone number or an email so we can reply.");
    if (f.email && !isEmail(f.email)) return setErr("That email address doesn't look right.");
    setBusy(true);
    const d = await flow.newLead(f);
    setBusy(false);
    if (!d) return;
    toast("Lead added. The reply and call task are on their way.");
    onClose();
    onCreated?.(d);
  }
  return (
    <Modal title="New lead" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="rounded-2xl bg-teal-t px-4 py-3 text-sm text-teal-d">We&apos;ll check for duplicates, assign a rep, send a first reply and create a call task, all automatically.</p>
        <Field label="Homeowner's name"><input className="field" autoFocus value={f.name} onChange={set("name")} placeholder="e.g. Sarah Collins" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone"><input className="field" type="tel" value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Email"><input className="field" type="email" value={f.email} onChange={set("email")} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project"><select className="field" value={f.project} onChange={set("project")}>{PROJECTS.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Budget"><select className="field" value={f.budget} onChange={set("budget")}>{BUDGETS.map((p) => <option key={p}>{p}</option>)}</select></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Where did they find you?"><select className="field" value={f.source} onChange={set("source")}>{SOURCES.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Address or city"><input className="field" value={f.address} onChange={set("address")} /></Field>
        </div>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="soft" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add lead"}</Button></div>
      </form>
    </Modal>
  );
}

const localInput = (ms: number) => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function BookVisitModal({ deal, onClose, day }: { deal: Deal; onClose: () => void; day?: Date }) {
  const { settings, toast } = useCrm();
  const flow = useFlow();
  const reps = settings?.reps ?? [];
  const tomorrow10 = (() => { const d = day ? new Date(day) : new Date(nowMs() + 86400000); d.setHours(10, 0, 0, 0); return d.getTime(); })();
  const [when, setWhen] = useState(localInput(tomorrow10));
  const [rep, setRep] = useState(deal.rep || reps[0] || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const t = new Date(when).getTime();
    if (!when || Number.isNaN(t)) return setErr("Pick a date and time.");
    if (!rep.trim()) return setErr("Who is doing the visit?");
    setBusy(true);
    await flow.bookVisit(deal, { starts_at: new Date(t).toISOString(), rep: rep.trim() });
    setBusy(false);
    toast("Visit booked. Confirmation sent.");
    onClose();
  }
  return (
    <Modal title="Book a visit" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Date & time"><input className="field" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <Field label="Who is going?">
          {reps.length ? <select className="field" value={rep} onChange={(e) => setRep(e.target.value)}>{reps.map((r) => <option key={r}>{r}</option>)}</select> : <input className="field" value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Rep's name" />}
        </Field>
        <p className="text-sm text-muted">The homeowner gets a confirmation now, then reminders 24 hours and 2 hours before.</p>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="soft" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>Book visit</Button></div>
      </form>
    </Modal>
  );
}

export function VisitResultModal({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const { toast } = useCrm();
  const flow = useFlow();
  const [priority, setPriority] = useState<Visit["priority"]>("warm");
  const [result, setResult] = useState("");
  const [err, setErr] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!result.trim()) return setErr("Add a few words about how the visit went.");
    await flow.visitResult(visit, { priority, result: result.trim() });
    toast("Visit result saved and shared with the team");
    onClose();
  }
  return (
    <Modal title="How did the visit go?" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-muted">This short form is the only typing the system needs from the rep.</p>
        <Field label="How likely is this job?">
          <div className="flex gap-2" role="radiogroup">
            {([["hot", "Hot", "bg-rose-t text-[#b8264b] border-rose"], ["warm", "Warm", "bg-sun-t text-[#9a5a00] border-sun"], ["cold", "Cold", "bg-cloud text-muted border-[#9aa5bd]"]] as const).map(([k, l, c]) => (
              <button key={k} type="button" role="radio" aria-checked={priority === k} onClick={() => setPriority(k)}
                className={`flex-1 rounded-2xl border-2 px-4 py-2.5 font-semibold transition ${priority === k ? c : "border-line bg-white text-body hover:bg-cloud"}`}>{l}</button>
            ))}
          </div>
        </Field>
        <Field label="What did you find and agree?"><textarea className="field !min-h-[130px]" autoFocus value={result} onChange={(e) => setResult(e.target.value)} placeholder="Scope, measurements, timeline, who decides…" /></Field>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="soft" onClick={onClose}>Cancel</Button><Button type="submit">Save result</Button></div>
      </form>
    </Modal>
  );
}

export function QuoteModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const { toast } = useCrm();
  const flow = useFlow();
  const [amount, setAmount] = useState(deal.value ? String(deal.value) : "");
  const [err, setErr] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/[$,\s]/g, ""));
    if (!n || n <= 0) return setErr("Enter the quote amount, e.g. 28500.");
    await flow.sendQuote(deal, { amount: n });
    toast("Quote sent. Follow-ups are scheduled for days 2, 5, 10 and 21.");
    onClose();
  }
  return (
    <Modal title="Send the quote" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Quote amount ($)"><input className="field" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="28500" /></Field>
        <p className="text-sm text-muted">The homeowner receives the quote by email. If they go quiet, follow-ups go out on days 2, 5, 10 and 21 until they decide.</p>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="soft" onClick={onClose}>Cancel</Button><Button type="submit" icon="send">Send quote</Button></div>
      </form>
    </Modal>
  );
}

export function LostModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const flow = useFlow();
  const [reason, setReason] = useState(LOST_REASONS[0]);
  return (
    <Modal title="Mark as lost" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Why was it lost?"><select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>{LOST_REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <p className="text-sm text-muted">They stay in your CRM and get a friendly check-in every 90 days, so a lost lead can come back.</p>
        <div className="flex justify-end gap-2"><Button variant="soft" onClick={onClose}>Cancel</Button><Button onClick={async () => { await flow.markLost(deal, reason); onClose(); }}>Mark lost</Button></div>
      </div>
    </Modal>
  );
}
