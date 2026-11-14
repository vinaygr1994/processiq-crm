"use client";
import { DbNotice } from "./DbNotice";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { Avatar, Spinner } from "./ui";
import { Autopilot } from "./Autopilot";
import { AddContactModal, AddTaskModal } from "./forms";
import { NewLeadModal } from "./flowModals";
import { useCrm } from "@/lib/store";
import { isDemo } from "@/lib/config";
import { roleLabel } from "@/lib/perm";
import { todayStr } from "@/lib/format";

type Item = { href: string; label: string; icon: string };
const SECTIONS: { title: string; items: Item[] }[] = [
  { title: "", items: [{ href: "/", label: "Home", icon: "today" }] },
  { title: "CRM", items: [
    { href: "/contacts", label: "Contacts", icon: "users" },
    { href: "/companies", label: "Companies", icon: "building" },
    { href: "/pipeline", label: "Deals", icon: "pipeline" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/reports", label: "Reports", icon: "chart" },
  ] },
  { title: "Bookings", items: [
    { href: "/bookings", label: "Schedule", icon: "calendar" },
    { href: "/bookings/services", label: "Services and classes", icon: "clock" },
    { href: "/bookings/memberships", label: "Memberships", icon: "users" },
    { href: "/bookings/settings", label: "Booking page", icon: "home" },
  ] },
];
const MC = { href: "/marketing", label: "Marketing Cloud", icon: "send" };
const MOBILE: Item[] = [SECTIONS[0].items[0], SECTIONS[1].items[0], SECTIONS[1].items[2], { ...MC, label: "Marketing" }];

type Quick = "lead" | "contact" | "task";
function useOutside(close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [close]);
  return ref;
}

