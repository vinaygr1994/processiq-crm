"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, Field } from "@/components/ui";
import { EmailEditor } from "@/components/EmailEditor";
import { useCrm } from "@/lib/store";
import { useStatus } from "@/lib/status";
import { fill } from "@/lib/format";
import { emailVars, parseDesign, renderDesign } from "@/lib/emailDesign";
import { runSend } from "@/lib/sendEmail";
import type { Contact } from "@/lib/types";

type Mode = "one" | "pick" | "list" | "all";
const MODES: { id: Mode; title: string; text: string; icon: string }[] = [
  { id: "one", title: "One person", text: "A single contact", icon: "users" },
  { id: "pick", title: "Selected people", text: "Pick a few contacts", icon: "check" },
  { id: "list", title: "Lists", text: "Everyone on one or more lists", icon: "tag" },
  { id: "all", title: "Everyone", text: "All contacts with an email", icon: "send" },
];
const STEPS = ["Recipients", "Content", "Review and send"];

function ContactPicker({ multiple, value, onChange }: { multiple: boolean; value: string[]; onChange: (ids: string[]) => void }) {
  const { data } = useCrm();
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const hits = data.contacts.filter((c) => !s || [c.name, c.email, c.company].some((v) => v.toLowerCase().includes(s))).slice(0, 40);
  const picked = data.contacts.filter((c) => value.includes(c.id));
  const toggle = (id: string) => onChange(multiple ? (value.includes(id) ? value.filter((x) => x !== id) : [...value, id]) : [id]);
  return (
    <div className="space-y-3">
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((c) => <button key={c.id} type="button" onClick={() => onChange(value.filter((x) => x !== c.id))} className="inline-flex items-center gap-1.5 rounded-full bg-teal-t px-3 py-1 text-sm font-semibold text-teal-d hover:bg-teal-t/70">{c.name}<Icon name="x" className="size-3.5" /></button>)}
        </div>
      )}
      <div className="relative"><Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" /><input className="field !pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or company" aria-label="Search contacts" /></div>
      <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-2xl border border-line">
        {hits.length === 0 && <li className="px-4 py-3 text-sm text-muted">No contacts match.</li>}
        {hits.map((c) => {
          const on = value.includes(c.id);
          return (
            <li key={c.id}>
              <button type="button" onClick={() => toggle(c.id)} aria-pressed={on} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-cloud ${on ? "bg-teal-t/40" : ""}`}>
                <span className={`grid size-5 shrink-0 place-items-center ${multiple ? "rounded-md" : "rounded-full"} border-2 ${on ? "border-teal bg-teal text-white" : "border-line"}`}>{on && <Icon name="check" className="size-3" />}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{c.name}</span><span className="block truncate text-[13px] text-muted">{c.email || "No email address"}{c.company ? ` · ${c.company}` : ""}</span></span>
                {c.unsubscribed && <Badge tone="rose">Unsubscribed</Badge>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ListPicker({ label, value, onChange, counts }: { label: string; value: string[]; onChange: (v: string[]) => void; counts: [string, number][] }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-ink">{label}</div>
      {counts.length === 0 ? <p className="text-sm text-muted">No lists yet. <Link href="/marketing/lists" className="font-semibold text-teal-d hover:underline">Create a list</Link></p> : (
        <div className="flex flex-wrap gap-1.5">
          {counts.map(([t, n]) => {
            const on = value.includes(t);
            return <button key={t} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== t) : [...value, t])} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${on ? "border-teal bg-teal-t text-teal-d" : "border-line bg-white text-body hover:bg-cloud"}`}>{t} <span className="font-medium text-muted">{n}</span></button>;
          })}
        </div>
      )}
    </div>
  );
}

