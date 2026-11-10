"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, ConfirmModal, Field, PageHeader } from "@/components/ui";
import { useSegCtx } from "@/components/SegmentBuilder";
import { useCrm } from "@/lib/store";
import { CH, smsParts, useChannelStatus, useSendMessage } from "@/lib/mobile";
import { fill, timeAgo } from "@/lib/format";
import { segmentMembers } from "@/lib/segments";
import type { Channel, Contact } from "@/lib/types";

const DAY = 86400000;
type Aud = "one" | "list" | "segment" | "all";

function Row({ k, text }: { k: string; text: string }) {
  return <li className="flex flex-wrap items-baseline gap-x-2"><code className="rounded bg-[#eef1f6] px-1.5 py-0.5 text-[12.5px] font-semibold text-ink">{k}</code><span className="text-muted">{text}</span></li>;
}
function Stat({ l, v }: { l: string; v: string }) {
  return <div className="rounded-[10px] border border-line bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,.04)]"><div className="text-[12.5px] font-semibold text-muted">{l}</div><div className="mt-0.5 text-[22px] font-semibold text-ink">{v}</div></div>;
}
function Setup({ ch }: { ch: Channel }) {
  const st = useChannelStatus();
  const [copied, setCopied] = useState("");
  const copy = (v: string) => { navigator.clipboard?.writeText(v); setCopied(v); };
  const hook = (url: string) => <span className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded bg-[#eef1f6] px-2 py-1 text-[12.5px] text-ink">{url || "Shown once you are signed in on the live site"}</code>{url && <Button size="sm" variant="soft" onClick={() => copy(url)}>{copied === url ? "Copied" : "Copy"}</Button>}</span>;
  const ok = ch === "sms" ? st?.sms : st?.whatsapp;
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-semibold">Connect {CH[ch].label}</h2>{st && <Badge tone={ok ? "green" : "sun"}>{ok ? "Connected" : "Not connected"}</Badge>}</div>
      {ch === "sms" ? (
        <ol className="list-decimal space-y-3 pl-5 text-[13.5px]">
          <li>In Twilio, buy a phone number that can send SMS. For the USA and Canada, complete Twilio&apos;s business registration (A2P 10DLC or toll-free verification) or carriers will block your texts.</li>
          <li>In Vercel → your project → Settings → Environment Variables, add these three, then redeploy:
            <ul className="mt-1.5 space-y-1"><Row k="TWILIO_ACCOUNT_SID" text="Account SID from the Twilio console" /><Row k="TWILIO_AUTH_TOKEN" text="Auth token from the Twilio console" /><Row k="TWILIO_FROM" text="Your Twilio number, like +14165550100" /></ul></li>
          <li>To receive replies: in Twilio → Phone Numbers → your number → Messaging, set &quot;A message comes in&quot; to Webhook, HTTP POST, with this address:{hook(st?.twilioWebhook ?? "")}</li>
        </ol>
      ) : (
        <ol className="list-decimal space-y-3 pl-5 text-[13.5px]">
          <li>At developers.facebook.com, create a Business app, add the WhatsApp product, and connect your WhatsApp Business number.</li>
          <li>In Vercel → your project → Settings → Environment Variables, add these four, then redeploy:
            <ul className="mt-1.5 space-y-1"><Row k="WHATSAPP_TOKEN" text="Permanent access token (from a System User)" /><Row k="WHATSAPP_PHONE_ID" text="Phone number ID from WhatsApp → API Setup" /><Row k="WHATSAPP_APP_SECRET" text="App secret from App settings → Basic" /><Row k="WHATSAPP_VERIFY_TOKEN" text="Any long random phrase you make up" /></ul></li>
          <li>In the Meta app → WhatsApp → Configuration → Webhook, paste this address and the same verify phrase, then subscribe to &quot;messages&quot;:{hook(st?.whatsappWebhook ?? "")}</li>
          <li>Create message templates in WhatsApp Manager and wait for approval. WhatsApp only lets a business start a conversation with an approved template. Free-text replies work for 24 hours after the customer&apos;s last message.</li>
        </ol>
      )}
    </Card>
  );
}

