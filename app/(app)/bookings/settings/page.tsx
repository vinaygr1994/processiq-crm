"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button, Card, Field, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { DAYS_LONG, bookingSettings } from "@/lib/bookings";
import type { BookingSettings } from "@/lib/types";

export default function BookingPageSettings() {
  const { settings, saveSettings, toast } = useCrm();
  const [f, setF] = useState<BookingSettings>(() => bookingSettings(settings));
  const [origin, setOrigin] = useState("");
  const [err, setErr] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read the site address in the browser
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/book/${f.slug}`;
  const dayRow = (d: number) => f.hours.find((h) => h.day === d);
  const setDay = (d: number, p: { open?: string; close?: string } | null) => {
    const rest = f.hours.filter((h) => h.day !== d);
    setF({ ...f, hours: p === null ? rest : [...rest, { day: d, open: p.open ?? dayRow(d)?.open ?? "09:00", close: p.close ?? dayRow(d)?.close ?? "17:00" }].sort((a, b) => a.day - b.day) });
  };
  async function save(extra: Partial<BookingSettings> = {}) {
    setErr("");
    const next = { ...f, ...extra, slug: f.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) };
    if (next.slug.length < 2) return setErr("The link name needs at least 2 letters or numbers.");
    if (next.hours.some((h) => h.close <= h.open)) return setErr("Closing time must be after opening time.");
    try { await saveSettings({ booking: next }); setF(next); toast(extra.enabled === true ? "Booking page is live" : extra.enabled === false ? "Booking page turned off" : "Saved"); }
    catch { setErr("Couldn't save. Run supabase/migrations/010_bookings.sql in Supabase first."); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Booking page" sub="Your public page where clients book classes and appointments, 24/7."
        action={<Button icon={f.enabled ? undefined : "send"} onClick={() => save({ enabled: !f.enabled })}>{f.enabled ? "Turn off" : "Turn on"}</Button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="font-semibold">Link and welcome</h2>
          <Field label="Link name" hint={`Your page: ${url}`}><input className="field" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></Field>
          <Field label="Welcome text"><textarea className="field !min-h-[80px]" value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} /></Field>
          {f.enabled ? (
            <div className="flex flex-wrap gap-2"><Button variant="soft" onClick={() => navigator.clipboard?.writeText(url).then(() => toast("Link copied"))}>Copy link</Button><a href={url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-teal-d hover:bg-teal-t">Open the page<Icon name="send" className="size-3.5" /></a></div>
          ) : <p className="rounded-xl bg-sun-t px-4 py-3 text-sm text-[#7a4700]">The page is off. Turn it on when your services and hours are ready.</p>}
          <p className="text-[13px] text-muted">Times use your time zone: <strong>{settings?.timezone || "UTC"}</strong>. <Link href="/settings" className="font-semibold text-teal-d hover:underline">Change it in Settings</Link>.</p>
        </Card>
        <Card className="space-y-4">
          <h2 className="font-semibold">Booking rules</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Notice needed (hours)"><input type="number" min={0} className="field" value={f.lead_hours} onChange={(e) => setF({ ...f, lead_hours: Math.max(0, Number(e.target.value)) })} /></Field>
            <Field label="Start times every (min)"><select className="field" value={f.interval} onChange={(e) => setF({ ...f, interval: Number(e.target.value) })}>{[15, 30, 60].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
            <Field label="Book up to (days ahead)"><input type="number" min={1} max={90} className="field" value={f.window_days} onChange={(e) => setF({ ...f, window_days: Math.min(90, Math.max(1, Number(e.target.value))) })} /></Field>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-ink">Opening hours for appointments</div>
            <ul className="space-y-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => { const r = dayRow(d); return (
                <li key={d} className="flex flex-wrap items-center gap-2">
                  <label className="flex w-32 items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={!!r} onChange={(e) => setDay(d, e.target.checked ? {} : null)} />{DAYS_LONG[d]}</label>
                  {r ? <><input type="time" className="field !h-9 !w-28 !py-0" aria-label={`${DAYS_LONG[d]} opens`} value={r.open} onChange={(e) => setDay(d, { open: e.target.value })} /><span className="text-sm text-muted">to</span><input type="time" className="field !h-9 !w-28 !py-0" aria-label={`${DAYS_LONG[d]} closes`} value={r.close} onChange={(e) => setDay(d, { close: e.target.value })} /></> : <span className="text-sm text-muted">Closed</span>}
                </li>); })}
            </ul>
            <p className="mt-2 text-[12.5px] text-muted">Classes follow their own timetable in Services and classes.</p>
          </div>
        </Card>
      </div>
      {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
      <div className="flex justify-end"><Button onClick={() => save()}>Save</Button></div>
    </div>
  );
}