function QuickAdd({ onPick }: { onPick: (k: Quick) => void }) {
  const [menu, setMenu] = useState(false);
  const ref = useOutside(() => setMenu(false));
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu"
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-teal-d px-3.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,.12)] transition hover:bg-[#055656]">
        <Icon name="plus" className="size-4" /> Create <Icon name="down" className="size-3.5 opacity-70" />
      </button>
      {menu && (
        <div role="menu" className="anim-pop absolute right-0 z-40 mt-1.5 w-48 overflow-hidden rounded-lg border border-line bg-white p-1 shadow-xl">
          {([["lead", "Deal", "pipeline"], ["contact", "Contact", "users"], ["task", "Task", "check"]] as const).map(([k, l, i]) => (
            <button key={k} role="menuitem" onClick={() => { onPick(k); setMenu(false); }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium text-ink hover:bg-cloud">
              <Icon name={i} className="size-4 text-muted" /> {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Hit = { href: string; title: string; sub: string; kind: string; icon: string };
/** Search every record and page from one box. Ctrl/Cmd + K focuses it. */
function GlobalSearch({ pages }: { pages: Item[] }) {
  const { data } = useCrm();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const ref = useOutside(() => setOpen(false));
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);
  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase(); if (s.length < 2) return [];
    const has = (...v: (string | undefined | null)[]) => v.some((x) => x && x.toLowerCase().includes(s));
    const cname = new Map(data.contacts.map((c) => [c.id, c.name]));
    const cos = [...new Set(data.contacts.map((c) => c.company.trim()).filter(Boolean))];
    return [
      ...data.contacts.filter((c) => has(c.name, c.email, c.phone)).slice(0, 5).map((c) => ({ href: `/contacts/${c.id}`, title: c.name, sub: [c.company, c.email || c.phone].filter(Boolean).join(" · "), kind: "Contact", icon: "users" })),
      ...data.deals.filter((d) => has(d.title, cname.get(d.contact_id ?? ""))).slice(0, 4).map((d) => ({ href: `/pipeline?deal=${d.id}`, title: d.title, sub: cname.get(d.contact_id ?? "") ?? "", kind: "Deal", icon: "pipeline" })),
      ...cos.filter((c) => has(c)).slice(0, 3).map((c) => ({ href: `/companies?q=${encodeURIComponent(c)}`, title: c, sub: "", kind: "Company", icon: "building" })),
      ...data.records.filter((r) => has(r.title)).slice(0, 3).map((r) => { const o = data.objects.find((x) => x.id === r.object_id); return { href: `/objects/${r.object_id}`, title: r.title, sub: r.status, kind: o?.name ?? "Record", icon: o?.icon ?? "layers" }; }),
      ...pages.filter((p) => has(p.label)).slice(0, 3).map((p) => ({ href: p.href, title: p.label, sub: "", kind: "Page", icon: p.icon })),
    ];
  }, [q, data, pages]);
  const go = (h: Hit) => { router.push(h.href); setQ(""); setOpen(false); (document.activeElement as HTMLElement | null)?.blur(); };
  return (
    <div className="relative w-full max-w-xl" ref={ref}>
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input ref={input} value={q} role="combobox" aria-expanded={open && hits.length > 0} aria-controls="gs-list" aria-label="Search the CRM"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setAt(0); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && hits[at]) go(hits[at]);
          else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
        }}
        placeholder="Search contacts, deals, companies…"
        className="h-9 w-full rounded-md border border-transparent bg-[#eef1f6] pl-9 pr-14 text-sm text-ink placeholder:text-muted focus:border-teal focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-teal/15" />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-white px-1.5 py-0.5 text-[11px] font-semibold text-muted sm:block">Ctrl K</kbd>
      {open && q.trim().length >= 2 && (
        <div id="gs-list" role="listbox" className="anim-pop absolute inset-x-0 top-full z-40 mt-1.5 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-white p-1 shadow-xl">
          {hits.length === 0 ? <div className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{q.trim()}”.</div> : hits.map((h, i) => (
            <button key={h.kind + h.href + h.title} role="option" aria-selected={i === at} onMouseEnter={() => setAt(i)} onClick={() => go(h)}
              className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left ${i === at ? "bg-cloud" : ""}`}>
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[#eef1f6] text-muted"><Icon name={h.icon} className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-ink">{h.title}</span>{h.sub && <span className="block truncate text-[12.5px] text-muted">{h.sub}</span>}</span>
              <span className="shrink-0 text-[12px] text-muted">{h.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskBell() {
  const { data } = useCrm();
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  const today = todayStr();
  const due = data.tasks.filter((t) => !t.done && t.due_date && t.due_date <= today).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Tasks due: ${due.length}`} className="relative grid size-9 place-items-center rounded-md text-body hover:bg-[#eef1f6]">
        <Icon name="bell" className="size-[18px]" />
        {due.length > 0 && <span className="pill absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose px-1 text-[10px] font-bold text-white">{due.length > 9 ? "9+" : due.length}</span>}
      </button>
      {open && (
        <div className="anim-pop absolute right-0 z-40 mt-1.5 w-80 overflow-hidden rounded-lg border border-line bg-white shadow-xl">
          <div className="border-b border-line bg-[#f8f9fc] px-4 py-2.5 text-[13px] font-semibold text-ink">Tasks due</div>
          {due.length === 0 ? <div className="px-4 py-6 text-center text-sm text-muted">Nothing due. You&apos;re up to date.</div> : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">{due.slice(0, 8).map((t) => {
              const c = data.contacts.find((x) => x.id === t.contact_id);
              return <li key={t.id}><Link href={c ? `/contacts/${c.id}` : "/"} onClick={() => setOpen(false)} className="block px-4 py-2.5 hover:bg-cloud"><span className="block truncate text-sm font-semibold text-ink">{t.title}</span><span className="text-[12.5px] text-muted">{t.due_date! < today ? <span className="font-semibold text-[#c42b52]">Overdue</span> : "Due today"}{c ? ` · ${c.name}` : ""}</span></Link></li>;
            })}</ul>
          )}
          <Link href="/" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-[13px] font-semibold text-teal-d hover:bg-cloud">See all on Home</Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { userEmail, me, can, signOut } = useCrm();
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  const name = me.name || userEmail?.split("@")[0] || "You";
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" aria-label="Account menu" className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-[#eef1f6]">
        <Avatar name={name} size="size-7 text-[11px]" /><span className="hidden max-w-[120px] truncate text-sm font-semibold text-ink md:block">{name}</span><Icon name="down" className="size-3.5 text-muted" />
      </button>
      {open && (
        <div role="menu" className="anim-pop absolute right-0 z-40 mt-1.5 w-60 overflow-hidden rounded-lg border border-line bg-white shadow-xl">
          <div className="border-b border-line px-4 py-3"><div className="truncate text-sm font-semibold text-ink">{userEmail || "Signed in"}</div><div className="text-[12.5px] text-muted">{roleLabel(me.role)}{isDemo ? " · Demo mode" : ""}</div></div>
          <div className="p-1">
            <Link role="menuitem" href="/team" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink hover:bg-cloud"><Icon name="users" className="size-4 text-muted" />Team</Link>
            {can("settings") && <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink hover:bg-cloud"><Icon name="settings" className="size-4 text-muted" />Settings</Link>}
            {!isDemo && <button role="menuitem" onClick={signOut} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-cloud"><Icon name="logout" className="size-4 text-muted" />Log out</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "";
  const { ready, toasts, data, can, me, settings } = useCrm();
  const objNav = data.objects.map((o) => ({ href: `/objects/${o.id}`, label: o.plural, icon: o.icon || "note" }));
  const admin: Item[] = [
    { href: "/team", label: can("team") ? "Team and permissions" : "Team", icon: "users" },
    ...(can("objects") ? [{ href: "/objects", label: "Custom objects", icon: "layers" }] : []),
    ...(can("settings") ? [{ href: "/settings", label: "Settings", icon: "settings" }] : []),
  ];
  const sections = [...SECTIONS.map((s) => s.title === "CRM" ? { ...s, items: [...s.items.slice(0, 3), ...objNav, ...s.items.slice(3)] } : s), { title: "Admin", items: admin }];
  const pages = sections.flatMap((s) => s.items);
  const [quick, setQuick] = useState<Quick | null>(null);
  const [more, setMore] = useState(false);
  const [shut, setShut] = useState<string[]>([]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved menu state after hydration
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem("piq-nav-shut") || "[]"); if (Array.isArray(v) && v.length) setShut(v); } catch { /* fine without it */ } }, []);
  const toggle = (t: string) => setShut((s) => { const n = s.includes(t) ? s.filter((x) => x !== t) : [...s, t]; try { localStorage.setItem("piq-nav-shut", JSON.stringify(n)); } catch { /* fine */ } return n; });
  const active = (h: string) => (h === "/" || h === "/marketing" || h === "/bookings" || h === "/objects" ? path === h : path.startsWith(h));
  const wide = /^\/(journeys|emails)\/./.test(path);

  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-side lg:flex">
        <Link href="/" className="flex h-14 shrink-0 items-center border-b border-white/10 px-4"><Logo dark /></Link>
        <nav className="side-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2.5 py-3" aria-label="Main">
          {sections.map((s) => {
            const closed = shut.includes(s.title) && !s.items.some((n) => active(n.href));
            return (
              <div key={s.title || "top"} className={s.title ? "mt-2" : ""}>
                {s.title && (
                  <button onClick={() => toggle(s.title)} aria-expanded={!closed} className="flex w-full items-center justify-between rounded px-2.5 py-1 text-[11.5px] font-semibold tracking-wide text-[#8391b0] hover:text-white">
                    {s.title}<Icon name="down" className={`size-3.5 transition ${closed ? "-rotate-90" : ""}`} />
                  </button>
                )}
                {!closed && <div className="mt-0.5 flex flex-col gap-px">
                  {s.items.map((n) => (
                    <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
                      className={`relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13.5px] font-medium transition ${active(n.href) ? "bg-white/[.11] text-white before:absolute before:inset-y-1.5 before:-left-2.5 before:w-[3px] before:rounded-r before:bg-[#2fd0c4]" : "text-[#b7c1d8] hover:bg-white/[.06] hover:text-white"}`}>
                      <Icon name={n.icon} className={`size-[17px] ${active(n.href) ? "text-[#5fe0d6]" : "opacity-80"}`} /> <span className="truncate">{n.label}</span>
                    </Link>
                  ))}
                </div>}
              </div>
            );
          })}
        </nav>
        <a href={MC.href} target="_blank" rel="noopener" className="mx-2.5 mb-3 flex shrink-0 items-center gap-2.5 rounded-md border border-white/15 bg-white/[.06] px-2.5 py-2 text-[13.5px] font-semibold text-white transition hover:bg-white/[.12]">
          <span className="grid size-7 place-items-center rounded-md bg-gradient-to-br from-[#0b8a8a] to-[#5a5bef]"><Icon name="send" className="size-3.5" /></span>
          <span className="min-w-0 flex-1 leading-tight">Marketing Cloud<span className="block text-[11.5px] font-normal text-[#8391b0]">Email, mobile, journeys</span></span>
          <Icon name="external" className="size-3.5 text-[#8391b0]" />
        </a>
        <div className="shrink-0 border-t border-white/10 px-4 py-3 text-[12.5px] text-[#8391b0]"><div className="truncate font-semibold text-[#d5dcec]">{settings?.business_name || "Your business"}</div>{isDemo ? "Demo workspace" : roleLabel(me.role)}</div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white px-4 lg:px-6">
        <Link href="/" className="lg:hidden" aria-label="Home"><Logo className="[&>span:last-child]:hidden" /></Link>
        <GlobalSearch pages={pages} />
        <div className="ml-auto flex items-center gap-1.5">
          {can("write") && <QuickAdd onPick={setQuick} />}
          <TaskBell />
          <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
          <UserMenu />
        </div>
      </header>
      <DbNotice />
      {isDemo && <div className="border-b border-[#f3d9a8] bg-[#fff6e5] px-4 py-1.5 text-center text-[12.5px] text-[#7a4700] lg:px-6"><strong>Demo workspace.</strong> Sample data saved only in this browser. Messages are not really sent.</div>}

      <main className={`mx-auto px-4 pb-28 pt-5 sm:px-6 lg:pb-12 lg:pt-6 ${wide ? "max-w-none" : "max-w-[1440px]"}`}>
        {ready && me.role === "viewer" && <div className="mb-4 rounded-md border border-[#f3d9a8] bg-sun-t px-4 py-2 text-[13px] text-ink">You have read-only access. Ask the account owner if you need to make changes.</div>}
        {ready && me.role !== "owner" && !can("settings") && path.startsWith("/settings") ? <div className="rounded-xl border border-line bg-white px-6 py-14 text-center"><h1 className="text-lg font-semibold">Settings are for admins</h1><p className="mt-1 text-muted">Ask the account owner or an admin to change business settings.</p></div> : ready ? children : <div className="grid place-items-center py-32 text-teal"><Spinner className="size-7" /></div>}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
        {MOBILE.map((n) => (
          <Link key={n.href} href={n.href} target={n.href === MC.href ? "_blank" : undefined} aria-current={active(n.href) ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold ${active(n.href) ? "text-teal-d" : "text-muted"}`}>
            <Icon name={n.icon} className="size-[22px]" /> {n.label}
          </Link>
        ))}
        <button type="button" onClick={() => setMore(true)} aria-expanded={more} className="flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold text-muted">
          <Icon name="layers" className="size-[22px]" /> More
        </button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-50 bg-[#0b1324]/55 lg:hidden" onClick={() => setMore(false)}>
          <div role="dialog" aria-label="All pages" className="anim-pop absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]" onClick={(e) => e.stopPropagation()}>
            {sections.filter((s) => s.title).map((s) => (
              <div key={s.title} className="mb-4">
                <div className="mb-1.5 text-[12px] font-semibold text-muted">{s.title}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {s.items.map((n) => (
                    <Link key={n.href} href={n.href} onClick={() => setMore(false)} className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-[13px] font-semibold ${active(n.href) ? "border-teal bg-teal-t text-teal-d" : "border-line text-ink"}`}>
                      <Icon name={n.icon} className="size-4 shrink-0" /><span className="truncate">{n.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ready && <Autopilot />}
      {quick === "contact" && <AddContactModal onClose={() => setQuick(null)} />}
      {quick === "lead" && <NewLeadModal onClose={() => setQuick(null)} />}
      {quick === "task" && <AddTaskModal onClose={() => setQuick(null)} />}

      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`anim-pop pill pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-xl ${t.tone === "error" ? "bg-[#c42b52]" : "bg-ink"}`}>{t.text}</div>
        ))}
      </div>
    </div>
  );
}