function Inner() {
  const { data, can, toast } = useCrm();
  const router = useRouter();
  const ch: Channel = useSearchParams().get("ch") === "whatsapp" ? "whatsapp" : "sms";
  const st = useChannelStatus();
  const send = useSendMessage();
  const x = useSegCtx();
  const [view, setView] = useState<"send" | "log" | "setup">("send");
  const [aud, setAud] = useState<Aud>("one");
  const [q, setQ] = useState("");
  const [one, setOne] = useState<Contact | null>(null);
  const [tag, setTag] = useState("");
  const [seg, setSeg] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"template" | "text">("template");
  const [tpl, setTpl] = useState({ name: "", lang: "en", params: "" });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const tags = useMemo(() => [...new Set(data.contacts.flatMap((c) => c.tags))].sort(), [data.contacts]);
  const reach = (c: Contact) => !!c.phone.trim() && !(ch === "sms" && c.sms_opt_out);
  const picked = useMemo(() => {
    const base = aud === "one" ? (one ? [one] : []) : aud === "list" ? data.contacts.filter((c) => tag && c.tags.includes(tag)) : aud === "segment" ? (() => { const s = data.segments.find((s2) => s2.id === seg); return s ? segmentMembers(data.contacts, s, x) : []; })() : data.contacts;
    return base;
  }, [aud, one, tag, seg, data.contacts, data.segments, x]);
  const targets = picked.filter(reach);
  const matches = q.trim() ? data.contacts.filter((c) => [c.name, c.phone, c.company].some((v) => v.toLowerCase().includes(q.trim().toLowerCase()))).slice(0, 6) : [];
  const mine = data.messages.filter((m) => m.channel === ch);
  const recent = mine.filter((m) => now - +new Date(m.created_at) < 30 * DAY);
  const out = recent.filter((m) => m.direction === "out"), okOut = out.filter((m) => m.status !== "failed" && m.status !== "skipped");
  const parts = smsParts(body);
  const useTpl = ch === "whatsapp" && mode === "template";
  const params = tpl.params.split("\n").map((s) => s.trim()).filter(Boolean);
  const ready = targets.length > 0 && (useTpl ? !!tpl.name.trim() : !!body.trim());
  const sample = targets[0] ?? picked[0];

  async function go() {
    setBusy(true);
    try {
      const r = await send(ch, targets, useTpl ? "" : body.trim(), useTpl ? { name: tpl.name.trim(), lang: tpl.lang.trim() || "en", params } : undefined);
      if (r.failed) toast(`${r.sent} sent, ${r.failed} failed. ${r.errors[0] ?? ""}`, "error"); else toast(`${r.sent} ${CH[ch].label} message${r.sent === 1 ? "" : "s"} sent`);
      if (r.sent) { setBody(""); setView("log"); }
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  }

  const tab = (k: typeof view, l: string) => <button role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`pill -mb-px border-b-2 px-3 py-2 text-[13.5px] font-semibold ${view === k ? "border-teal-d text-teal-d" : "border-transparent text-muted hover:text-ink"}`}>{l}</button>;

  return (
    <div>
      <PageHeader title={`Mobile Studio · ${CH[ch].label}`} sub={ch === "sms" ? "Text messages to one person, a list or a segment, with replies in Conversations." : "WhatsApp template and reply messages through the WhatsApp Business Platform."}
        action={<div className="flex gap-2"><div className="inline-flex rounded-md border border-[#cdd4e2] bg-white p-0.5" role="group" aria-label="Channel">{(["sms", "whatsapp"] as Channel[]).map((c) => <button key={c} aria-pressed={ch === c} onClick={() => router.replace(`/mobile?ch=${c}`)} className={`rounded px-3 py-1 text-[13px] font-semibold ${ch === c ? "bg-ink text-white" : "text-body hover:bg-cloud"}`}>{CH[c].label}</button>)}</div><Link href="/mobile/inbox"><Button variant="soft" icon="inbox">Conversations</Button></Link></div>} />
      {st && !st[ch] && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#f3d9a8] bg-sun-t px-4 py-2.5 text-[13.5px] text-ink"><span><strong>{CH[ch].label} isn&apos;t connected yet.</strong> You can write messages, but nothing is sent until the keys are added.</span><Button size="sm" variant="soft" onClick={() => setView("setup")}>Show setup steps</Button></div>}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat l="Sent, last 30 days" v={String(okOut.length)} /><Stat l="Delivered" v={okOut.length ? `${Math.round((out.filter((m) => m.status === "delivered" || m.status === "demo").length / okOut.length) * 100)}%` : "–"} />
        <Stat l="Replies" v={String(recent.filter((m) => m.direction === "in").length)} /><Stat l="Failed" v={String(out.filter((m) => m.status === "failed").length)} />
      </div>
      <div className="mb-4 flex gap-1 border-b border-line" role="tablist">{tab("send", "New message")}{tab("log", `Message log (${mine.length})`)}{tab("setup", "Setup")}</div>

      {view === "setup" && <Setup ch={ch} />}

      {view === "log" && (
        <Card className="!p-0 overflow-hidden">
          {mine.length === 0 ? <p className="px-6 py-10 text-center text-muted">No {CH[ch].label} messages yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-line bg-[#f8f9fc] text-left text-muted"><tr><th className="px-5 py-2.5 font-semibold">Contact</th><th className="px-3 py-2.5 font-semibold">Direction</th><th className="px-3 py-2.5 font-semibold">Message</th><th className="px-3 py-2.5 font-semibold">Status</th><th className="px-5 py-2.5 text-right font-semibold">When</th></tr></thead>
              <tbody className="divide-y divide-line">{[...mine].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200).map((m) => { const c = data.contacts.find((y) => y.id === m.contact_id); return (
                <tr key={m.id} className="hover:bg-cloud/70">
                  <td className="px-5 py-2">{c ? <Link href={`/mobile/inbox?c=${c.id}`} className="font-semibold text-ink hover:text-teal-d">{c.name}</Link> : <span className="text-ink">{m.phone}</span>}<span className="block text-[12.5px] text-muted">{c ? m.phone : "Unknown number"}</span></td>
                  <td className="px-3 py-2">{m.direction === "in" ? "Received" : "Sent"}</td>
                  <td className="max-w-[420px] px-3 py-2"><span className="line-clamp-2 text-body">{m.body}</span>{m.error && <span className="block text-[12.5px] text-[#c42b52]">{m.error}</span>}</td>
                  <td className="px-3 py-2"><Badge tone={m.status === "failed" ? "rose" : m.status === "skipped" ? "sun" : m.status === "received" ? "iris" : m.status === "delivered" ? "green" : "gray"}>{m.status === "demo" ? "Demo" : m.status[0].toUpperCase() + m.status.slice(1)}</Badge></td>
                  <td className="px-5 py-2 text-right text-[13px] text-muted">{timeAgo(m.created_at)}</td>
                </tr>); })}</tbody>
            </table></div>
          )}
        </Card>
      )}

      {view === "send" && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <h2 className="mb-3 text-[15px] font-semibold">1. Who gets it</h2>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{([["one", "One contact"], ["list", "A list"], ["segment", "A segment"], ["all", "Everyone"]] as [Aud, string][]).map(([k, l]) => <button key={k} aria-pressed={aud === k} onClick={() => setAud(k)} className={`rounded-md border px-3 py-2 text-[13.5px] font-semibold ${aud === k ? "border-teal bg-teal-t text-teal-d" : "border-line text-ink hover:bg-cloud"}`}>{l}</button>)}</div>
            {aud === "one" && (one ? <div className="flex h-9 items-center justify-between rounded-md border border-line px-3"><span className="truncate text-sm"><strong className="text-ink">{one.name}</strong> <span className="text-muted">{one.phone || "No phone number"}</span></span><button onClick={() => setOne(null)} aria-label="Remove contact" className="text-muted hover:text-rose"><Icon name="x" className="size-4" /></button></div> : (
              <div className="relative"><input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or company" aria-label="Find contact" />
                {matches.length > 0 && <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-white shadow-lg">{matches.map((c) => <li key={c.id}><button onClick={() => { setOne(c); setQ(""); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-cloud"><span className="font-semibold text-ink">{c.name}</span> <span className="text-muted">{c.phone || "no phone"}</span></button></li>)}</ul>}</div>
            ))}
            {aud === "list" && <select className="field" aria-label="List" value={tag} onChange={(e) => setTag(e.target.value)}><option value="">Choose a list…</option>{tags.map((t) => <option key={t}>{t}</option>)}</select>}
            {aud === "segment" && (data.segments.length ? <select className="field" aria-label="Segment" value={seg} onChange={(e) => setSeg(e.target.value)}><option value="">Choose a segment…</option>{data.segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : <p className="text-[13.5px] text-muted">No segments yet. <Link href="/marketing/lists" className="font-semibold text-teal-d hover:underline">Create one in Audience Builder</Link>.</p>)}

            <h2 className="mb-3 mt-6 text-[15px] font-semibold">2. Message</h2>
            {ch === "whatsapp" && <div className="mb-3 inline-flex rounded-md border border-[#cdd4e2] p-0.5" role="group" aria-label="Message type">{([["template", "Approved template"], ["text", "Free-text reply"]] as const).map(([k, l]) => <button key={k} aria-pressed={mode === k} onClick={() => setMode(k)} className={`rounded px-3 py-1 text-[13px] font-semibold ${mode === k ? "bg-ink text-white" : "text-body hover:bg-cloud"}`}>{l}</button>)}</div>}
            {useTpl ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_120px]"><Field label="Template name" hint="Exactly as it appears in WhatsApp Manager"><input className="field" value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} placeholder="appointment_reminder" /></Field><Field label="Language"><input className="field" value={tpl.lang} onChange={(e) => setTpl({ ...tpl, lang: e.target.value })} placeholder="en" /></Field></div>
                <Field label="Variables" hint="One per line, in order: {{1}}, {{2}}… You can use {{first_name}} and {{company}}."><textarea className="field !min-h-[72px]" value={tpl.params} onChange={(e) => setTpl({ ...tpl, params: e.target.value })} placeholder={"{{first_name}}\nThursday at 2pm"} /></Field>
              </div>
            ) : (
              <>
                {ch === "whatsapp" && <p className="mb-2 text-[13px] text-muted">Free text is only delivered to people who messaged you in the last 24 hours. Use a template for everyone else.</p>}
                <textarea className="field !min-h-[120px]" maxLength={1600} value={body} onChange={(e) => setBody(e.target.value)} placeholder={ch === "sms" ? "Hi {{first_name}}, …" : "Type your reply…"} aria-label="Message" />
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
                  <span className="flex gap-1.5">{["{{first_name}}", "{{company}}"].map((t) => <button key={t} type="button" onClick={() => setBody((b) => b + t)} className="rounded border border-line bg-white px-1.5 py-0.5 font-semibold text-body hover:border-teal">{t}</button>)}</span>
                  {ch === "sms" && <span>{body.length} characters · {parts.parts} SMS part{parts.parts === 1 ? "" : "s"}{!parts.plain && body ? " (special characters shorten each part to 70)" : ""}</span>}
                </div>
                {ch === "sms" && aud !== "one" && <p className="mt-2 text-[13px] text-muted">Only text people who agreed to get texts from you, and tell them they can reply STOP. Anyone who replies STOP is skipped automatically.</p>}
              </>
            )}
          </Card>

          <div className="space-y-4 lg:sticky lg:top-28">
            <Card>
              <h2 className="mb-3 text-[15px] font-semibold">Preview</h2>
              <div className="rounded-xl bg-[#e9edf4] p-4"><div className="pill ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-sm px-3.5 py-2 text-[13.5px] text-white" style={{ background: CH[ch].color }}>{useTpl ? (tpl.name ? `Template “${tpl.name}”${params.length ? `\n${params.map((p, i) => `{{${i + 1}}} = ${sample ? fill(p, sample) : p}`).join("\n")}` : ""}` : "Choose a template") : (body ? (sample ? fill(body, sample) : body) : "Your message appears here")}</div></div>
              <dl className="mt-4 space-y-1.5 text-[13.5px]"><div className="flex justify-between"><dt className="text-muted">Will receive it</dt><dd className="font-semibold text-ink">{targets.length}</dd></div>{picked.length - targets.length > 0 && <div className="flex justify-between"><dt className="text-muted">Skipped (no phone or replied STOP)</dt><dd className="font-semibold text-ink">{picked.length - targets.length}</dd></div>}{ch === "sms" && !useTpl && <div className="flex justify-between"><dt className="text-muted">SMS parts billed</dt><dd className="font-semibold text-ink">{parts.parts * targets.length}</dd></div>}</dl>
              <Button className="mt-4 w-full" icon="send" disabled={!ready || busy || !can("write")} onClick={() => (targets.length > 1 ? setConfirm(true) : go())}>{busy ? "Sending…" : `Send ${CH[ch].label}${targets.length > 1 ? ` to ${targets.length}` : ""}`}</Button>
              {targets.length > 500 && <p className="mt-2 text-[12.5px] text-muted">Sends are limited to 500 people at a time.</p>}
            </Card>
          </div>
        </div>
      )}
      {confirm && <ConfirmModal title={`Send to ${targets.length} people?`} text={`This sends a ${CH[ch].label} message to ${targets.length} contacts now. Your provider charges per message.`} confirmLabel="Send now" onClose={() => setConfirm(false)} onConfirm={go} />}
    </div>
  );
}

export default function MobilePage() { return <Suspense><Inner /></Suspense>; }
