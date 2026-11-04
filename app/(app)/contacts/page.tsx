"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { AddContactModal, ImportModal } from "@/components/forms";
import { Avatar, Badge, Button, Card, Empty, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { timeAgo } from "@/lib/format";

export default function ContactsPage() {
  const { data } = useCrm();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [modal, setModal] = useState<"add" | "import" | null>(null);

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    data.contacts.forEach((c) => c.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data.contacts]);

  const last = useMemo(() => {
    const m = new Map<string, string>();
    const bump = (id: string | null, iso: string) => id && (!m.get(id) || iso > m.get(id)!) && m.set(id, iso);
    data.activities.forEach((a) => bump(a.contact_id, a.created_at));
    data.emails.forEach((e) => bump(e.contact_id, e.created_at));
    return m;
  }, [data.activities, data.emails]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.contacts
      .filter((c) => (!tag || c.tags.includes(tag)) && (!s || [c.name, c.email, c.company, c.phone].some((v) => v.toLowerCase().includes(s))))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.contacts, q, tag]);

  return (
    <div>
      <PageHeader title="Contacts" sub={`${data.contacts.length} ${data.contacts.length === 1 ? "person" : "people"} in your CRM`}
        action={<div className="flex gap-2"><Button variant="soft" icon="upload" onClick={() => setModal("import")}>Import</Button><Button icon="plus" onClick={() => setModal("add")}>Add contact</Button></div>} />

      {data.contacts.length === 0 ? (
        <Card><Empty icon="users" title="No contacts yet" text="Add someone by hand, or import a spreadsheet to bring everyone over at once."
          action={<div className="flex gap-2"><Button onClick={() => setModal("add")}>Add contact</Button><Button variant="soft" onClick={() => setModal("import")}>Import CSV</Button></div>} /></Card>
      ) : (
        <>
          <div className="mb-4 space-y-3">
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
              <input className="field !pl-11" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email, company or phone" aria-label="Search contacts" />
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setTag("")} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${!tag ? "border-teal bg-teal-t text-teal-d" : "border-line bg-white hover:bg-cloud"}`}>Everyone</button>
                {tags.map(([t, n]) => (
                  <button key={t} onClick={() => setTag(tag === t ? "" : t)} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${tag === t ? "border-teal bg-teal-t text-teal-d" : "border-line bg-white hover:bg-cloud"}`}>{t} <span className="text-muted">{n}</span></button>
                ))}
              </div>
            )}
          </div>
          <Card className="!p-0 overflow-hidden">
            {list.length === 0 ? (
              <div className="px-6 py-12 text-center text-muted">No one matches “{q}”.</div>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((c) => (
                  <li key={c.id}>
                    <Link href={`/contacts/${c.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-cloud/70">
                      <Avatar name={c.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><span className="truncate font-semibold text-ink">{c.name}</span>{c.unsubscribed && <Badge tone="rose">Unsubscribed</Badge>}</div>
                        <div className="truncate text-sm text-muted">{[c.company, c.email].filter(Boolean).join(" · ") || "No details yet"}</div>
                      </div>
                      <div className="hidden shrink-0 gap-1.5 sm:flex">{c.tags.slice(0, 2).map((t) => <Badge key={t} tone="teal">{t}</Badge>)}</div>
                      <div className="hidden w-28 shrink-0 text-right text-[13px] text-muted md:block">{last.get(c.id) ? timeAgo(last.get(c.id)!) : "No activity"}</div>
                      <Icon name="chevron" className="size-4 shrink-0 text-[#b3bdd2]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
      {modal === "add" && <AddContactModal onClose={() => setModal(null)} />}
      {modal === "import" && <ImportModal onClose={() => setModal(null)} />}
    </div>
  );
}
