"use client";
import { useState } from "react";
import { Button, Field, Modal } from "./ui";
import { useCrm } from "@/lib/store";
import { useFlow } from "@/lib/flow";
import { isEmail } from "@/lib/format";
import { nowMs } from "@/lib/clock";
import { LOST_REASONS, SOURCES } from "@/lib/stages";
import { PRIORITIES, interestsOf, lostStage, pipelineOf, pipelinesOf } from "@/lib/pipelines";
import type { Deal, Visit } from "@/lib/types";

export function NewLeadModal({ onClose, onCreated, pipelineId }: { onClose: () => void; onCreated?: (d: Deal) => void; pipelineId?: string }) {
  const { data, settings, toast, team, me } = useCrm();
  const flow = useFlow();
  const pipelines = pipelinesOf(settings);
  const interests = interestsOf(settings);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [q, setQ] = useState("");
  const [f, setF] = useState({ name: "", phone: "", email: "", company: "", contactId: "", title: "", project: interests[0] ?? "", value: "", pipeline: pipelineId ?? pipelines[0].id, stage: "", close_date: "", priority: "", rep: me.role === "rep" ? me.name : "", source: SOURCES[0], address: "", budget: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const pipe = pipelines.find((p) => p.id === f.pipeline) ?? pipelines[0];
  const openStages = pipe.stages.filter((s) => s.kind === "open");
  const s = q.trim().toLowerCase();
  const hits = s ? data.contacts.filter((c) => [c.name, c.email, c.company].some((v) => v.toLowerCase().includes(s))).slice(0, 6) : [];
  const picked = data.contacts.find((c) => c.id === f.contactId);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "existing" && !picked) return setErr("Choose a contact.");
    if (mode === "new") {
      if (!f.name.trim()) return setErr("Please enter the contact's name.");
      if (!f.phone.trim() && !f.email.trim()) return setErr("Add a phone number or an email so you can follow up.");
      if (f.email && !isEmail(f.email)) return setErr("That email address doesn't look right.");
    }
    setBusy(true);
    const d = await flow.newLead({
      ...f, name: picked?.name ?? f.name, email: picked?.email ?? f.email, phone: picked?.phone ?? f.phone, contactId: picked?.id,
      value: Number(f.value.replace(/[^0-9.]/g, "")) || 0, stage: f.stage || openStages[0]?.id || "new", pipeline: pipe.id,
    });
    setBusy(false);
    if (!d) return;
    toast("Deal created");
    onClose();
    onCreated?.(d);
  }
  return (
    <Modal title="Create deal" onClose={onClose} wide>
      <form onSubmit={save} className="space-y-5">
        <div>
          <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold text-ink">Contact</span>
            <div className="inline-flex rounded-full bg-cloud p-1 text-[13px] font-semibold">{(["new", "existing"] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={`rounded-full px-3 py-1 ${mode === m ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{m === "new" ? "New contact" : "Existing contact"}</button>)}</div>
          </div>
          {mode === "existing" ? (picked ? (
            <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5"><span><span className="font-semibold">{picked.name}</span> <span className="text-sm text-muted">{picked.email || picked.phone}</span></span><button type="button" onClick={() => setF({ ...f, contactId: "" })} className="text-sm font-semibold text-teal-d hover:underline">Change</button></div>
          ) : (
            <div className="space-y-2"><input className="field" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or company" aria-label="Search contacts" />
              {hits.length > 0 && <ul className="divide-y divide-line rounded-xl border border-line">{hits.map((c) => <li key={c.id}><button type="button" onClick={() => setF({ ...f, contactId: c.id })} className="w-full px-3.5 py-2 text-left text-sm hover:bg-cloud"><span className="font-semibold">{c.name}</span> <span className="text-muted">{c.company || c.email}</span></button></li>)}</ul>}</div>
          )) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name"><input className="field" autoFocus value={f.name} onChange={set("name")} placeholder="e.g. Sarah Collins" /></Field>
              <Field label="Company (optional)"><input className="field" value={f.company} onChange={set("company")} /></Field>
              <Field label="Email"><input className="field" type="email" value={f.email} onChange={set("email")} /></Field>
              <Field label="Phone"><input className="field" type="tel" value={f.phone} onChange={set("phone")} /></Field>
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Deal name (optional)"><input className="field" value={f.title} onChange={set("title")} placeholder="We'll use the interest and contact name" /></Field>
          <Field label="Interested in"><input className="field" list="deal-interests" value={f.project} onChange={set("project")} /><datalist id="deal-interests">{interests.map((i) => <option key={i} value={i} />)}</datalist></Field>
          <Field label="Amount"><input className="field" inputMode="decimal" value={f.value} onChange={set("value")} placeholder="0" /></Field>
          <Field label="Expected close date"><input className="field" type="date" value={f.close_date} onChange={set("close_date")} /></Field>
          {pipelines.length > 1 && <Field label="Pipeline"><select className="field" value={pipe.id} onChange={(e) => setF({ ...f, pipeline: e.target.value, stage: "" })}>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
          <Field label="Stage"><select className="field" value={f.stage || openStages[0]?.id} onChange={set("stage")}>{openStages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
          <Field label="Owner"><select className="field" value={f.rep} onChange={set("rep")}><option value="">{settings?.reps?.length ? "Auto-assign (round robin)" : "Unassigned"}</option>{team.map((r) => <option key={r}>{r}</option>)}</select></Field>
          <Field label="Priority"><select className="field" value={f.priority} onChange={set("priority")}><option value="">None</option>{PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
          <Field label="Source"><select className="field" value={f.source} onChange={set("source")}>{SOURCES.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Location (optional)"><input className="field" value={f.address} onChange={set("address")} placeholder="City or address" /></Field>
        </div>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2 pt-1"><Button type="button" variant="soft" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create deal"}</Button></div>
      </form>
    </Modal>
  );
}

const localInput = (ms: number) => { const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function BookVisitModal({ deal, onClose, day }: { deal: Deal; onClose: () => void; day?: Date }) {
  const { settings, toast, team } = useCrm();
  const flow = useFlow();
  const reps = team.length ? team : settings?.reps ?? [];
  const tomorrow10 = (() => { const d = day ? new Date(day) : new Date(nowMs() + 86400000); d.setHours(10, 0, 0, 0); return d.getTime(); })();
  const [when, setWhen] = useState(localInput(tomorrow10));
  const [rep, setRep] = useState(deal.rep || reps[0] || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const t = new Date(when).getTime();
    if (!when || Number.isNaN(t)) return setErr("Pick a date and time.");
    if (!rep.trim()) return setErr("Who is running the meeting?");
    setBusy(true);
    await flow.bookVisit(deal, { starts_at: new Date(t).toISOString(), rep: rep.trim() });
    setBusy(false);
    toast("Meeting booked");
    onClose();
  }
  return (
    <Modal title="Book a meeting" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Date & time"><input className="field" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <Field label="With">
          {reps.length ? <select className="field" value={rep} onChange={(e) => setRep(e.target.value)}>{reps.map((r) => <option key={r}>{r}</option>)}</select> : <input className="field" value={rep} onChange={(e) => setRep(e.target.value)} placeholder="Rep's name" />}
        </Field>
        <p className="text-sm text-muted">It shows on the deal and in your calendar. Your workflows can send the confirmation and reminders.</p>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="soft" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>Book meeting</Button></div>
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
    if (!result.trim()) return setErr("Add a few words about how the meeting went.");
    await flow.visitResult(visit, { priority, result: result.trim() });
    toast("Meeting notes saved");
    onClose();
  }
  return (
    <Modal title="How did the meeting go?" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-muted">Quick notes keep the whole team up to date.</p>
        <Field label="How likely is this deal?">
          <div className="flex gap-2" role="radiogroup">
            {([["hot", "Hot", "bg-rose-t text-[#b8264b] border-rose"], ["warm", "Warm", "bg-sun-t text-[#9a5a00] border-sun"], ["cold", "Cold", "bg-cloud text-muted border-[#9aa5bd]"]] as const).map(([k, l, c]) => (
              <button key={k} type="button" role="radio" aria-checked={priority === k} onClick={() => setPriority(k)}
                className={`flex-1 rounded-2xl border-2 px-4 py-2.5 font-semibold transition ${priority === k ? c : "border-line bg-white text-body hover:bg-cloud"}`}>{l}</button>
            ))}
          </div>
        </Field>
        <Field label="What did you find and agree?"><textarea className="field !min-h-[130px]" autoFocus value={result} onChange={(e) => setResult(e.target.value)} placeholder="Needs, budget, timeline, who decides…" /></Field>
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
    if (!n || n <= 0) return setErr("Enter the amount, e.g. 2500.");
    await flow.sendQuote(deal, { amount: n });
    toast("Proposal saved");
    onClose();
  }
  return (
    <Modal title="Proposal" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Proposal amount ($)"><input className="field" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="28500" /></Field>
        <p className="text-sm text-muted">The proposal amount is saved on the deal. If they go quiet, your follow-up workflow keeps in touch until they decide.</p>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="soft" onClick={onClose}>Cancel</Button><Button type="submit" icon="send">Save proposal</Button></div>
      </form>
    </Modal>
  );
}

export function LostModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const flow = useFlow();
  const { settings } = useCrm();
  const [reason, setReason] = useState(LOST_REASONS[0]);
  return (
    <Modal title="Mark as lost" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Why was it lost?"><select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>{LOST_REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <p className="text-sm text-muted">They stay in your CRM and get a friendly check-in every 90 days, so a lost lead can come back.</p>
        <div className="flex justify-end gap-2"><Button variant="soft" onClick={onClose}>Cancel</Button><Button onClick={async () => { await flow.markLost(deal, reason, lostStage(pipelineOf(deal, pipelinesOf(settings)))); onClose(); }}>Mark lost</Button></div>
      </div>
    </Modal>
  );
}
