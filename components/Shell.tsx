"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { Spinner } from "./ui";
import { Autopilot } from "./Autopilot";
import { AddContactModal, AddTaskModal } from "./forms";
import { NewLeadModal } from "./flowModals";
import { useCrm } from "@/lib/store";
import { isDemo } from "@/lib/config";

const NAV = [
  { href: "/", label: "Today", icon: "today" },
  { href: "/contacts", label: "Contacts", icon: "users" },
  { href: "/pipeline", label: "Jobs", icon: "pipeline" },
  { href: "/automations", label: "Workflows", icon: "bolt" },
  { href: "/emails", label: "Email", icon: "mail" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

type Quick = "lead" | "contact" | "task";
function QuickAdd({ onPick, block = false }: { onPick: (k: Quick) => void; block?: boolean }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className={`relative ${block ? "w-full" : ""}`} ref={ref}>
      <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu"
        className={`inline-flex h-10 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1d2a47] ${block ? "h-11 w-full text-[15px]" : ""}`}>
        <Icon name="plus" className="size-4" /> Add
      </button>
      {menu && (
        <div role="menu" className={`anim-pop absolute z-40 mt-2 w-52 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-xl ${block ? "left-0" : "right-0"}`}>
          {([["lead", "New lead", "pipeline"], ["contact", "New contact", "users"], ["task", "New task", "check"]] as const).map(([k, l, i]) => (
            <button key={k} role="menuitem" onClick={() => { onPick(k); setMenu(false); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-ink hover:bg-cloud">
              <Icon name={i} className="size-[18px] text-teal" /> {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { ready, toasts, userEmail } = useCrm();
  const [quick, setQuick] = useState<Quick | null>(null);
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-white px-4 py-6 lg:flex">
        <Link href="/" className="mb-6 px-2"><Logo /></Link>
        <div className="mb-5 px-1"><QuickAdd block onPick={setQuick} /></div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[15.5px] font-semibold transition ${active(n.href) ? "bg-teal-t text-teal-d" : "text-body hover:bg-cloud"}`}>
              <Icon name={n.icon} /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="rounded-2xl bg-cloud px-3.5 py-3 text-[13px] text-muted">
          <div className="truncate font-semibold text-ink">{userEmail || "Signed in"}</div>
          {isDemo && <div className="mt-0.5">Demo mode</div>}
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/"><Logo /></Link>
        <QuickAdd onPick={setQuick} />
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
        {isDemo && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-sun/40 bg-sun-t px-4 py-3 text-[14px] text-[#7a4700]">
            <Icon name="info" className="mt-0.5 size-5 shrink-0" />
            <span><strong>Demo mode.</strong> You&apos;re looking at sample data saved only in this browser, and emails are not really sent. Connect Supabase to go live (see Settings).</span>
          </div>
        )}
        {ready ? children : <div className="grid place-items-center py-32 text-teal"><Spinner className="size-8" /></div>}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-semibold ${active(n.href) ? "text-teal-d" : "text-muted"}`}>
            <Icon name={n.icon} className="size-6" /> {n.label}
          </Link>
        ))}
      </nav>

      {ready && <Autopilot />}
      {quick === "contact" && <AddContactModal onClose={() => setQuick(null)} />}
      {quick === "lead" && <NewLeadModal onClose={() => setQuick(null)} />}
      {quick === "task" && <AddTaskModal onClose={() => setQuick(null)} />}

      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-8" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`anim-pop pointer-events-auto rounded-full px-5 py-3 text-sm font-semibold text-white shadow-xl ${t.tone === "error" ? "bg-rose" : "bg-ink"}`}>{t.text}</div>
        ))}
      </div>
    </div>
  );
}