function SendWizard() {
  const crm = useCrm();
  const { data, settings, toast, userEmail } = crm;
  const status = useStatus();
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>("one");
  const [ids, setIds] = useState<string[]>([]);
  const [lists, setLists] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"marketing" | "personal">("personal");
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Prefill from links: ?to=<contact id>, ?list=<tag>, ?template=<id>
  useEffect(() => {
    const to = params.get("to"), list = params.get("list"), tpl = params.get("template");
    /* eslint-disable react-hooks/set-state-in-effect -- one-time prefill from the link */
    if (to && data.contacts.some((c) => c.id === to)) { setMode("one"); setIds([to]); setKind("personal"); }
    if (list) { setMode("list"); setLists([list]); }
    const t = tpl ? data.templates.find((x) => x.id === tpl) : null;
    if (t) { setSubject(t.subject); setBody(t.body); }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const listCounts = useMemo(() => {
    const m = new Map<string, number>();
    data.contacts.forEach((c) => c.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data.contacts]);

  const chosen: Contact[] = useMemo(() => {
    let base: Contact[] = [];
    if (mode === "one" || mode === "pick") base = data.contacts.filter((c) => ids.includes(c.id));
    if (mode === "list") base = data.contacts.filter((c) => c.tags.some((t) => lists.includes(t)));
    if (mode === "all") base = data.contacts;
    return base.filter((c) => !c.tags.some((t) => exclude.includes(t)));
  }, [mode, ids, lists, exclude, data.contacts]);
  const personalAllowed = (mode === "one" || mode === "pick") && chosen.length <= 25;
  const marketing = kind === "marketing" || !personalAllowed;
  const recipients = chosen.filter((c) => c.email && (!marketing || !c.unsubscribed));
  const noEmail = chosen.filter((c) => !c.email).length, unsub = marketing ? chosen.filter((c) => c.email && c.unsubscribed).length : 0;
  const audienceLabel = mode === "one" ? (chosen[0]?.name ?? "One person") : mode === "pick" ? `${chosen.length} selected people` : mode === "list" ? `List: ${lists.join(", ")}` : "Everyone";
  const needsSetup = marketing && (!settings?.address?.trim() || !settings?.business_name?.trim());
  const design = parseDesign(body);

  function next() {
    setErr("");
    if (step === 0) {
      if ((mode === "one" || mode === "pick") && !ids.length) return setErr("Choose who should get this email.");
      if (mode === "list" && !lists.length) return setErr("Choose at least one list.");
      if (!recipients.length) return setErr("Nobody to send to: the people you chose have no email address or have unsubscribed.");
    }
    if (step === 1 && (!subject.trim() || (design ? design.blocks.length === 0 : !body.trim()))) return setErr("Add a subject and some content.");
    setStep(step + 1);
  }
  async function send() {
    setErr("");
    if (needsSetup && !status?.demo) return setErr("Marketing emails need your business name and mailing address. Add them in Settings, or send as a one-to-one email.");
    setProgress({ done: 0, total: recipients.length });
    try {
      const r = await runSend({ name, subject, body, recipients, marketing, audienceLabel }, crm, settings, (done, total) => setProgress({ done, total }));
      toast(r.demo ? `Demo: ${r.ok} email${r.ok === 1 ? "" : "s"} saved to history (not really sent)` : `Sent to ${r.ok} ${r.ok === 1 ? "person" : "people"}${r.bad ? `, ${r.bad} failed` : ""}`);
      router.push("/emails");
    } catch (e) { setErr((e as Error).message); setProgress(null); }
  }

  const from = settings?.sender_name || settings?.business_name || "Your business";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/marketing" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><Icon name="back" className="size-4" />Marketing</Link>
        <h1 className="font-display text-2xl font-semibold text-ink sm:text-[28px]">Send an email</h1>
      </div>

      <ol className="grid grid-cols-3 gap-2 text-sm font-semibold" aria-label="Steps">
        {STEPS.map((l, i) => (
          <li key={l}>
            <button type="button" disabled={i > step || !!progress} onClick={() => setStep(i)} aria-current={step === i ? "step" : undefined}
              className={`flex w-full items-center gap-2 rounded-full px-3 py-2 text-left disabled:cursor-default ${step === i ? "bg-ink text-white" : step > i ? "bg-teal-t text-teal-d hover:bg-teal-t/70" : "bg-white text-muted ring-1 ring-line"}`}>
              <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${step === i ? "bg-white/20" : step > i ? "bg-white" : "bg-cloud"}`}>{step > i ? "✓" : i + 1}</span><span className="truncate">{l}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Who should get this?</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                {MODES.map((m) => (
                  <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => { setMode(m.id); if (m.id === "one") setIds(ids.slice(0, 1)); }}
                    className={`rounded-2xl border p-3.5 text-left transition ${mode === m.id ? "border-teal bg-teal-t/40 ring-2 ring-teal/20" : "border-line bg-white hover:border-teal/50"}`}>
                    <Icon name={m.icon} className={`size-5 ${mode === m.id ? "text-teal-d" : "text-muted"}`} />
                    <div className="mt-2 text-sm font-semibold text-ink">{m.title}</div><div className="text-[12.5px] text-muted">{m.text}</div>
                  </button>
                ))}
              </div>
            </div>
            {(mode === "one" || mode === "pick") && <ContactPicker multiple={mode === "pick"} value={ids} onChange={setIds} />}
            {mode === "list" && <ListPicker label="Send to everyone on" value={lists} onChange={setLists} counts={listCounts} />}
            {mode !== "one" && listCounts.length > 0 && (
              <details className="rounded-2xl border border-line" open={exclude.length > 0}>
                <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">Leave people out (optional)</summary>
                <div className="border-t border-line px-4 py-4"><ListPicker label="Don't send to anyone on" value={exclude} onChange={setExclude} counts={listCounts} /></div>
              </details>
            )}
            {personalAllowed && (
              <div>
                <div className="mb-2 text-sm font-semibold text-ink">Type of email</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([["personal", "One-to-one", "Reads like a personal email from you, with your signature. Best for a single person."], ["marketing", "Marketing", "Adds your address and an unsubscribe link, and skips people who unsubscribed."]] as const).map(([k, t, d]) => (
                    <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-2xl border p-3.5 text-left ${kind === k ? "border-teal bg-teal-t/40 ring-2 ring-teal/20" : "border-line hover:border-teal/50"}`}>
                      <div className="text-sm font-semibold text-ink">{t}</div><div className="mt-0.5 text-[12.5px] text-muted">{d}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
          <Card className="h-fit space-y-3 lg:sticky lg:top-6">
            <div className="text-sm font-semibold text-muted">Recipients</div>
            <div><span className="font-display text-4xl font-semibold text-ink">{recipients.length}</span> <span className="text-sm font-medium text-muted">will get this email</span></div>
            {(noEmail > 0 || unsub > 0) && <ul className="space-y-1 text-[13px] text-muted">{noEmail > 0 && <li>{noEmail} left out: no email address</li>}{unsub > 0 && <li>{unsub} left out: unsubscribed</li>}</ul>}
            <Badge tone={marketing ? "iris" : "teal"}>{marketing ? "Marketing email" : "One-to-one email"}</Badge>
          </Card>
        </div>
      )}

      {step === 1 && (
        <Card>
          <EmailEditor subject={subject} body={body} onSubject={setSubject} onBody={setBody} contact={recipients[0] ?? null}
            aiContact={mode === "one" && recipients[0] ? { name: recipients[0].name, company: recipients[0].company } : { name: "{{first_name}}", company: "{{company}}" }}
            aiPlaceholder={mode === "one" ? "e.g. Follow up on our call and suggest a visit next week" : "e.g. Announce our spring offer: 10% off first service"} />
        </Card>
      )}

      {step === 2 && (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="h-fit space-y-4">
            <h2 className="text-lg font-semibold">Check the details</h2>
            <dl className="divide-y divide-line text-sm">
              {[["From", `${from}${status?.from ? ` <${status.from}>` : ""}`], ["To", `${audienceLabel} (${recipients.length})`], ["Subject", fill(subject, recipients[0] ?? { name: "there", company: "" })], ["Type", marketing ? "Marketing (unsubscribe link and address added)" : "One-to-one"]].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[80px_1fr] gap-2 py-2.5"><dt className="text-muted">{k}</dt><dd className="min-w-0 break-words font-medium text-ink">{v}</dd></div>
              ))}
            </dl>
            <Field label="Internal name (optional)" hint="Only you see this, in your sends list."><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={subject || "e.g. Spring offer"} /></Field>
            {needsSetup && !status?.demo && <p className="rounded-xl bg-sun-t px-4 py-3 text-sm text-[#7a4700]">Marketing emails need your business name and mailing address. <Link href="/settings" className="font-semibold underline">Add them in Settings</Link>.</p>}
            {status && !status.demo && !status.email && <p className="rounded-xl bg-sun-t px-4 py-3 text-sm text-[#7a4700]">Email sending isn&apos;t connected yet. Finish the Resend setup in Settings first.</p>}
            {progress && (
              <div role="status" className="space-y-2">
                <div className="text-sm font-semibold">Sending… {progress.done} of {progress.total}</div>
                <div className="h-2 overflow-hidden rounded-full bg-cloud"><div className="h-full rounded-full bg-teal transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
                <p className="text-[12.5px] text-muted">Keep this page open until it finishes.</p>
              </div>
            )}
            {userEmail && !progress && <p className="text-[12.5px] text-muted">Want to check it first? Go back to Content and use &ldquo;Send me a test&rdquo;.</p>}
          </Card>
          <div className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="border-b border-line px-5 py-3 text-sm"><span className="text-muted">Preview for</span> <strong>{recipients[0]?.name ?? "a contact"}</strong></div>
            {design
              ? <iframe title="Email preview" sandbox="" className="block h-[620px] w-full border-0 bg-cloud" srcDoc={renderDesign(design, emailVars(recipients[0] ?? null, settings), { business: settings?.business_name, address: settings?.address, unsubscribeUrl: marketing ? "#" : undefined }).html} />
              : <div className="whitespace-pre-wrap px-5 py-5 text-[15px] leading-relaxed text-[#222]">{fill(body, recipients[0] ?? { name: "there", company: "" })}{!marketing && settings?.signature?.trim() ? `\n\n${settings.signature}` : ""}</div>}
          </div>
        </div>
      )}

      {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
      <div className="flex items-center justify-between gap-2 border-t border-line pt-5">
        <Button variant="soft" onClick={() => (step === 0 ? router.push("/marketing") : setStep(step - 1))} disabled={!!progress}>{step === 0 ? "Cancel" : "Back"}</Button>
        {step < 2 ? <Button onClick={next}>Continue</Button> : <Button icon="send" onClick={send} disabled={!!progress}>{progress ? "Sending…" : `Send to ${recipients.length} ${recipients.length === 1 ? "person" : "people"}`}</Button>}
      </div>
    </div>
  );
}

export default function SendPage() {
  return <Suspense fallback={null}><SendWizard /></Suspense>;
}
