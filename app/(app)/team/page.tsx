"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, Button, Card, ConfirmModal, Field, Modal, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { isDemo } from "@/lib/config";
import { callApi } from "@/lib/api";
import { ROLES, can, roleLabel } from "@/lib/perm";
import type { Member, Role } from "@/lib/types";

type MRole = Member["role"];
const MATRIX: [string, Role[]][] = [
  ["See all contacts and deals", ["owner", "admin", "manager", "viewer"]],
  ["Create and edit records", ["owner", "admin", "manager", "rep"]],
  ["Assign leads and deals to others", ["owner", "admin", "manager"]],
  ["Delete contacts and deals", ["owner", "admin", "manager"]],
  ["Export data", ["owner", "admin", "manager"]],
  ["Change settings, pipelines and objects", ["owner", "admin"]],
  ["Invite and manage the team", ["owner", "admin"]],
];

function InviteModal({ onClose }: { onClose: () => void }) {
  const { add, toast, me } = useCrm();
  const [f, setF] = useState({ name: "", email: "", role: "rep" as MRole, own_only: false });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  async function send(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!f.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setErr("Add a name and a valid email address.");
    setBusy(true);
    try {
      if (isDemo) { await add("org_members", { org_id: "demo", user_id: null, email: f.email.trim().toLowerCase(), name: f.name.trim(), role: f.role, status: "invited", own_only: f.own_only }); toast("Demo: invite recorded (no email sent)"); onClose(); return; }
      const r = await callApi<{ emailed: boolean; link?: string; emailError?: string }>("/api/team", { action: "invite", ...f });
      if (r.emailed) { toast(`Invite sent to ${f.email}`); onClose(); }
      else { setLink(r.link ?? ""); setErr(`The invite was created but the email didn't send (${r.emailError ?? "email not set up"}). Copy the link below and send it yourself.`); }
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }
  return (
    <Modal title="Invite a team member" onClose={onClose} wide>
      <form onSubmit={send} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input className="field" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Aisha Khan" /></Field>
          <Field label="Work email"><input className="field" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="aisha@yourbusiness.com" /></Field>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold text-ink">Role</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLES.filter((r) => r.id !== "admin" || me.role === "owner").map((r) => (
              <button key={r.id} type="button" aria-pressed={f.role === r.id} onClick={() => setF({ ...f, role: r.id })} className={`rounded-2xl border p-3.5 text-left ${f.role === r.id ? "border-teal bg-teal-t/40 ring-2 ring-teal/20" : "border-line hover:border-teal/50"}`}>
                <div className="text-sm font-semibold text-ink">{r.label}</div><div className="mt-0.5 text-[12.5px] text-muted">{r.text}</div>
              </button>
            ))}
          </div>
        </div>
        {f.role === "rep" && <label className="flex items-start gap-2 rounded-xl bg-cloud px-4 py-3 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-[#0b8a8a]" checked={f.own_only} onChange={(e) => setF({ ...f, own_only: e.target.checked })} /><span><strong>Only their own records.</strong> They see contacts and deals assigned to them, plus unassigned ones.</span></label>}
        <p className="text-[13px] text-muted">They get an email with a link to set their password. Sales reps and managers are added to the lead rotation automatically.</p>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        {link && <div className="flex gap-2"><input className="field font-mono !text-[12px]" readOnly value={link} onFocus={(e) => e.target.select()} /><Button type="button" variant="soft" onClick={() => navigator.clipboard?.writeText(link).then(() => toast("Copied"))}>Copy</Button></div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="soft" onClick={onClose}>{link ? "Done" : "Cancel"}</Button>{!link && <Button type="submit" icon="send" disabled={busy}>{busy ? "Sending…" : "Send invite"}</Button>}</div>
      </form>
    </Modal>
  );
}

