import type { AutoLog, Contact, Deal, Settings, Tables, Task, Visit, Workflow, WorkflowRun } from "../types";
import { mergeVars, render } from "./merge";
import { nextTimeOfDay } from "./tz";
import type { Cond, Step } from "./types";
import { branches, uid } from "./types";
import { isDesign, parseDesign, plainOf, emailVars, type Design } from "../emailDesign";
import { runScheduledSends } from "./sends";
import { inSegment, segCtx } from "../segments";

/** Minimal storage the engine needs. Implemented for localStorage (demo) and Supabase (live / server). */
export interface Db {
  list<K extends keyof Tables>(table: K): Promise<Tables[K][]>;
  insert<K extends keyof Tables>(table: K, row: Omit<Tables[K], "id" | "created_at"> & { created_at?: string }): Promise<Tables[K]>;
  update<K extends keyof Tables>(table: K, id: string, patch: Partial<Tables[K]>): Promise<void>;
  /** Atomically takes a run so two processes never handle it twice. */
  claim(runId: string, lockUntil: string, nowIso: string): Promise<boolean>;
  /** Atomically takes a due scheduled send (sets a short lease). */
  claimCampaign(id: string, leaseUntil: string, nowIso: string): Promise<boolean>;
}
export type SendResult = "sent" | "demo" | "failed" | "skipped";
export interface Port {
  now(): number;
  email(o: { to: string; subject: string; body: string; contactId?: string; marketing?: boolean; design?: Design; vars?: Record<string, string>; trackId?: string }): Promise<{ status: SendResult; error?: string }>;
  sms(o: { to: string; body: string; contactId?: string }): Promise<{ status: SendResult; error?: string }>;
}

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();
const dateStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/* ---------- Program counter: a path like [2, 0, 1] = step 2 → "then" branch → step 1 ---------- */
export function stepAt(steps: Step[], pos: number[]): Step | null {
  let list = steps;
  for (let i = 0; i < pos.length; i += 2) {
    const s = list[pos[i]];
    if (!s) return null;
    if (i + 1 >= pos.length) return s;
    const br = branches(s);
    if (!br || !br[pos[i + 1]]) return null;
    list = br[pos[i + 1]];
  }
  return null;
}
function listAt(steps: Step[], pos: number[]): Step[] {
  let list = steps;
  for (let i = 0; i + 1 < pos.length; i += 2) {
    const s = list[pos[i]];
    const br = s ? branches(s) : null;
    if (!br || !br[pos[i + 1]]) return [];
    list = br[pos[i + 1]];
  }
  return list;
}
export function advance(steps: Step[], pos: number[], by = 1): number[] {
  let p = [...pos];
  p[p.length - 1] += by;
  while (p[p.length - 1] >= listAt(steps, p).length && p.length > 1) {
    p = p.slice(0, -2);
    p[p.length - 1] += 1;
  }
  return p;
}

/* ---------- Conditions ---------- */
export function evalCond(c: Cond, deal?: Deal, contact?: Contact, visit?: Visit): boolean {
  const [obj, key] = c.field.split(".");
  const src = (obj === "deal" ? deal : obj === "contact" ? contact : visit) as unknown as Record<string, unknown> | undefined;
  const raw = src?.[key];
  const v = c.value ?? "";
  const list = Array.isArray(raw) ? (raw as string[]) : null;
  const str = list ? list.join(",") : String(raw ?? "");
  switch (c.op) {
    case "is": return list ? list.includes(v) : str.toLowerCase() === v.toLowerCase();
    case "is_not": return list ? !list.includes(v) : str.toLowerCase() !== v.toLowerCase();
    case "contains": return str.toLowerCase().includes(v.toLowerCase());
    case "gt": return Number(raw) > Number(v);
    case "lt": return Number(raw) < Number(v);
    case "empty": return !str.trim();
    case "not_empty": return !!str.trim();
  }
}

/** Stable 0-99 bucket per run and step, so a person always gets the same A/B path. */
export function bucket(key: string) { let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100; }

export interface Summary { enrolled: number; steps: number; finished: number; sent?: number }

