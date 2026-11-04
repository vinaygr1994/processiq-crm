"use client";
import { useState } from "react";
import { AiButton, Button, Field, Modal } from "./ui";
import { useCrm } from "@/lib/store";
import { callApi } from "@/lib/api";
import { aiDraftEmail } from "@/lib/ai";
import { fill } from "@/lib/format";
import { useStatus } from "@/lib/status";
import type { Contact } from "@/lib/types";

const GOALS = ["Follow up on my quote", "Say thank you", "Ask for a quick call", "Check in after a quiet spell"];

export function EmailComposer({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { data, settings, add, toast } = useCrm();
  const status = useStatus();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [goal, setGoal] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [aiNote, setAiNote] = useState("");

  const signature = settings?.signature?.trim() || settings?.sender_name?.trim() || "";

  async function draft() {
    setErr(""); setAiNote("");
    if (!goal.trim()) return setErr("Tell the AI what this email is about first (or tap one of the ideas).");
    setAiBusy(true);
    try {
      const recent = data.activities.filter((a) => a.contact_id === contact.id).slice(0, 4).map((a) => `${a.kind}: ${a.body}`);
      const r = await aiDraftEmail({
        goal, contact: { name: contact.name, company: contact.company },
        business: settings?.business_name ?? "", sender: settings?.sender_name ?? "", recent,
        previous: body ? { subject, body } : undefined,
      });
      setSubject(r.result.subject); setBody(r.result.body);
      if (!r.live) setAiNote("This is a sample draft. Add an Anthropic API key to get personalised drafts.");
    } catch (e) { setErr((e as Error).message); }
    setAiBusy(false);
  }

  function useTemplate(id: string) {
    const t = data.templates.find((x) => x.id === id);
    if (t) { setSubject(fill(t.subject, contact)); setBody(fill(t.body, contact)); }
  }

  async function send() {
    setErr("");
    if (!contact.email) return setErr("This contact has no email address yet.");
    if (!subject.trim() || !body.trim()) return setErr("Please add a subject and a message.");
    setSending(true);
    const finalBody = body.trimEnd() + (signature ? `\n\n${signature}` : "");
    try {
      const r = await callApi<{ status: "sent" | "demo"; }>("/api/email/send", { to: contact.email, subject: subject.trim(), body: finalBody, contactId: contact.id });
      await add("emails", { contact_id: contact.id, to_email: contact.email, subject: subject.trim(), body: finalBody, status: r.status, error: "", campaign_id: null });
      toast(r.status === "demo" ? "Demo: saved to history (not really sent)" : "Email sent");
      onClose();
    } catch (e) {
      await add("emails", { contact_id: contact.id, to_email: contact.email, subject: subject.trim(), body: finalBody, status: "failed", error: (e as Error).message, campaign_id: null });
      setErr((e as Error).message);
    }
    setSending(false);
  }

  return (
    <Modal title={`Email ${contact.name}`} onClose={onClose} wide>
      <div className="space-y-4">
        {status && !status.demo && !status.email && (
          <p className="rounded-xl bg-sun-t px-4 py-3 text-sm text-[#7a4700]">Email sending isn&apos;t connected yet. Add your Resend key in Settings → Email to send for real.</p>
        )}
        <div className="rounded-2xl border border-line bg-gradient-to-br from-white to-iris-t/40 p-4">
          <div className="mb-2 text-sm font-semibold text-ink">Write it with AI</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className="field" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What's this email about?" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), draft())} />
            <AiButton onClick={draft} busy={aiBusy}>{body ? "Rewrite" : "Write draft"}</AiButton>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {GOALS.map((g) => <button key={g} type="button" onClick={() => setGoal(g)} className="rounded-full border border-line bg-white px-3 py-1 text-[13px] font-medium text-body hover:bg-cloud">{g}</button>)}
          </div>
          {aiNote && <p className="mt-2 text-[13px] text-muted">{aiNote}</p>}
        </div>
        {data.templates.length > 0 && (
          <Field label="Or start from a template">
            <select className="field" defaultValue="" onChange={(e) => useTemplate(e.target.value)}>
              <option value="" disabled>Choose a template…</option>
              {data.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="To"><input className="field !bg-cloud" readOnly value={contact.email || "No email address"} /></Field>
        <Field label="Subject"><input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Message" hint={signature ? "Your signature is added automatically." : "Tip: add a signature in Settings."}>
          <textarea className="field !min-h-[180px]" value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="soft" onClick={onClose}>Cancel</Button>
          <Button icon="send" onClick={send} disabled={sending}>{sending ? "Sending…" : "Send email"}</Button>
        </div>
      </div>
    </Modal>
  );
}
