// Sends one email to a set of contacts and records it as a "send" (campaign) with per-recipient logs.
import { callApi } from "./api";
import { fill } from "./format";
import { emailVars, parseDesign, plainOf } from "./emailDesign";
import type { Contact, Settings } from "./types";
import type { useCrm } from "./store";

type Crm = ReturnType<typeof useCrm>;

export interface SendJob {
  name: string; subject: string; body: string;
  recipients: Contact[];
  /** Marketing adds the unsubscribe link and address. One-to-one reads like a personal email. */
  marketing: boolean;
  /** Shown in the sends list, e.g. "List: vip" or "Sarah Collins". */
  audienceLabel: string;
}

export async function runSend(job: SendJob, crm: Pick<Crm, "add" | "update">, settings: Settings | null, onProgress?: (done: number, total: number) => void) {
  const { add, update } = crm;
  const camp = await add("campaigns", {
    name: job.name.trim() || job.subject.trim(), subject: job.subject.trim(), body: job.body, audience: `label:${job.audienceLabel}`,
    status: "draft", sent_count: 0, failed_count: 0, sent_at: null,
  });
  if (!camp) throw new Error("Couldn't start the send.");
  const design = parseDesign(job.body);
  const sig = settings?.signature?.trim();
  let ok = 0, bad = 0, demo = false;
  for (const c of job.recipients) {
    const subject = fill(job.subject, c);
    const text = design ? plainOf(job.body, emailVars(c, settings)) : fill(job.body.trimEnd(), c) + (!job.marketing && sig ? `\n\n${sig}` : "");
    const trackId = crypto.randomUUID();
    try {
      const r = await callApi<{ status: "sent" | "demo" }>("/api/email/send", { to: c.email, subject, body: text, design: design ?? undefined, contactId: c.id, marketing: job.marketing, trackId });
      if (r.status === "demo") demo = true;
      await add("emails", { id: trackId, contact_id: c.id, to_email: c.email, subject, body: text, status: r.status, error: "", campaign_id: camp.id } as never);
      ok++;
    } catch (e) {
      await add("emails", { contact_id: c.id, to_email: c.email, subject, body: text, status: "failed", error: (e as Error).message, campaign_id: camp.id });
      bad++;
    }
    onProgress?.(ok + bad, job.recipients.length);
  }
  await update("campaigns", camp.id, { status: "sent", sent_count: ok, failed_count: bad, sent_at: new Date().toISOString() });
  return { ok, bad, demo, id: camp.id };
}

/** Readable audience for older and newer sends. */
export const audienceText = (a: string) => (a.startsWith("label:") ? a.slice(6) : a === "all" ? "All contacts" : `Tagged ${a}`);
