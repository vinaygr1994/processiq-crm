"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, ConfirmModal, Empty, Modal, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { CUSTOM_STARTERS, FORM_STARTERS, newSlug, readConfig } from "@/lib/forms";
import { timeAgo } from "@/lib/format";
import type { FormDef } from "@/lib/types";

export default function FormsPage() {
  const { data, add, remove, toast } = useCrm();
  const router = useRouter();
  const [picker, setPicker] = useState(false);
  const [del, setDel] = useState<FormDef | null>(null);
  const subs = (id: string) => data.form_submissions.filter((s) => s.form_id === id);

  async function create(id: string) {
    const s = [...CUSTOM_STARTERS, ...FORM_STARTERS].find((x) => x.id === id)!;
    try {
      const row = await add("forms", { name: s.name, slug: newSlug(s.name), status: "draft", config: s.config() });
      if (row) router.push(`/marketing/forms/${row.id}`);
    } catch { toast("Forms need a one-time database update: run supabase/schema.sql in the Supabase SQL Editor.", "error"); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Forms and landing pages" sub="Collect sign-ups and leads. Every submission becomes a contact, joins your lists and can start a journey."
        action={<Button icon="plus" onClick={() => setPicker(true)}>New form or page</Button>} />
      {data.forms.length === 0 ? (
        <Card><Empty icon="note" title="Create your first form" text="Start from a contact form, a free-quote landing page, a newsletter sign-up, a booking request or an event registration." action={<Button icon="plus" onClick={() => setPicker(true)}>New form or page</Button>} /></Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <ul className="divide-y divide-line">
            {data.forms.map((f) => {
              const cfg = readConfig(f), s = subs(f.id), last = s[0]?.created_at;
              return (
                <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-t text-teal-d"><Icon name={cfg.page.enabled ? "home" : "note"} className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/marketing/forms/${f.id}`} className="font-semibold text-ink hover:text-teal-d">{f.name}</Link>
                    <div className="text-[13px] text-muted">{cfg.page.enabled ? (cfg.page.mode === "custom" ? "Custom landing page" : "Landing page") : "Form"} · /f/{f.slug}</div>
                  </div>
                  <div className="text-right text-sm"><div className="font-semibold text-ink">{s.length} submission{s.length === 1 ? "" : "s"}</div><div className="text-[13px] text-muted">{last ? `Last ${timeAgo(last)}` : "None yet"}</div></div>
                  <Badge tone={f.status === "published" ? "teal" : "gray"}>{f.status === "published" ? "Live" : "Draft"}</Badge>
                  <button onClick={() => setDel(f)} className="text-[#b3bdd2] hover:text-rose" aria-label={`Delete ${f.name}`}><Icon name="trash" className="size-[18px]" /></button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {picker && (
        <Modal title="New form or landing page" onClose={() => setPicker(false)} wide>
          <h3 className="mb-2 text-[13px] font-semibold text-muted">Build your own</h3>
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            {CUSTOM_STARTERS.map((s) => (
              <button key={s.id} type="button" onClick={() => create(s.id)} className="flex items-start gap-3 rounded-lg border border-teal bg-teal-t/40 p-4 text-left transition hover:bg-teal-t">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-d text-white"><Icon name={s.id === "custom-page" ? "layers" : "note"} className="size-[18px]" /></span>
                <span><span className="block font-semibold text-ink">{s.name}</span><span className="mt-0.5 block text-[13px] text-muted">{s.text}</span></span>
              </button>
            ))}
          </div>
          <h3 className="mb-2 text-[13px] font-semibold text-muted">Or start from a template</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {FORM_STARTERS.map((s) => (
              <button key={s.id} type="button" onClick={() => create(s.id)} className="rounded-lg border border-line bg-white p-4 text-left transition hover:border-teal hover:bg-cloud">
                <div className="font-semibold text-ink">{s.name}</div><p className="mt-1 text-[13px] text-muted">{s.text}</p>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {del && <ConfirmModal title={`Delete “${del.name}”?`} text="The link stops working and its submission history is deleted. Contacts it created stay in your CRM." onClose={() => setDel(null)} onConfirm={async () => { await remove("forms", del.id); setDel(null); toast("Form deleted"); }} />}
    </div>
  );
}
