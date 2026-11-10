"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, Badge, Button, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { CH, useSendMessage } from "@/lib/mobile";
import { timeAgo } from "@/lib/format";
import type { Channel, Message } from "@/lib/types";

interface Thread { key: string; contactId: string | null; phone: string; name: string; last: Message; unread: number; msgs: Message[] }

function Inner() {
  const { data, update, can, toast } = useCrm();
  const router = useRouter();
  const sel = useSearchParams().get("c") ?? "";
  const send = useSendMessage();
  const [filter, setFilter] = useState<"all" | "unread" | Channel>("all");
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [chan, setChan] = useState<Channel | null>(null);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const [now] = useState(() => Date.now());

  const threads = useMemo(() => {
    const m = new Map<string, Thread>();
    for (const x of [...data.messages].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const key = x.contact_id ?? `p:${x.phone}`;
      const c = data.contacts.find((y) => y.id === x.contact_id);
      const t = m.get(key) ?? { key, contactId: x.contact_id, phone: x.phone, name: c?.name ?? x.phone, last: x, unread: 0, msgs: [] };
      t.msgs.push(x); t.last = x; if (x.direction === "in" && !x.read) t.unread++;
      m.set(key, t);
    }
    return [...m.values()].sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [data.messages, data.contacts]);
  const shown = threads.filter((t) => (filter === "all" || (filter === "unread" ? t.unread > 0 : t.msgs.some((x) => x.channel === filter))) && (!q.trim() || [t.name, t.phone].some((v) => v.toLowerCase().includes(q.trim().toLowerCase()))));
  const fresh = data.contacts.find((c) => c.id === sel);
  const open: Thread | null = threads.find((t) => t.key === sel) ?? (fresh ? { key: fresh.id, contactId: fresh.id, phone: fresh.phone || "No phone number", name: fresh.name, last: null as unknown as Message, unread: 0, msgs: [] } : null);
  const contact = open?.contactId ? data.contacts.find((c) => c.id === open.contactId) : undefined;
  const channel: Channel = chan ?? open?.msgs.at(-1)?.channel ?? "sms";
  const lastIn = open ? [...open.msgs].reverse().find((x) => x.direction === "in" && x.channel === "whatsapp") : undefined;
  const waOpen = !!lastIn && now - +new Date(lastIn.created_at) < 24 * 3600000;
  const unreadIds = open ? open.msgs.filter((x) => x.direction === "in" && !x.read).map((x) => x.id).join(",") : "";

  useEffect(() => { if (unreadIds && can("write")) unreadIds.split(",").forEach((id) => update("messages", id, { read: true })); }, [unreadIds, update, can]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [sel, open?.msgs.length]);

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    if (!contact || !text.trim()) return;
    setBusy(true);
    try {
      const r = await send(channel, [contact], text.trim());
      if (r.failed || !r.sent) toast(r.errors[0] ?? (r.skipped ? "Not sent: no phone number, or they replied STOP." : "Message failed"), "error"); else setText("");
    } catch (er) { toast((er as Error).message, "error"); }
    setBusy(false);
  }
  const pick = (k: string) => { setChan(null); setText(""); router.replace(`/mobile/inbox?c=${encodeURIComponent(k)}`); };
  const totalUnread = threads.reduce((a, t) => a + t.unread, 0);

  return (
    <div>
      <PageHeader title="Conversations" sub="Every SMS and WhatsApp thread with your contacts, in one inbox." action={<Link href="/mobile?ch=sms"><Button icon="plus">New message</Button></Link>} />
      <div className="grid h-[calc(100dvh-230px)] min-h-[460px] overflow-hidden rounded-[10px] border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,.04)] md:grid-cols-[320px_minmax(0,1fr)]">
        <div className={`flex min-h-0 flex-col border-line md:border-r ${open ? "hidden md:flex" : "flex"}`}>
          <div className="space-y-2 border-b border-line p-3">
            <div className="relative"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" /></div>
            <div className="flex gap-1" role="group" aria-label="Filter">{([["all", "All"], ["unread", `Unread${totalUnread ? ` ${totalUnread}` : ""}`], ["sms", "SMS"], ["whatsapp", "WhatsApp"]] as const).map(([k, l]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)} className={`rounded-md px-2.5 py-1 text-[12.5px] font-semibold ${filter === k ? "bg-ink text-white" : "text-body hover:bg-cloud"}`}>{l}</button>)}</div>
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {shown.length === 0 && <li className="px-4 py-10 text-center text-[13.5px] text-muted">No conversations here.</li>}
            {shown.map((t) => (
              <li key={t.key}><button onClick={() => pick(t.key)} aria-current={t.key === sel} className={`flex w-full items-start gap-3 px-3 py-3 text-left ${t.key === sel ? "bg-teal-t/50" : "hover:bg-cloud"}`}>
                <Avatar name={t.name} size="size-9 text-xs" />
                <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className={`truncate text-[13.5px] text-ink ${t.unread ? "font-bold" : "font-semibold"}`}>{t.name}</span><span className="shrink-0 text-[11.5px] text-muted">{timeAgo(t.last.created_at)}</span></span>
                  <span className="mt-0.5 flex items-center gap-2"><span className={`min-w-0 flex-1 truncate text-[12.5px] ${t.unread ? "font-semibold text-ink" : "text-muted"}`}>{t.last.direction === "out" ? "You: " : ""}{t.last.body}</span>{t.unread > 0 && <span className="pill grid h-[18px] min-w-[18px] place-items-center rounded-full bg-teal-d px-1 text-[10.5px] font-bold text-white">{t.unread}</span>}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold" style={{ color: CH[t.last.channel].color }}><span className="pill size-1.5 rounded-full" style={{ background: CH[t.last.channel].color }} />{CH[t.last.channel].label}</span></span>
              </button></li>
            ))}
          </ul>
        </div>

        <div className={`min-h-0 flex-col ${open ? "flex" : "hidden md:flex"}`}>
          {!open ? <div className="grid flex-1 place-items-center px-6 text-center text-muted"><div><span className="mx-auto mb-3 grid size-11 place-items-center rounded-lg bg-[#eef1f6]"><Icon name="chat" className="size-5" /></span>Choose a conversation to read and reply.</div></div> : (
            <>
              <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
                <button onClick={() => router.replace("/mobile/inbox")} className="grid size-8 place-items-center rounded-md text-muted hover:bg-cloud md:hidden" aria-label="Back to conversations"><Icon name="back" className="size-4" /></button>
                <Avatar name={open.name} size="size-9 text-xs" />
                <div className="min-w-0 flex-1"><div className="truncate text-[14.5px] font-semibold text-ink">{open.name}</div><div className="truncate text-[12.5px] text-muted">{open.phone}{contact?.company ? ` · ${contact.company}` : ""}{contact?.sms_opt_out ? " · replied STOP" : ""}</div></div>
                {contact ? <Link href={`/contacts/${contact.id}`}><Button size="sm" variant="soft">Open in CRM</Button></Link> : <Badge tone="sun">Not a contact yet</Badge>}
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#f3f5f9] px-4 py-4" aria-live="polite">
                {open.msgs.length === 0 && <p className="py-10 text-center text-[13.5px] text-muted">No messages with {open.name} yet. Write the first one below.</p>}
                {open.msgs.map((x) => (
                  <div key={x.id} className={`flex ${x.direction === "out" ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[75%]">
                      <div className={`pill whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13.5px] ${x.direction === "out" ? "rounded-br-sm text-white" : "rounded-bl-sm border border-line bg-white text-ink"}`} style={x.direction === "out" ? { background: x.status === "failed" ? "#c42b52" : CH[x.channel].color } : undefined}>{x.body}</div>
                      <div className={`mt-0.5 text-[11.5px] text-muted ${x.direction === "out" ? "text-right" : ""}`}>{CH[x.channel].label} · {timeAgo(x.created_at)}{x.direction === "out" ? ` · ${x.status === "demo" ? "demo" : x.status}` : ""}{x.error ? ` · ${x.error}` : ""}</div>
                    </div>
                  </div>
                ))}
                <div ref={end} />
              </div>
              {contact ? (
                <form onSubmit={reply} className="border-t border-line p-3">
                  {channel === "whatsapp" && !waOpen && <p className="mb-2 rounded-md bg-sun-t px-3 py-1.5 text-[12.5px] text-ink">More than 24 hours since their last WhatsApp message, so a free-text reply won&apos;t be delivered. <Link href="/mobile?ch=whatsapp" className="font-semibold text-teal-d hover:underline">Send a template instead</Link>.</p>}
                  <div className="flex items-end gap-2">
                    <select className="field !w-auto" aria-label="Channel" value={channel} onChange={(e) => setChan(e.target.value as Channel)}><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option></select>
                    <textarea className="field !min-h-[38px] flex-1" rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder={`Reply by ${CH[channel].label}…`} aria-label="Reply" />
                    <Button type="submit" icon="send" disabled={busy || !text.trim() || !can("write")}>Send</Button>
                  </div>
                </form>
              ) : <p className="border-t border-line px-4 py-3 text-[13px] text-muted">This number isn&apos;t saved as a contact. Add them in the CRM with this phone number to reply from here.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InboxPage() { return <Suspense><Inner /></Suspense>; }
