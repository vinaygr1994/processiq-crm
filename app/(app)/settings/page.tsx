"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, ConfirmModal, Field, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { isDemo } from "@/lib/config";
import { toCsv } from "@/lib/csv";
import { useStatus } from "@/lib/status";

export default function SettingsPage() {
  const { settings, saveSettings, data, userEmail, signOut, resetDemoData, toast } = useCrm();
  const status = useStatus();
  const [f, setF] = useState({ business_name: "", sender_name: "", reply_to: "", address: "", signature: "", reps: "", owner_email: "", review_link: "", booking_link: "" });
  const [reset, setReset] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (settings) setF({ business_name: settings.business_name, sender_name: settings.sender_name, reply_to: settings.reply_to, address: settings.address, signature: settings.signature, reps: (settings.reps ?? []).join(", "), owner_email: settings.owner_email ?? "", review_link: settings.review_link ?? "", booking_link: settings.booking_link ?? "" });
  }, [settings]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); setDirty(true); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await saveSettings({ ...f, reps: f.reps.split(",").map((x) => x.trim()).filter(Boolean) });
    setDirty(false);
    toast("Settings saved");
  }
  function exportContacts() {
    const rows = [["Name", "Email", "Phone", "Company", "Tags", "Source", "Unsubscribed", "Added"],
      ...data.contacts.map((c) => [c.name, c.email, c.phone, c.company, c.tags.join("; "), c.source, c.unsubscribed ? "yes" : "no", c.created_at.slice(0, 10)])];
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "contacts.csv" });
    a.click();
    URL.revokeObjectURL(url);
  }

  const Check = ({ ok, label, hint }: { ok: boolean; label: string; hint: string }) => (
    <li className="flex items-start gap-3 py-3">
      <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${ok ? "bg-teal text-white" : "bg-sun-t text-[#9a5a00]"}`}><Icon name={ok ? "check" : "alert"} className="size-3.5" /></span>
      <div><div className="font-semibold text-ink">{label} <Badge tone={ok ? "green" : "sun"}>{ok ? "Connected" : "Not connected"}</Badge></div><div className="text-sm text-muted">{hint}</div></div>
    </li>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" sub="Your business details and connections." />

      <Card>
        <h2 className="mb-1 text-lg font-semibold">Your business</h2>
        <p className="mb-5 text-muted">Used on the emails you send. Your mailing address is required by law on marketing emails.</p>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name"><input className="field" value={f.business_name} onChange={set("business_name")} placeholder="e.g. Greenleaf Renovations" /></Field>
            <Field label="Your name (shown as the sender)"><input className="field" value={f.sender_name} onChange={set("sender_name")} placeholder="e.g. Priya from Greenleaf" /></Field>
          </div>
          <Field label="Reply-to email" hint="Where replies to your emails should go."><input className="field" type="email" value={f.reply_to} onChange={set("reply_to")} placeholder="you@yourbusiness.com" /></Field>
          <Field label="Mailing address"><input className="field" value={f.address} onChange={set("address")} placeholder="123 Main St, Toronto, ON" /></Field>
          <Field label="Email signature" hint="Added to the end of every email you send."><textarea className="field !min-h-[90px]" value={f.signature} onChange={set("signature")} placeholder={"Best regards,\nPriya\nGreenleaf Renovations"} /></Field>
          <div className="flex justify-end"><Button type="submit" disabled={!dirty}>Save changes</Button></div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">Team &amp; links</h2>
        <p className="mb-5 text-muted">Used by autopilot to assign leads, alert you and fill in your emails.</p>
        <form onSubmit={save} className="space-y-4">
          <Field label="Your reps" hint="Comma separated. New leads are shared between them in turn."><input className="field" value={f.reps} onChange={set("reps")} placeholder="Maria, Dan" /></Field>
          <Field label="Owner alert email" hint="Where manager alerts go."><input className="field" type="email" value={f.owner_email} onChange={set("owner_email")} placeholder="you@yourbusiness.com" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Google review link"><input className="field" type="url" value={f.review_link} onChange={set("review_link")} placeholder="https://g.page/r/..." /></Field>
            <Field label="Booking link (optional)"><input className="field" type="url" value={f.booking_link} onChange={set("booking_link")} placeholder="https://..." /></Field>
          </div>
          <div className="flex justify-end"><Button type="submit" disabled={!dirty}>Save changes</Button></div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">Connections</h2>
        <p className="text-muted">What&apos;s switched on for this CRM.</p>
        <ul className="mt-2 divide-y divide-line">
          <Check ok={!isDemo} label="Database & login" hint={isDemo ? "Running in demo mode: data stays in this browser. Add Supabase keys to save data online." : "Your data is stored securely in Supabase."} />
          <Check ok={!!status?.email} label="Email sending (Resend)" hint={status?.email ? `Sending from ${status.from}.` : "Add RESEND_API_KEY and RESEND_FROM_EMAIL in your hosting settings."} />
          <Check ok={!!status?.unsubscribe} label="Unsubscribe links" hint="Needed for campaigns. Add SUPABASE_SERVICE_ROLE_KEY in your hosting settings." />
          <Check ok={!!status?.ai} label="AI assistant (Claude)" hint={status?.ai ? "AI drafts and summaries are live." : "Add ANTHROPIC_API_KEY to turn on real AI. Until then you'll see sample output."} />
        </ul>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">Your data</h2>
        <p className="mb-4 text-muted">Your contacts are always yours. Download them any time.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" icon="download" onClick={exportContacts}>Export contacts (CSV)</Button>
          {isDemo ? <Button variant="danger" onClick={() => setReset(true)}>Reset demo data</Button> : <Button variant="soft" icon="logout" onClick={signOut}>Log out</Button>}
        </div>
        {!isDemo && <p className="mt-3 text-sm text-muted">Signed in as {userEmail}</p>}
      </Card>
      {reset && <ConfirmModal title="Reset demo data?" text="This restores the sample contacts and removes anything you added." confirmLabel="Reset" onClose={() => setReset(false)} onConfirm={resetDemoData} />}
    </div>
  );
}
