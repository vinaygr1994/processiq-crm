"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Badge, Button, Card, Field } from "@/components/ui";
import { PublicForm } from "@/components/PublicForm";
import { useCrm } from "@/lib/store";
import { useStages } from "@/lib/useStages";
import { LIBRARY } from "@/lib/emailDesign";
import { F, FIELD_TYPES, readConfig, type FieldType, type FormConfig, type FormField, type MapTo } from "@/lib/forms";
import { timeAgo } from "@/lib/format";

type Tab = "fields" | "page" | "after" | "share" | "subs";
const MAPS: { id: MapTo; label: string }[] = [
  { id: "name", label: "Contact name" }, { id: "email", label: "Contact email" }, { id: "phone", label: "Contact phone" }, { id: "company", label: "Company" },
  { id: "custom", label: "Custom field" }, { id: "none", label: "Note only" },
];

function FieldCard({ f, i, count, set, move, remove }: { f: FormField; i: number; count: number; set: (f: FormField) => void; move: (d: -1 | 1) => void; remove: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-2xl border border-line bg-white">
      <div className="flex items-center gap-1 pr-1.5">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="min-w-0 flex-1 px-4 py-3 text-left">
          <span className="text-sm font-semibold text-ink">{f.label || "Untitled"}</span>
          <span className="ml-2 text-[12.5px] text-muted">{FIELD_TYPES.find((t) => t.type === f.type)?.label}{f.required ? " · required" : ""}</span>
        </button>
        <button type="button" onClick={() => move(-1)} disabled={i === 0} aria-label="Move up" className="grid size-8 place-items-center rounded-full text-muted hover:bg-cloud disabled:opacity-30">↑</button>
        <button type="button" onClick={() => move(1)} disabled={i === count - 1} aria-label="Move down" className="grid size-8 place-items-center rounded-full text-muted hover:bg-cloud disabled:opacity-30">↓</button>
        <button type="button" onClick={remove} aria-label="Remove field" className="grid size-8 place-items-center rounded-full text-muted hover:bg-rose-t hover:text-rose">×</button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-line px-4 py-4">
          <Field label="Label"><input className="field" value={f.label} onChange={(e) => set({ ...f, label: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type"><select className="field" value={f.type} onChange={(e) => set({ ...f, type: e.target.value as FieldType, options: e.target.value === "select" ? f.options ?? ["Option 1", "Option 2"] : f.options })}>{FIELD_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}</select></Field>
            <Field label="Saves to"><select className="field" value={f.mapTo} onChange={(e) => { const m = e.target.value as MapTo; set({ ...f, mapTo: m, key: m === "custom" ? f.key || f.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") : undefined }); }}>{MAPS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></Field>
          </div>
          {f.type === "select" && <Field label="Choices" hint="One per line."><textarea className="field !min-h-[90px]" value={(f.options ?? []).join("\n")} onChange={(e) => set({ ...f, options: e.target.value.split("\n") })} onBlur={() => set({ ...f, options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) })} /></Field>}
          {!["checkbox", "select", "date"].includes(f.type) && <Field label="Placeholder (optional)"><input className="field" value={f.placeholder ?? ""} onChange={(e) => set({ ...f, placeholder: e.target.value })} /></Field>}
          <Field label="Help text (optional)"><input className="field" value={f.help ?? ""} onChange={(e) => set({ ...f, help: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={f.required} onChange={(e) => set({ ...f, required: e.target.checked })} />Required</label>
        </div>
      )}
    </li>
  );
}

export default function FormEditor() {
  const { id } = useParams<{ id: string }>();
  const { data, ready, update, settings, toast } = useCrm();
  const { stages } = useStages();
  const form = data.forms.find((f) => f.id === id);
  const [cfg, setCfg] = useState<FormConfig | null>(null);
  const [name, setName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("fields");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copy the saved form into the editor once it loads
    if (form && !cfg) { setCfg(readConfig(form)); setName(form.name); }
    setOrigin(window.location.origin);
  }, [form, cfg]);
  const subs = useMemo(() => data.form_submissions.filter((s) => s.form_id === id), [data.form_submissions, id]);
  const tags = useMemo(() => [...new Set(data.contacts.flatMap((c) => c.tags))].sort(), [data.contacts]);

  if (!ready) return null;
  if (!form) return <Card><p>That form doesn&apos;t exist. <Link href="/marketing/forms" className="font-semibold text-teal-d hover:underline">Back to forms</Link></p></Card>;
  if (!cfg) return null;

  const set = (p: Partial<FormConfig>) => { setCfg({ ...cfg, ...p }); setDirty(true); };
  const setField = (i: number, f: FormField) => set({ fields: cfg.fields.map((x, k) => (k === i ? f : x)) });
  const url = `${origin}/f/${form.slug}`;
  const embed = `<iframe src="${url}?embed=1" style="width:100%;max-width:520px;height:720px;border:0" title="${name.replace(/"/g, "")}"></iframe>`;

  function problems() {
    if (!cfg!.fields.some((f) => f.mapTo === "email" || f.mapTo === "phone")) return "Add a field that saves to Contact email or Contact phone, so you can follow up.";
    if (cfg!.fields.some((f) => !f.label.trim())) return "Every field needs a label.";
    return "";
  }
  async function save(extra: Partial<{ status: "draft" | "published" }> = {}) {
    const p = problems(); if (p && extra.status === "published") return toast(p, "error");
    await update("forms", form!.id, { name: name.trim() || "Untitled form", config: cfg, ...extra });
    setDirty(false); toast(extra.status === "published" ? "Form is live" : extra.status === "draft" ? "Form unpublished" : "Saved");
  }
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast("Copied"));
  const live = form.status === "published";
  const tabs: [Tab, string][] = [["fields", "Fields"], ["page", "Landing page"], ["after", "After submit"], ["share", "Share"], ["subs", `Submissions (${subs.length})`]];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/marketing/forms" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"><Icon name="back" className="size-4" />Forms</Link>
        <input className="field !h-10 min-w-0 flex-1 !py-1 font-display text-lg font-semibold sm:max-w-md" aria-label="Form name" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
        <Badge tone={live ? "teal" : "gray"}>{live ? "Live" : "Draft"}</Badge>
        <div className="ml-auto flex gap-2">
          <Button variant="soft" onClick={() => save()} disabled={!dirty}>{dirty ? "Save" : "Saved"}</Button>
          <Button icon={live ? undefined : "send"} onClick={() => save({ status: live ? "draft" : "published" })}>{live ? "Unpublish" : "Publish"}</Button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === k ? "border-teal text-ink" : "border-transparent text-muted hover:text-ink"}`}>{l}</button>)}
      </div>

      {tab === "subs" ? (
        <Card className="!p-0 overflow-hidden">
          {subs.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">No submissions yet. {live ? "Share the link to start collecting." : "Publish the form, then share the link."}</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-line text-left text-[13px] text-muted"><tr><th className="px-5 py-3 font-semibold">When</th><th className="px-3 py-3 font-semibold">Contact</th>{cfg.fields.slice(0, 4).map((f) => <th key={f.id} className="px-3 py-3 font-semibold">{f.label}</th>)}</tr></thead>
                <tbody className="divide-y divide-line">
                  {subs.map((s) => { const c = data.contacts.find((x) => x.id === s.contact_id); return (
                    <tr key={s.id}><td className="whitespace-nowrap px-5 py-3 text-muted">{timeAgo(s.created_at)}</td><td className="px-3 py-3">{c ? <Link href={`/contacts/${c.id}`} className="font-semibold text-teal-d hover:underline">{c.name}</Link> : "–"}</td>{cfg.fields.slice(0, 4).map((f) => <td key={f.id} className="max-w-[220px] truncate px-3 py-3">{s.data[f.id] ?? ""}</td>)}</tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            {tab === "fields" && (<>
              <Card className="space-y-3 !p-4">
                <Field label="Form heading"><input className="field" value={cfg.title} onChange={(e) => set({ title: e.target.value })} /></Field>
                <Field label="Intro"><textarea className="field !min-h-[70px]" value={cfg.intro} onChange={(e) => set({ intro: e.target.value })} /></Field>
                <Field label="Button text"><input className="field" value={cfg.button} onChange={(e) => set({ button: e.target.value })} /></Field>
              </Card>
              <ul className="space-y-2">{cfg.fields.map((f, i) => <FieldCard key={f.id} f={f} i={i} count={cfg.fields.length} set={(nf) => setField(i, nf)} remove={() => set({ fields: cfg.fields.filter((_, k) => k !== i) })}
                move={(d) => { const fs = [...cfg.fields]; [fs[i], fs[i + d]] = [fs[i + d], fs[i]]; set({ fields: fs }); }} />)}</ul>
              <div>
                <div className="mb-2 text-sm font-semibold text-ink">Add a field</div>
                <div className="flex flex-wrap gap-1.5">{FIELD_TYPES.map((t) => <button key={t.type} type="button" onClick={() => set({ fields: [...cfg.fields, F(t.type, t.label, t.type === "email" ? "email" : t.type === "phone" ? "phone" : "custom")] })} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-medium hover:border-teal hover:bg-teal-t/40">+ {t.label}</button>)}</div>
              </div>
              <Card className="space-y-3 !p-4">
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={cfg.consent.enabled} onChange={(e) => set({ consent: { ...cfg.consent, enabled: e.target.checked } })} />Ask for email marketing consent</label>
                {cfg.consent.enabled && (<>
                  <Field label="Consent text"><textarea className="field !min-h-[60px]" value={cfg.consent.text} onChange={(e) => set({ consent: { ...cfg.consent, text: e.target.value } })} /></Field>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={cfg.consent.required} onChange={(e) => set({ consent: { ...cfg.consent, required: e.target.checked } })} />Must tick to submit</label>
                </>)}
              </Card>
            </>)}

            {tab === "page" && (
              <Card className="space-y-4 !p-4">
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={cfg.page.enabled} onChange={(e) => set({ page: { ...cfg.page, enabled: e.target.checked } })} />Show as a full landing page</label>
                <p className="-mt-2 text-[13px] text-muted">Off: just the form. On: a branded page with a headline, picture and benefits, ready for ads.</p>
                {cfg.page.enabled && (<>
                  <Field label="Headline"><input className="field" value={cfg.page.headline} onChange={(e) => set({ page: { ...cfg.page, headline: e.target.value } })} /></Field>
                  <Field label="Sub-headline"><textarea className="field !min-h-[70px]" value={cfg.page.subtext} onChange={(e) => set({ page: { ...cfg.page, subtext: e.target.value } })} /></Field>
                  <Field label="Benefits" hint="One per line, shown with ticks."><textarea className="field !min-h-[90px]" value={cfg.page.bullets} onChange={(e) => set({ page: { ...cfg.page, bullets: e.target.value } })} /></Field>
                  <div>
                    <span className="mb-1.5 block text-sm font-semibold text-ink">Picture</span>
                    <input className="field" value={cfg.page.image} onChange={(e) => set({ page: { ...cfg.page, image: e.target.value } })} placeholder="https://… or pick below" aria-label="Picture web address" />
                    <div className="mt-2 grid grid-cols-5 gap-1.5">{LIBRARY.map((l) => <button key={l.src} type="button" onClick={() => set({ page: { ...cfg.page, image: l.src } })} className={`overflow-hidden rounded-lg border-2 ${cfg.page.image === l.src ? "border-teal" : "border-transparent"}`} title={l.alt}><img src={l.src} alt={l.alt} className="aspect-square w-full object-cover" /></button>)}</div>
                  </div>
                  <Field label="Layout"><select className="field" value={cfg.page.layout} onChange={(e) => set({ page: { ...cfg.page, layout: e.target.value as "side" | "stacked" } })}><option value="side">Form beside the headline</option><option value="stacked">Form below the headline</option></select></Field>
                </>)}
                <div className="flex items-center justify-between"><span className="text-sm font-semibold">Brand colour</span><input type="color" aria-label="Brand colour" value={cfg.brand} onChange={(e) => set({ brand: e.target.value })} className="h-9 w-14 cursor-pointer rounded-lg border border-line bg-white p-1" /></div>
              </Card>
            )}

            {tab === "after" && (
              <Card className="space-y-4 !p-4">
                <Field label="Add them to these lists" hint="Comma-separated. Lists can start journeys.">
                  <input className="field" list="form-tags" value={cfg.tags.join(", ")} onChange={(e) => set({ tags: e.target.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) })} placeholder="e.g. newsletter, lead" />
                  <datalist id="form-tags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
                </Field>
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={cfg.createDeal} onChange={(e) => set({ createDeal: e.target.checked })} />Create a deal in the pipeline</label>
                {cfg.createDeal && <Field label="Deal stage"><select className="field" value={cfg.dealStage} onChange={(e) => set({ dealStage: e.target.value })}>{stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>}
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-4 accent-[#0b8a8a]" checked={cfg.notify} onChange={(e) => set({ notify: e.target.checked })} />Email me each new submission</label>
                <Field label="Thank-you message"><textarea className="field !min-h-[70px]" value={cfg.thanks} onChange={(e) => set({ thanks: e.target.value })} /></Field>
                <Field label="Or send them to a page (optional)" hint="A full web address. Overrides the thank-you message."><input className="field" value={cfg.redirect} onChange={(e) => set({ redirect: e.target.value })} placeholder="https://…" /></Field>
                <p className="rounded-xl bg-cloud px-4 py-3 text-[13px] text-muted">To send a follow-up automatically, build a journey with the entry source &ldquo;Form is submitted&rdquo;. <Link href="/journeys" className="font-semibold text-teal-d hover:underline">Go to Journeys</Link></p>
              </Card>
            )}

            {tab === "share" && (
              <Card className="space-y-4 !p-4">
                {!live && <p className="rounded-xl bg-sun-t px-4 py-3 text-sm text-[#7a4700]">The form is a draft. Publish it to make the link work.</p>}
                <Field label="Link"><div className="flex gap-2"><input className="field" readOnly value={url} onFocus={(e) => e.target.select()} /><Button variant="soft" onClick={() => copy(url)}>Copy</Button></div></Field>
                <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-d hover:underline">Open the page<Icon name="send" className="size-3.5" /></a>
                <Field label="Embed on your website" hint="Paste this into your site's HTML where the form should appear."><textarea className="field !min-h-[90px] font-mono !text-[12.5px]" readOnly value={embed} onFocus={(e) => e.target.select()} /></Field>
                <Button variant="soft" onClick={() => copy(embed)}>Copy embed code</Button>
                <p className="text-[13px] text-muted">For ads, add <code className="rounded bg-cloud px-1">?source=Facebook</code> style tracking to the link if you like. Contacts are saved with the form&apos;s name as their source.</p>
              </Card>
            )}
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">Live preview</span>
              <div className="inline-flex rounded-full bg-cloud p-1" role="group" aria-label="Preview size">{(["desktop", "mobile"] as const).map((d) => <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} className={`rounded-full px-3 py-1 text-[13px] font-semibold capitalize ${device === d ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{d}</button>)}</div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-line bg-cloud">
              <div className={`mx-auto max-h-[760px] overflow-y-auto bg-white transition-[width] ${device === "mobile" ? "w-[375px] max-w-full" : "w-full"}`}>
                <PublicForm key={device} cfg={cfg} business={settings?.business_name} preview onSubmit={async () => {}} />
              </div>
            </div>
            <p className="mt-2 text-[12.5px] text-muted">The preview doesn&apos;t save anything. Try the form to see the thank-you message.</p>
          </div>
        </div>
      )}
    </div>
  );
}