/** One pass: notice new triggers, then run every run that is due. Safe to call as often as you like. */
export async function runEngine(db: Db, port: Port, opts: { onlyRunId?: string } = {}): Promise<Summary> {
  const sum: Summary = { enrolled: 0, steps: 0, finished: 0 };
  const now = port.now();
  let [workflows, runs, deals, contacts, visits, settingsList] = await Promise.all([
    db.list("workflows"), db.list("workflow_runs"), db.list("deals"), db.list("contacts"), db.list("visits"), db.list("settings"),
  ]);
  const settings = settingsList[0] as Settings | undefined;
  if (!opts.onlyRunId) sum.sent = await runScheduledSends(db, port, contacts, settings).catch(() => 0);
  const active = workflows.filter((w) => w.active);
  if (!active.length) return sum;
  const segTriggers = active.some((w) => w.trigger.type === "segment");
  const needsEmails = segTriggers || active.some((w) => JSON.stringify(w.steps).includes('"engage"'));
  const emails = needsEmails ? await db.list("emails") : [];
  const segments = segTriggers ? await db.list("segments").catch(() => []) : [];
  const submissions = active.some((w) => w.trigger.type === "form_submitted") ? await db.list("form_submissions").catch(() => []) : [];
  const byDeal = (id: string | null) => deals.find((d) => d.id === id);
  const byContact = (id: string | null) => contacts.find((c) => c.id === id);
  const byVisit = (id: string | null) => visits.find((v) => v.id === id);

  /* ---- 1. Enrol: look for things that just happened ---- */
  const have = new Set(runs.map((r) => `${r.workflow_id}|${r.trigger_key}`));
  async function enrol(w: Workflow, key: string, deal: Deal | null, visit: Visit | null, contact: Contact | null = null) {
    if (have.has(`${w.id}|${key}`)) return;
    have.add(`${w.id}|${key}`);
    if (deal && !visit) {
      // A newer run for the same job replaces an older one (e.g. a re-sent quote).
      for (const r of runs) if (r.workflow_id === w.id && r.deal_id === deal.id && r.status === "active" && !r.visit_id) { await db.update("workflow_runs", r.id, { status: "stopped", note: "Replaced by a newer run" }); r.status = "stopped"; }
    }
    const run = await db.insert("workflow_runs", { workflow_id: w.id, deal_id: deal?.id ?? null, contact_id: contact?.id ?? deal?.contact_id ?? visit?.contact_id ?? null, visit_id: visit?.id ?? null, trigger_key: key, pos: [0], status: "active", next_run_at: iso(now), locked_until: null, note: "", created_at: iso(now) } as never);
    runs.push(run);
    sum.enrolled++;
  }
  for (const w of active) {
    const since = Math.max(new Date(w.activated_at).getTime(), now - 30 * DAY);
    const t = w.trigger;
    if (t.type === "lead_created") for (const d of deals) if (new Date(d.created_at).getTime() >= since && (!t.source || d.source === t.source)) await enrol(w, `lead:${d.id}`, d, null);
    if (t.type === "stage_changed") for (const d of deals) if (d.stage === t.stage && new Date(d.stage_at).getTime() >= since) await enrol(w, `stage:${d.id}:${d.stage_at}`, d, null);
    if (t.type === "quote_sent") for (const d of deals) if (d.stage === "quoted" && d.quote_sent_at && new Date(d.quote_sent_at).getTime() >= since) await enrol(w, `quote:${d.id}:${d.quote_sent_at}`, d, null);
    if (t.type === "visit_booked") for (const v of visits) if (new Date(v.created_at).getTime() >= since && v.status === "scheduled") await enrol(w, `visit:${v.id}`, byDeal(v.deal_id) ?? null, v);
    if (t.type === "visit_done") for (const v of visits) if (v.status === "done" && new Date(v.starts_at).getTime() >= since) await enrol(w, `vdone:${v.id}`, byDeal(v.deal_id) ?? null, v);
    if (t.type === "contact_created") for (const c of contacts) if (new Date(c.created_at).getTime() >= since && (!t.source || c.source === t.source)) await enrol(w, `contact:${c.id}`, null, null, c);
    if (t.type === "tag_added") for (const c of contacts) if (t.tag && c.tags.includes(t.tag)) await enrol(w, `tag:${c.id}:${t.tag}`, null, null, c);
    // A one-time send to an audience: everyone who matches when the journey is switched on, plus anyone who matches later.
    if (t.type === "audience") for (const c of contacts) if (c.email && !c.unsubscribed && (!t.tag || c.tags.includes(t.tag))) await enrol(w, `aud:${c.id}`, null, null, c);
    if (t.type === "form_submitted") for (const s of submissions) {
      const c = byContact(s.contact_id);
      if (c && (!t.form || s.form_id === t.form) && new Date(s.created_at).getTime() >= since) await enrol(w, `form:${s.id}`, null, null, c);
    }
    if (t.type === "segment") {
      const s = segments.find((g) => g.id === t.segment);
      if (s) { const x = segCtx(emails, deals, runs, now); for (const c of contacts) if (inSegment(c, s, x)) await enrol(w, `seg:${c.id}`, null, null, c); }
    }
    if (t.type === "visit_no_show") for (const v of visits) if (v.status === "no_show" && new Date(v.starts_at).getTime() >= since) await enrol(w, `vnoshow:${v.id}`, byDeal(v.deal_id) ?? null, v);
  }

  /* ---- 2. Run everything that is due ---- */
  const log = async (deal: Deal | null, kind: AutoLog["kind"], message: string, tone: AutoLog["tone"] = "info") => {
    await db.insert("autolog", { deal_id: deal?.id ?? null, kind, message, tone, key: "", created_at: iso(port.now()) } as never);
  };
  const due = runs.filter((r) => r.status === "active" && new Date(r.next_run_at).getTime() <= now && (!opts.onlyRunId || r.id === opts.onlyRunId));
  for (const run of due) {
    const wf = workflows.find((w) => w.id === run.workflow_id);
    if (!wf || !wf.active) continue;
    if (!(await db.claim(run.id, iso(now + 2 * MIN), iso(now)))) continue;
    let pos = run.pos;
    // Waits count from when this step was scheduled. After a long gap (e.g. an outage) count from now instead, so nothing floods out at once.
    let baseMs = new Date(run.next_run_at).getTime();
    if (now - baseMs > DAY) baseMs = now;
    let status: WorkflowRun["status"] = "active", nextAt = now, note = "";
    for (let guard = 0; guard < 60; guard++) {
      const deal = byDeal(run.deal_id) as Deal | undefined, contact = byContact(deal?.contact_id ?? run.contact_id) as Contact | undefined, visit = byVisit(run.visit_id) as Visit | undefined;
      if (run.deal_id && !deal) { status = "stopped"; note = "The job was deleted"; break; }
      if (wf.exit.some((c) => evalCond(c, deal, contact, visit))) { status = "stopped"; note = "Reached the goal"; break; }
      const step = stepAt(wf.steps, pos);
      if (!step) { status = "done"; break; }
      const vars = mergeVars(deal, contact, visit, settings);
      sum.steps++;
      let next = advance(wf.steps, pos);
      if (step.type === "wait") {
        let dueAt = now;
        if (step.mode === "delay") {
          dueAt = baseMs + step.amount * (step.unit === "minutes" ? MIN : step.unit === "hours" ? HOUR : DAY);
          if (dueAt <= port.now()) { baseMs = dueAt; pos = next; continue; }
        }
        else if (step.mode === "time") dueAt = nextTimeOfDay(port.now(), step.time, settings?.timezone || "UTC");
        else {
          const base = step.ref === "visit_start" ? (visit ? new Date(visit.starts_at).getTime() : NaN) : (deal?.quote_sent_at ? new Date(deal.quote_sent_at).getTime() : NaN);
          if (Number.isNaN(base)) { pos = next; continue; }
          dueAt = base + step.offset * MIN;
          if (dueAt <= port.now()) {
            if (step.late === "stop") { status = "stopped"; note = "Too late for this step"; break; }
            if (step.late === "skip") next = advance(wf.steps, next);
            pos = next; continue;
          }
        }
        pos = next; nextAt = dueAt; break;
      }
      if (step.type === "if" || step.type === "split" || step.type === "ab" || step.type === "engage") {
        let k = 0;
        if (step.type === "if") k = evalCond(step.cond, deal, contact, visit) ? 0 : 1;
        else if (step.type === "split") { k = step.paths.findIndex((p) => !p.cond || evalCond(p.cond, deal, contact, visit)); if (k < 0) k = step.paths.length; }
        else if (step.type === "ab") { const b = bucket(run.id + step.id); let acc = 0; k = step.paths.length - 1; for (let i = 0; i < step.paths.length; i++) { acc += step.paths[i].pct ?? 0; if (b < acc) { k = i; break; } } }
        else {
          const sent = emails.filter((m) => m.run_id === run.id && m.step_id === step.ref);
          const hit = sent.some((m) => (step.event === "click" ? m.clicked_at : m.opened_at || m.clicked_at));
          k = hit ? 0 : 1;
        }
        const branch = branches(step)![k] ?? [];
        pos = branch.length ? [...pos, k, 0] : next;
        continue;
      }
      try {
        if (step.type === "email") {
          const subject = render(step.subject, vars);
          const design = isDesign(step.body) ? parseDesign(step.body) : null;
          const allVars = { ...emailVars(contact ?? null, settings), ...vars };
          let body = design ? plainOf(step.body, allVars) : render(step.body, vars);
          const sig = settings?.signature?.trim();
          if (sig && !design) body += `\n\n${sig}`;
          if (!contact?.email) await log(deal ?? null, "Auto", `Email "${subject}" skipped: no email address on file`, "warn");
          else if (step.marketing && contact.unsubscribed) await log(deal ?? null, "Auto", `Email "${subject}" skipped: ${contact.name} has unsubscribed`, "warn");
          else {
            const trackId = crypto.randomUUID();
            const r = await port.email({ to: contact.email, subject, body, contactId: contact.id, marketing: step.marketing, design: design ?? undefined, vars: allVars, trackId });
            await db.insert("emails", { id: trackId, contact_id: contact.id, to_email: contact.email, subject, body, status: r.status === "failed" ? "failed" : r.status === "demo" ? "demo" : "sent", error: r.error ?? "", campaign_id: null, run_id: run.id, step_id: step.id, created_at: iso(port.now()) } as never);
            await log(deal ?? null, "Auto", r.status === "failed" ? `Email "${subject}" failed: ${r.error ?? "unknown error"}` : `Email "${subject}" sent to ${contact.name}`, r.status === "failed" ? "warn" : "info");
          }
        } else if (step.type === "sms") {
          const body = render(step.body, vars);
          if (!contact?.phone) await log(deal ?? null, "Auto", "Text skipped: no phone number on file", "warn");
          else {
            const r = await port.sms({ to: contact.phone, body, contactId: contact.id });
            await log(deal ?? null, "Auto", r.status === "skipped" ? "Text skipped: SMS isn't connected yet (Settings → Connections)" : r.status === "failed" ? `Text failed: ${r.error ?? "unknown error"}` : `Text sent to ${contact.name}`, r.status === "sent" || r.status === "demo" ? "info" : "warn");
          }
        } else if (step.type === "task") {
          const title = render(step.title, vars);
          await db.insert("tasks", { title, due_date: dateStr(port.now() + step.days * DAY), done: false, contact_id: contact?.id ?? null, deal_id: deal?.id ?? null, created_at: iso(port.now()) } as unknown as Omit<Task, "id" | "created_at">);
          await log(deal ?? null, "Task", `Task created: ${title}`);
        } else if (step.type === "stage" && deal) {
          await db.update("deals", deal.id, { stage: step.stage, stage_at: iso(port.now()) } as Partial<Deal>);
          deal.stage = step.stage; deal.stage_at = iso(port.now());
          await log(deal, "Job", `Moved to ${step.stage.replace(/_/g, " ")}`);
        } else if (step.type === "tag" && contact) {
          const tags = step.remove ? contact.tags.filter((x) => x !== step.tag) : contact.tags.includes(step.tag) ? contact.tags : [...contact.tags, step.tag];
          await db.update("contacts", contact.id, { tags }); contact.tags = tags;
        } else if (step.type === "notify") {
          const msg = render(step.message, vars);
          await log(deal ?? null, "Alert", msg, "warn");
          if (settings?.owner_email) await port.email({ to: settings.owner_email, subject: `Alert: ${msg.slice(0, 80)}`, body: `${msg}\n\nJob: ${deal?.title ?? ""}`, contactId: undefined });
        } else if (step.type === "assign" && deal && settings && settings.reps?.length && !deal.rep) {
          const rep = settings.reps[(settings.rr_index ?? 0) % settings.reps.length];
          await db.update("deals", deal.id, { rep } as Partial<Deal>); deal.rep = rep;
          await db.update("settings", settings.id, { rr_index: (settings.rr_index ?? 0) + 1 }); settings.rr_index = (settings.rr_index ?? 0) + 1;
          await log(deal, "Routing", `Assigned to ${rep} by round robin`);
        } else if (step.type === "noshow" && visit && visit.status === "scheduled") {
          await db.update("visits", visit.id, { status: "no_show" }); visit.status = "no_show";
          if (deal?.stage === "visit_booked") { await db.update("deals", deal.id, { stage: "contacted", stage_at: iso(port.now()) } as Partial<Deal>); deal.stage = "contacted"; }
          await log(deal ?? null, "Visit", "No visit result 30 min after start · marked as a no-show", "warn");
        } else if (step.type === "log") {
          await log(deal ?? null, "Auto", render(step.message, vars));
        }
      } catch (e) {
        await log(deal ?? null, "Alert", `A workflow step failed: ${(e as Error).message}`, "warn");
      }
      pos = next;
    }
    if (status === "done") sum.finished++;
    await db.update("workflow_runs", run.id, { pos, status, next_run_at: iso(nextAt), locked_until: null, note } as Partial<WorkflowRun>);
    run.pos = pos; run.status = status; run.next_run_at = iso(nextAt);
  }
  return sum;
}
export { uid };
