"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card } from "./ui";
import { BookingModal } from "./BookingModal";
import { useCrm } from "@/lib/store";
import { fmtWhen, localDate } from "@/lib/bookings";

/** Bookings and memberships on a contact's page. Hidden until bookings are set up. */
export function ContactBookings({ contactId }: { contactId: string }) {
  const { data, settings } = useCrm();
  const [book, setBook] = useState(false);
  const [now] = useState(() => Date.now());
  if (!data.services.length) return null;
  const tz = settings?.timezone, today = localDate(now, tz);
  const mine = data.bookings.filter((b) => b.contact_id === contactId).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const upcoming = mine.filter((b) => +new Date(b.starts_at) >= now && b.status === "booked").reverse();
  const past = mine.filter((b) => !upcoming.includes(b)).slice(0, 5);
  const ms = data.memberships.filter((m) => m.contact_id === contactId);
  const visits = mine.filter((b) => b.status === "checked_in").length, noShows = mine.filter((b) => b.status === "no_show").length;
  const name = (id: string | null) => data.services.find((s) => s.id === id)?.name ?? "Booking";
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Bookings</h2><Button size="sm" variant="soft" icon="plus" onClick={() => setBook(true)}>Book</Button></div>
      <p className="mb-3 text-[13px] text-muted">{visits} visit{visits === 1 ? "" : "s"}{noShows ? ` · ${noShows} no-show${noShows === 1 ? "" : "s"}` : ""}</p>
      {ms.map((m) => { const p = data.plans.find((x) => x.id === m.plan_id); const live = m.status === "active" && (!m.ends_on || m.ends_on >= today); return (
        <div key={m.id} className="mb-2 flex items-center justify-between rounded-2xl bg-teal-t/50 px-4 py-2.5 text-sm"><span><strong>{p?.name ?? "Membership"}</strong>{m.credits !== null ? ` · ${m.credits} left` : ""}{m.ends_on ? ` · until ${m.ends_on}` : ""}</span><Badge tone={live ? "green" : "gray"}>{live ? "Active" : "Ended"}</Badge></div>
      ); })}
      {upcoming.length + past.length === 0 ? <p className="text-muted">No bookings yet.</p> : (
        <ul className="space-y-1.5">
          {[...upcoming, ...past].map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 rounded-2xl border border-line px-4 py-2.5 text-sm">
              <span className="min-w-0"><span className="block truncate font-semibold text-ink">{name(b.service_id)}</span><span className="text-[12.5px] text-muted">{fmtWhen(+new Date(b.starts_at), tz)}</span></span>
              <Badge tone={b.status === "checked_in" ? "green" : b.status === "booked" ? "teal" : b.status === "no_show" ? "rose" : "gray"}>{b.status === "checked_in" ? "Attended" : b.status === "booked" ? "Upcoming" : b.status === "no_show" ? "No-show" : "Cancelled"}</Badge>
            </li>
          ))}
        </ul>
      )}
      <Link href="/bookings" className="mt-3 inline-block text-sm font-semibold text-teal-d hover:underline">Open schedule</Link>
      {book && <BookingModal onClose={() => setBook(false)} preset={{ contactId }} />}
    </Card>
  );
}
