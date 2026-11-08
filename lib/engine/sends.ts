// Scheduled sends: when a scheduled email's time comes, the engine sends it (in the cloud every minute,
// or in this browser in demo mode). Large sends are done in batches across ticks.
import type { Db, Port } from "./engine";
import type { Campaign, Contact, Settings } from "../types";
import { fill } from "../format";
import { emailVars, parseDesign, plainOf } from "../emailDesign";

export interface SendSpec { mode: "one" | "pick" | "list" | "all"; ids: string[]; lists: string[]; exclude: string[]; marketing: boolean }

export function resolveRecipients(spec: SendSpec, contacts: Contact[]): Contact[] {
  let base: Contact[] = [];
  if (spec.mode === "one" || spec.mode === "pick") base = contacts.filter((c) => spec.ids.includes(c.id));
  if (spec.mode === "list") base = contacts.filter((c) => c.tags.some((t) => spec.lists.includes(t)));
  if (spec.mode === "all") base = contacts;
  return base.filter((c) => c.email && !c.tags.some((t) => spec.exclude.includes(t)) && (!spec.marketing || !c.unsubscribed));
}

const BUDGET_MS = 35_000;

export async function runScheduledSends(db: Db, port: Port, contacts: Contact[], settings: Settings | undefined): Promise<number> {
  const now = port.now();
  const due = (await db.list("campaigns")).filter((c) => (c.status === "scheduled" || c.status === "sending") && c.scheduled_at && new Date(c.scheduled_at).getTime() <= now);
  if (!due.length) return 0;
  const started = Date.now();
  let sent = 0;
  for (const camp of due) {
    if (Date.now() - started > BUDGET_MS) break;
    // Take it with a 2-minute lease so two processes never send the same email.
    if (!(await db.claimCampaign(camp.id, new Date(now + 120_000).toISOString(), new Date(now).toISOString()))) continue;
    const spec = camp.spec as SendSpec | null;
    if (!spec) { await db.update("campaigns", camp.id, { status: "canceled" } as Partial<Campaign>); continue; }
    const already = new Set((await db.list("emails")).filter((e) => e.campaign_id === camp.id).map((e) => e.contact_id));
    const todo = resolveRecipients(spec, contacts).filter((c) => !already.has(c.id));
    const design = parseDesign(camp.body);
    let ok = camp.sent_count, bad = camp.failed_count, finished = true;
    for (const c of todo) {
      if (Date.now() - started > BUDGET_MS) { finished = false; break; }
      const subject = fill(camp.subject, c);
      const vars = emailVars(c, settings);
      const sig = settings?.signature?.trim();
      const body = design ? plainOf(camp.body, vars) : fill(camp.body.trimEnd(), c) + (!spec.marketing && sig ? `\n\n${sig}` : "");
      const trackId = crypto.randomUUID();
      const r = await port.email({ to: c.email, subject, body, contactId: c.id, marketing: spec.marketing, design: design ?? undefined, vars, trackId });
      await db.insert("emails", { id: trackId, contact_id: c.id, to_email: c.email, subject, body, status: r.status === "failed" ? "failed" : r.status === "demo" ? "demo" : "sent", error: r.error ?? "", campaign_id: camp.id, created_at: new Date(port.now()).toISOString() } as never);
      if (r.status === "failed") bad++; else ok++;
      sent++;
    }
    await db.update("campaigns", camp.id, finished
      ? { status: "sent", sent_count: ok, failed_count: bad, sent_at: new Date().toISOString() }
      : ({ status: "sending", sent_count: ok, failed_count: bad, scheduled_at: new Date().toISOString() } as Partial<Campaign>));
  }
  return sent;
}
