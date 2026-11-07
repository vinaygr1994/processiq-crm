"use client";
import { useState } from "react";
import { Button, Field, Modal } from "./ui";
import { EmailEditor } from "./EmailEditor";
import { parseDesign, plainOf, emailVars } from "@/lib/emailDesign";
import { useCrm } from "@/lib/store";
import { callApi } from "@/lib/api";
import { fill } from "@/lib/format";
import { useStatus } from "@/lib/status";
import type { Contact } from "@/lib/types";

const GOALS = ["Follow up on my quote", "Say thank you", "Ask for a quick call", "Check in after a quiet spell"];

export function EmailComposer({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { data, settings, add, toast } = useCrm();
  const recent = data.activities.filter((a) => a.contact_id === contact.id).slice(0, 4).map((a) => `${a.kind}: ${a.body}`);
  const status = useStatus();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  const signature = settings?.signature?.trim() || settings?.sender_name?.trim() || "";

  async function send() {
    setErr("");
    const design = parseDesign(body);
    if (!contact.email) return setErr("This contact has no email address yet.");
    if (!subject.trim() || (design ? design.blocks.length === 0 : !body.trim())) return setErr("Please add a subject and a message.");
    setSending(true);
    const subj = fill(subject.trim(), contact);
    // Designed emails are personalised and given their footer on the server; plain ones get your signature here.
    const finalBody = design ? plainOf(body, emailVars(contact, settings)) : fill(body.trimEnd(), contact) + (signature ? `\n\n${signature}` : "");
    const trackId = crypto.randomUUID();
    try {
      const r = await callApi<{ status: "sent" | "demo"; }>("/api/email/send", { to: contact.email, subject: subj, body: finalBody, design: design ?? undefined, contactId: contact.id, trackId });
      await add("emails", { id: trackId, contact_id: contact.id, to_email: contact.email, subject: subj, body: finalBody, status: r.status, error: "", campaign_id: null } as never);
      toast(r.status === "demo" ? "Demo: saved to history (not really sent)" : "Email sent");
      onClose();
    } catch (e) {
      await add("emails", { contact_id: contact.id, to_email: contact.email, subject: subj, body: finalBody, status: "failed", error: (e as Error).message, campaign_id: null });
      setErr((e as Error).message);
    }
    setSending(false);
  }

  return (
    <Modal title={`Email ${contact.name}`} onClose={onClose} wide="xl">
      <div className="space-y-4">
        {status && !status.demo && !status.email && (
          <p className="rounded-xl bg-sun-t px-4 py-3 text-sm text-[#7a4700]">Email sending isn&apos;t connected yet. Add your Resend key in Settings → Email to send for real.</p>
        )}
        <Field label="To"><input className="field !bg-cloud" readOnly value={contact.email || "No email address"} /></Field>
        <EmailEditor subject={subject} body={body} onSubject={setSubject} onBody={setBody} contact={contact}
          aiContact={{ name: contact.name, company: contact.company }} aiRecent={recent} goals={GOALS} />
        {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="soft" onClick={onClose}>Cancel</Button>
          <Button icon="send" onClick={send} disabled={sending}>{sending ? "Sending…" : "Send email"}</Button>
        </div>
      </div>
    </Modal>
  );
}
