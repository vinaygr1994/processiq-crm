// Scheduled sends: when a scheduled email's time comes, the engine sends it (in the cloud every minute,
// or in this browser in demo mode). Large sends are done in batches across ticks.
import type { Db, Port } from "./engine";
import type { Campaign, Contact, Settings } from "../types";
import { fill } from "../format";
import { emailVars, parseDesign, plainOf } from "../emailDesign";
import { SEG, membersOf, segCtx, type SegCtx } from "../segments";
import type { Segment } from "../types";
import { DE, deEmails, deMembers, fillVars, newContact } from "../deSend";

/** des: data extensions to send to (mode "de"). exclude can hold lists, "seg:<id>" segments and "de:<id>" data extensions. */
export interface SendSpec { mode: "one" | "pick" | "list" | "all" | "de"; ids: string[]; lists: string[]; exclude: string[]; marketing: boolean; des?: string[] }

/** Everyone the send should reach right now. Lists can be tags or smart segments ("seg:<id>"). */
export function resolveRecipients(spec: SendSpec, contacts: Contact[], segments: Segment[] = [], x: SegCtx | null = null): Contact[] {
  const union = (keys: string[]) => new Set(keys.flatMap((k) => membersOf(k, contacts, segments, x).map((c) => c.id)));
  let base: Contact[] = [];
  if (spec.mode === "one" || spec.mode === "pick") base = contacts.filter((c) => spec.ids.includes(c.id));
  if (spec.mode === "list") { const ids = union(spec.lists); base = contacts.filter((c) => ids.has(c.id)); }
  if (spec.mode === "all") base = contacts;
  const out = union(spec.exclude);
  return base.filter((c) => c.email && !out.has(c.id) && (!spec.marketing || !c.unsubscribed));
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
    const emails = await db.list("emails");
    const already = new Set(emails.filter((e) => e.campaign_id === camp.id).map((e) => e.contact_id));
    const usesSeg = [...spec.lists, ...spec.exclude].some((k) => k.startsWith(SEG));
    const segments = usesSeg ? await db.list("segments").catch(() => []) : [];
    const x = usesSeg ? segCtx(emails, await db.list("deals"), await db.list("workflow_runs"), now) : null;
    // Data extensions are read at send time, so rows added after scheduling are included.
    const usesDe = spec.mode === "de" || spec.exclude.some((k) => k.startsWith(DE));
    const des = usesDe ? await db.list("data_extensions").catch(() => []) : [];
    const rows = usesDe ? await db.list("de_rows").catch(() => []) : [];
    const varsOf = new Map<string, Record<string, string>>();
    let pool = contacts;
    if (spec.mode === "de") {
      const r = deMembers(spec.des ?? [], des, rows, contacts);
      r.matched.forEach((m) => varsOf.set(m.contact.id, m.vars));
      const made: Contact[] = [];
      for (const f of r.fresh) {
        try { const c = await db.insert("contacts", { ...newContact(f), created_at: new Date(port.now()).toISOString() } as never) as Contact; made.push(c); varsOf.set(c.id, f.vars); } catch { /* skip a row that can't become a contact */ }
      }
      pool = [...contacts, ...made];
    }
    const outMail = deEmails(spec.exclude.filter((k) => k.startsWith(DE)).map((k) => k.slice(DE.length)), des, rows, pool);
    const todo = resolveRecipients({ ...spec, ids: spec.mode === "de" ? [...varsOf.keys()] : spec.ids, mode: spec.mode === "de" ? "pick" : spec.mode, exclude: spec.exclude.filter((k) => !k.startsWith(DE)) }, pool, segments, x)
      .filter((c) => !already.has(c.id) && !outMail.has(c.email.toLowerCase()));
    const design = parseDesign(camp.body);
    let ok = camp.sent_count, bad = camp.failed_count, finished = true;
    for (const c of todo) {
      if (Date.now() - started > BUDGET_MS) { finished = false; break; }
      const extra = varsOf.get(c.id) ?? {};
      const subject = fill(fillVars(camp.subject, extra), c);
      const vars = { ...emailVars(c, settings), ...extra };
      const sig = settings?.signature?.trim();
      const body = design ? plainOf(camp.body, vars) : fill(fillVars(camp.body.trimEnd(), extra), c) + (!spec.marketing && sig ? `\n\n${sig}` : "");
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