export default function TeamPage() {
  const { data, settings, saveSettings, update, remove, toast, me, userEmail } = useCrm();
  const [invite, setInvite] = useState(false);
  const [del, setDel] = useState<Member | null>(null);
  const allowed = can(me.role, "team");
  const reps = settings?.reps ?? [];
  const members = [...data.org_members].sort((a, b) => a.name.localeCompare(b.name));

  async function act(m: Member, body: Record<string, unknown>, msg: string) {
    try {
      if (isDemo) {
        if (body.action === "remove") await remove("org_members", m.id);
        else if (body.action === "update") { const { action: _a, id: _i, ...patch } = body; void _a; void _i; await update("org_members", m.id, patch as Partial<Member>); }
      } else await callApi("/api/team", { ...body, id: m.id });
      toast(msg);
      if (!isDemo) location.reload();
    } catch (x) { toast((x as Error).message, "error"); }
  }
  const rotate = async (name: string, on: boolean) => saveSettings({ reps: on ? [...new Set([...reps, name])] : reps.filter((r) => r !== name) });

  if (!allowed) return (
    <div className="space-y-6"><PageHeader title="Team" sub="People who use this CRM." />
      <Card><p>You&apos;re signed in as <strong>{roleLabel(me.role)}</strong>. Only the owner or an admin can manage the team.</p>
        <ul className="mt-4 divide-y divide-line">{members.filter((m) => m.status !== "disabled").map((m) => <li key={m.id} className="flex items-center gap-3 py-2.5"><Avatar name={m.name} size="size-8 text-xs" /><span className="font-semibold">{m.name}</span><Badge>{roleLabel(m.role)}</Badge></li>)}</ul></Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Team and permissions" sub="Invite people, choose what they can do, and decide who gets new leads." action={<Button icon="plus" onClick={() => setInvite(true)}>Invite member</Button>} />

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-line bg-[#f8f9fc] text-left text-[13px] text-muted"><tr><th className="px-5 py-3 font-semibold">Member</th><th className="px-3 py-3 font-semibold">Role</th><th className="px-3 py-3 font-semibold">Can see</th><th className="px-3 py-3 font-semibold">Gets new leads</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-5 py-3" /></tr></thead>
            <tbody className="divide-y divide-line">
              <tr>
                <td className="px-5 py-3"><span className="flex items-center gap-3"><Avatar name={me.role === "owner" ? me.name : "Owner"} size="size-9 text-xs" /><span><span className="block font-semibold text-ink">{me.role === "owner" ? `${me.name} (you)` : "Account owner"}</span><span className="block text-[12.5px] text-muted">{me.role === "owner" ? userEmail : ""}</span></span></span></td>
                <td className="px-3 py-3"><Badge tone="iris">Owner</Badge></td><td className="px-3 py-3 text-muted">Everything</td>
                <td className="px-3 py-3">{me.role === "owner" && <input type="checkbox" aria-label="You get new leads" className="size-4 accent-[#0b8a8a]" checked={reps.includes(me.name)} onChange={(e) => rotate(me.name, e.target.checked)} />}</td>
                <td className="px-3 py-3"><Badge tone="green">Active</Badge></td><td />
              </tr>
              {members.map((m) => {
                const lockAdmin = m.role === "admin" && me.role !== "owner";
                return (
                  <tr key={m.id} className={m.status === "disabled" ? "opacity-60" : ""}>
                    <td className="px-5 py-3"><span className="flex items-center gap-3"><Avatar name={m.name} size="size-9 text-xs" /><span><span className="block font-semibold text-ink">{m.name}{m.email.toLowerCase() === userEmail.toLowerCase() ? " (you)" : ""}</span><span className="block text-[12.5px] text-muted">{m.email}</span></span></span></td>
                    <td className="px-3 py-3"><select className="field !h-9 !w-36 !py-0" aria-label={`${m.name}'s role`} value={m.role} disabled={lockAdmin} onChange={(e) => act(m, { action: "update", role: e.target.value }, "Role updated")}>{ROLES.filter((r) => r.id !== "admin" || me.role === "owner" || m.role === "admin").map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></td>
                    <td className="px-3 py-3">{m.role === "rep" ? <select className="field !h-9 !w-44 !py-0" aria-label={`What ${m.name} can see`} value={m.own_only ? "own" : "all"} onChange={(e) => act(m, { action: "update", own_only: e.target.value === "own" }, "Access updated")}><option value="all">All records</option><option value="own">Only their own</option></select> : <span className="text-muted">{m.role === "viewer" ? "All (read-only)" : "All records"}</span>}</td>
                    <td className="px-3 py-3">{m.role !== "viewer" && <input type="checkbox" aria-label={`${m.name} gets new leads`} className="size-4 accent-[#0b8a8a]" checked={reps.includes(m.name)} onChange={(e) => rotate(m.name, e.target.checked)} />}</td>
                    <td className="px-3 py-3"><Badge tone={m.status === "active" ? "green" : m.status === "invited" ? "sun" : "gray"}>{m.status === "active" ? "Active" : m.status === "invited" ? "Invited" : "Disabled"}</Badge></td>
                    <td className="px-5 py-3">
                      {!lockAdmin && <div className="flex items-center justify-end gap-1">
                        {m.status === "invited" && <button type="button" onClick={() => act(m, { action: "resend" }, "Invite sent again")} className="rounded-full px-2.5 py-1 text-[13px] font-semibold text-teal-d hover:bg-teal-t">Resend</button>}
                        <button type="button" onClick={() => act(m, { action: "update", status: m.status === "disabled" ? "active" : "disabled" }, m.status === "disabled" ? "Access restored" : "Access turned off")} className="rounded-full px-2.5 py-1 text-[13px] font-semibold text-body hover:bg-cloud">{m.status === "disabled" ? "Enable" : "Disable"}</button>
                        <button type="button" onClick={() => setDel(m)} aria-label={`Remove ${m.name}`} className="grid size-8 place-items-center rounded-full text-[#b3bdd2] hover:bg-rose-t hover:text-rose"><Icon name="trash" className="size-4" /></button>
                      </div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {members.length === 0 && <p className="text-sm text-muted">No team members yet. Invite your first one to share leads and deals.</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <h2 className="mb-3 font-semibold">What each role can do</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-[12.5px] text-muted"><tr><th className="py-2 pr-3 font-semibold" />{(["owner", "admin", "manager", "rep", "viewer"] as Role[]).map((r) => <th key={r} className="px-2 py-2 text-center font-semibold">{roleLabel(r)}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{MATRIX.map(([l, who]) => <tr key={l}><td className="py-2.5 pr-3 text-ink">{l}</td>{(["owner", "admin", "manager", "rep", "viewer"] as Role[]).map((r) => <td key={r} className="px-2 py-2.5 text-center">{who.includes(r) ? <span className="text-teal-d" aria-label="Yes">✓</span> : <span className="text-[#c3cad9]" aria-label="No">–</span>}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="mt-3 text-[12.5px] text-muted">These rules are enforced by the database, not just hidden in the app.</p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">How new leads are assigned</h2>
          <p className="text-sm text-muted">New leads from forms, your website and ads go to the people ticked under &ldquo;Gets new leads&rdquo;, taking turns (round robin). You can reassign any deal or contact from its record, or many at once from the Deals table and Contacts list.</p>
          <ul className="mt-3 space-y-1.5">{reps.length === 0 ? <li className="text-sm text-muted">Nobody is in the rotation, so new leads stay unassigned.</li> : reps.map((r, i) => <li key={r} className="flex items-center gap-2 text-sm"><span className="grid size-6 place-items-center rounded-full bg-cloud text-[12px] font-bold">{i + 1}</span>{r}</li>)}</ul>
        </Card>
      </div>
      {invite && <InviteModal onClose={() => setInvite(false)} />}
      {del && <ConfirmModal title={`Remove ${del.name}?`} text="They lose access straight away. Their deals and contacts stay, still assigned to them, so you can reassign them." onClose={() => setDel(null)} onConfirm={async () => { await act(del, { action: "remove" }, `${del.name} removed`); setDel(null); }} />}
    </div>
  );
}
