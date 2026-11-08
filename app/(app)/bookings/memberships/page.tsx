"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, Field, Modal, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { localDate, money, sellMembership } from "@/lib/bookings";
import type { Membership, Plan } from "@/lib/types";

function PlanModal({ plan, onClose }: { plan?: Plan; onClose: () => void }) {
  const { add, update, toast } = useCrm();
  const [f, setF] = useState(() => plan ? { ...plan } : { name: "", kind: "pack" as Plan["kind"], price: 0, sessions: 10, months: 3, active: true });
  const [err, setErr] = useState("");
  async function save() {
    if (!f.name.trim()) return setErr("Give the plan a name.");
    const row = { name: f.name.trim(), kind: f.kind, price: Math.max(0, f.price), sessions: f.kind === "pack" ? Math.max(1, Math.round(f.sessions)) : 0, months: Math.max(1, Math.round(f.months)), active: f.active };
    try { if (plan) await update("plans", plan.id, row); else if (!(await add("plans", row))) return; toast("Saved"); onClose(); }
    catch { setErr("Couldn't save. Run supabase/migrations/010_bookings.sql in Supabase first."); }
  }
  return (
    <Modal title={plan ? "Edit plan" : "New membership plan"} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name"><input className="field" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. 10-class pack" /></Field>
        <Field label="Type"><select className="field" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Plan["kind"] })}><option value="pack">Pack: a set number of sessions</option><option value="unlimited">Unlimited for a period</option></select></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Price"><input type="number" min={0} step="0.01" className="field" value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} /></Field>
          {f.kind === "pack" && <Field label="Sessions"><input type="number" min={1} className="field" value={f.sessions} onChange={(e) => setF({ ...f, sessions: Number(e.target.value) })} /></Field>}
          <Field label="Valid for (months)"><input type="number" min={1} className="field" value={f.months} onChange={(e) => setF({ ...f, months: Number(e.target.value) })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Available to sell</label>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2"><Button variant="soft" onClick={onClose}>Cancel</Button><Button onClick={save}>Save plan</Button></div>
      </div>
    </Modal>
  );
}

function SellModal({ onClose }: { onClose: () => void }) {
  const { data, add, settings, toast } = useCrm();
  const [today] = useState(() => localDate(Date.now(), settings?.timezone));
  const [contactId, setContactId] = useState("");
  const [q, setQ] = useState("");
  const [planId, setPlanId] = useState(data.plans.find((p) => p.active)?.id ?? "");
  const [start, setStart] = useState(today);
  const [err, setErr] = useState("");
  const plan = data.plans.find((p) => p.id === planId);
  const s = q.trim().toLowerCase();
  const people = data.contacts.filter((c) => !s || [c.name, c.email].some((v) => v.toLowerCase().includes(s))).slice(0, 8);
  const contact = data.contacts.find((c) => c.id === contactId);
  async function save() {
    if (!contact) return setErr("Choose a client.");
    if (!plan) return setErr("Choose a plan.");
    if (!(await add("memberships", { contact_id: contact.id, plan_id: plan.id, ...sellMembership(plan, start) }))) return;
    await add("activities", { contact_id: contact.id, kind: "note", body: `Started ${plan.name} (${money(plan.price)}) from ${start}` });
    toast("Membership added"); onClose();
  }
  return (
    <Modal title="Add a membership" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Client">
          {contact ? <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5"><span className="font-semibold">{contact.name}</span><button type="button" onClick={() => setContactId("")} className="text-sm font-semibold text-teal-d hover:underline">Change</button></div> : (
            <div className="space-y-2"><input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" aria-label="Search clients" />
              <ul className="max-h-44 divide-y divide-line overflow-y-auto rounded-xl border border-line">{people.map((c) => <li key={c.id}><button type="button" onClick={() => setContactId(c.id)} className="w-full px-3.5 py-2 text-left text-sm hover:bg-cloud"><span className="font-semibold">{c.name}</span> <span className="text-muted">{c.email}</span></button></li>)}</ul></div>
          )}
        </Field>
        <Field label="Plan"><select className="field" value={planId} onChange={(e) => setPlanId(e.target.value)}>{data.plans.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} · {money(p.price)}</option>)}</select></Field>
        <Field label="Starts on"><input type="date" className="field" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        {plan && <p className="rounded-xl bg-cloud px-4 py-3 text-sm text-muted">{plan.kind === "pack" ? `${plan.sessions} sessions` : "Unlimited bookings"}, valid until {sellMembership(plan, start).ends_on}. Take payment the way you normally do; this records the membership.</p>}
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2"><Button variant="soft" onClick={onClose}>Cancel</Button><Button onClick={save}>Add membership</Button></div>
      </div>
    </Modal>
  );
}

