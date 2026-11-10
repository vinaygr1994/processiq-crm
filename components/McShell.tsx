"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Mark } from "./Logo";
import { Avatar, Spinner } from "./ui";
import { Autopilot } from "./Autopilot";
import { useCrm } from "@/lib/store";
import { isDemo } from "@/lib/config";
import { roleLabel } from "@/lib/perm";

type Leaf = { href: string; label: string; text: string };
type Studio = { id: string; label: string; icon: string; href?: string; items?: Leaf[]; match: (p: string, tab: string) => boolean };
const STUDIOS: Studio[] = [
  { id: "email", label: "Email Studio", icon: "mail", match: (p, t) => p.startsWith("/marketing/send") || (p.startsWith("/emails") && t !== "templates"), items: [
    { href: "/marketing/send", label: "Send email", text: "To one person, a list or everyone" },
    { href: "/emails?tab=campaigns", label: "Sends", text: "Scheduled and completed sends" },
    { href: "/emails?tab=sent", label: "Tracking", text: "Delivery, opens and clicks per email" },
  ] },
  { id: "mobile", label: "Mobile Studio", icon: "chat", match: (p) => p.startsWith("/mobile"), items: [
    { href: "/mobile?ch=sms", label: "SMS", text: "Text messages to contacts and lists" },
    { href: "/mobile?ch=whatsapp", label: "WhatsApp", text: "Template and reply messages" },
    { href: "/mobile/inbox", label: "Conversations", text: "Replies from SMS and WhatsApp" },
  ] },
  { id: "journey", label: "Journey Builder", icon: "route", href: "/journeys", match: (p) => p.startsWith("/journeys") },
  { id: "automation", label: "Automation Studio", icon: "bolt", href: "/automations", match: (p) => p.startsWith("/automations") },
  { id: "content", label: "Content Builder", icon: "layers", href: "/emails?tab=templates", match: (p, t) => p.startsWith("/emails") && t === "templates" },
  { id: "audience", label: "Contact Builder", icon: "users", match: (p) => p.startsWith("/marketing/lists") || p.startsWith("/audience"), items: [
    { href: "/audience?tab=contacts", label: "All Contacts", text: "Every contact with channel status and linked data" },
    { href: "/audience?tab=extensions", label: "Data Extensions", text: "Your own data tables: create, import, filter" },
    { href: "/audience?tab=designer", label: "Data Designer", text: "How data extensions relate to a contact" },
    { href: "/marketing/lists", label: "Lists and Segments", text: "Static lists and rule-based segments" },
  ] },
  { id: "web", label: "Web Studio", icon: "note", match: (p) => p.startsWith("/marketing/forms"), items: [
    { href: "/marketing/forms", label: "Forms and landing pages", text: "Capture leads and sign-ups" },
    { href: "/bookings/settings", label: "Booking page", text: "Your public booking page, in the CRM" },
  ] },
];

function Nav() {
  const path = usePathname() ?? "";
  const tab = useSearchParams().get("tab") ?? "";
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(null);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);
  const cls = (on: boolean) => `pill -mb-px flex h-11 items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 text-[13.5px] font-semibold transition ${on ? "border-teal-d text-teal-d" : "border-transparent text-body hover:text-ink"}`;
  return (
    <nav ref={ref} className="flex items-stretch gap-0.5 overflow-x-auto border-b border-line bg-white px-3 lg:overflow-visible lg:px-5" aria-label="Marketing Cloud">
      <Link href="/marketing" className={cls(path === "/marketing")} aria-current={path === "/marketing" ? "page" : undefined}><Icon name="today" className="size-4" />Home</Link>
      {STUDIOS.map((s) => {
        const on = s.match(path, tab);
        if (s.href) return <Link key={s.id} href={s.href} onClick={() => setOpen(null)} className={cls(on)} aria-current={on ? "page" : undefined}><Icon name={s.icon} className="size-4" />{s.label}</Link>;
        return (
          <div key={s.id} className="relative">
            <button onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id} aria-haspopup="menu" className={cls(on)}><Icon name={s.icon} className="size-4" />{s.label}<Icon name="down" className="size-3.5 opacity-60" /></button>
            {open === s.id && (
              <div role="menu" className="anim-pop fixed left-3 right-3 z-40 mt-0 rounded-lg border border-line bg-white p-1.5 shadow-xl lg:absolute lg:left-0 lg:right-auto lg:w-72">
                {s.items!.map((i) => (
                  <Link key={i.href} role="menuitem" href={i.href} onClick={() => setOpen(null)} className="block rounded-md px-3 py-2 hover:bg-cloud">
                    <span className="block text-[13.5px] font-semibold text-ink">{i.label}</span><span className="block text-[12.5px] text-muted">{i.text}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function McShell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "";
  const { ready, toasts, me, userEmail, settings } = useCrm();
  const wide = /^\/(journeys|emails)\/./.test(path);
  const name = me.name || userEmail?.split("@")[0] || "You";
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30">
        <div className="flex h-12 items-center gap-3 bg-side px-3 text-white lg:px-5">
          <Link href="/marketing" className="flex items-center gap-2.5"><Mark className="size-7" /><span className="font-brand text-[15px] font-semibold">Process IQ <span className="font-medium text-white/60">Marketing Cloud</span></span></Link>
          <span className="hidden h-5 w-px bg-white/20 sm:block" />
          <span className="hidden truncate text-[13px] text-[#b7c1d8] sm:block">{settings?.business_name || "Your business"}</span>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/20 px-2.5 text-[13px] font-semibold text-white hover:bg-white/10"><Icon name="pipeline" className="size-4" /><span className="hidden sm:inline">Open</span> CRM</Link>
            <span className="flex items-center gap-2 text-[13px]"><Avatar name={name} size="size-7 text-[11px]" /><span className="hidden md:block"><span className="block font-semibold leading-tight">{name}</span><span className="block text-[11.5px] leading-tight text-[#8391b0]">{isDemo ? "Demo workspace" : roleLabel(me.role)}</span></span></span>
          </div>
        </div>
        <Suspense fallback={<div className="h-11 border-b border-line bg-white" />}><Nav /></Suspense>
      </header>
      {isDemo && <div className="border-b border-[#f3d9a8] bg-[#fff6e5] px-4 py-1.5 text-center text-[12.5px] text-[#7a4700]"><strong>Demo workspace.</strong> Sample data saved only in this browser. Messages are not really sent.</div>}
      <main className={`mx-auto px-4 pb-16 pt-5 sm:px-6 lg:pt-6 ${wide ? "max-w-none" : "max-w-[1440px]"}`}>
        {ready && me.role === "viewer" && <div className="mb-4 rounded-md border border-[#f3d9a8] bg-sun-t px-4 py-2 text-[13px] text-ink">You have read-only access.</div>}
        {ready ? children : <div className="grid place-items-center py-32 text-teal"><Spinner className="size-7" /></div>}
      </main>
      {ready && <Autopilot />}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`anim-pop pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-xl ${t.tone === "error" ? "bg-[#c42b52]" : "bg-ink"}`}>{t.text}</div>)}
      </div>
    </div>
  );
}