export default function MembershipsPage() {
  const { data, update, settings, toast } = useCrm();
  const [today] = useState(() => localDate(Date.now(), settings?.timezone));
  const [plan, setPlan] = useState<Plan | "new" | null>(null);
  const [sell, setSell] = useState(false);
  const status = (m: Membership) => (m.status === "active" && m.ends_on && m.ends_on < today ? "expired" : m.status);
  const members = [...data.memberships].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const activeCount = members.filter((m) => status(m) === "active").length;
  const mrr = members.filter((m) => status(m) === "active").reduce((a, m) => { const p = data.plans.find((x) => x.id === m.plan_id); return a + (p ? p.price / Math.max(1, p.months) : 0); }, 0);

  return (
    <div className="space-y-8">
      <PageHeader title="Memberships" sub="Class packs and unlimited plans. Credits are used automatically when members book." action={<Button icon="plus" onClick={() => setSell(true)} disabled={!data.plans.length}>Add a membership</Button>} />
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Active members", String(activeCount)], ["Monthly value", money(Math.round(mrr))], ["Plans", String(data.plans.filter((p) => p.active).length)]].map(([l, v]) => <Card key={l} className="!p-4"><div className="text-[13px] font-medium text-muted">{l}</div><div className="font-display text-2xl font-semibold text-ink">{v}</div></Card>)}
      </div>
      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Plans</h2><Button size="sm" variant="soft" icon="plus" onClick={() => setPlan("new")}>New plan</Button></div>
        {data.plans.length === 0 ? <Card><p className="text-sm text-muted">No plans yet. Create a class pack or an unlimited monthly plan.</p></Card> : (
          <div className="grid gap-3 sm:grid-cols-3">{data.plans.map((p) => (
            <button key={p.id} type="button" onClick={() => setPlan(p)} className="rounded-3xl border border-line bg-white p-4 text-left hover:border-teal">
              <div className="flex items-center gap-2 font-semibold text-ink">{p.name}{!p.active && <Badge>Hidden</Badge>}</div>
              <div className="mt-1 font-display text-2xl font-semibold text-ink">{money(p.price)}</div>
              <div className="text-[13px] text-muted">{p.kind === "pack" ? `${p.sessions} sessions` : "Unlimited"} · {p.months} month{p.months === 1 ? "" : "s"}</div>
            </button>))}</div>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Members</h2>
        <Card className="!p-0 overflow-hidden">
          {members.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No members yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line text-left text-[13px] text-muted"><tr><th className="px-5 py-3 font-semibold">Client</th><th className="px-3 py-3 font-semibold">Plan</th><th className="px-3 py-3 font-semibold">Left</th><th className="px-3 py-3 font-semibold">Valid until</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-5 py-3" /></tr></thead>
              <tbody className="divide-y divide-line">{members.map((m) => { const c = data.contacts.find((x) => x.id === m.contact_id), p = data.plans.find((x) => x.id === m.plan_id), st = status(m); return (
                <tr key={m.id}>
                  <td className="px-5 py-3">{c ? <Link href={`/contacts/${c.id}`} className="font-semibold text-ink hover:text-teal-d">{c.name}</Link> : "–"}</td>
                  <td className="px-3 py-3">{p?.name ?? "–"}</td>
                  <td className="px-3 py-3">{m.credits === null ? "Unlimited" : `${m.credits} session${m.credits === 1 ? "" : "s"}`}</td>
                  <td className="px-3 py-3 text-muted">{m.ends_on ?? "–"}</td>
                  <td className="px-3 py-3"><Badge tone={st === "active" ? "green" : "gray"}>{st === "active" ? "Active" : st === "expired" ? "Expired" : "Cancelled"}</Badge></td>
                  <td className="px-5 py-3 text-right">{st === "active" && <button type="button" onClick={() => update("memberships", m.id, { status: "cancelled" }).then(() => toast("Membership cancelled"))} className="text-[13px] font-semibold text-muted hover:text-rose">Cancel</button>}</td>
                </tr>); })}</tbody>
            </table></div>
          )}
        </Card>
        <p className="flex items-start gap-2 text-[13px] text-muted"><Icon name="info" className="mt-0.5 size-4 shrink-0" />The CRM records memberships and credits. It doesn&apos;t take card payments yet, so collect payment with your usual card reader or invoicing.</p>
      </section>
      {plan && <PlanModal plan={plan === "new" ? undefined : plan} onClose={() => setPlan(null)} />}
      {sell && <SellModal onClose={() => setSell(false)} />}
    </div>
  );
}
