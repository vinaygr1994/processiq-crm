"use client";
import { useMemo, useState } from "react";
import { AiButton, Button, Field } from "./ui";
import { useCrm } from "@/lib/store";
import { useStatus } from "@/lib/status";
import { callApi } from "@/lib/api";
import { aiDraftEmail } from "@/lib/ai";
import { fill } from "@/lib/format";
import {
  BLOCK_LABELS, MERGE_FIELDS, PRESETS, bid, blankDesign, emailVars, isDesign, newBlock, parseDesign, plainOf, renderDesign, stringifyDesign,
  type Block, type BlockType, type Design, type Preset,
} from "@/lib/emailDesign";

const SAMPLE = { name: "Sarah Collins", company: "Collins Family" };
const TAGS_AS_TEXT = Object.fromEntries([...MERGE_FIELDS.map((f) => [f.tag, `{{${f.tag}}}`]), ["first", "{{first_name}}"], ["name", "{{first_name}}"]]);
const ADDABLE: BlockType[] = ["heading", "text", "image", "button", "offer", "list", "quote", "divider", "spacer"];

/** Puts a {{field}} at the cursor of whichever box has focus (marked data-merge). */
function insertTag(tag: string) {
  const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el || !el.hasAttribute("data-merge")) return false;
  const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a, t = `{{${tag}}}`;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, el.value.slice(0, a) + t + el.value.slice(b));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.setSelectionRange(a + t.length, a + t.length);
  return true;
}

const clone = (d: Design): Design => ({ ...d, blocks: d.blocks.map((b) => ({ ...b, id: bid() })) });

function Gallery({ onPick, onClose }: { onPick: (p: Preset) => void; onClose: () => void }) {
  const { settings } = useCrm();
  const kinds = [...new Set(PRESETS.map((p) => p.kind))];
  const [kind, setKind] = useState("All");
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="soft" onClick={onClose}>← Back to my email</Button>
        <h3 className="text-lg font-semibold">Choose a design</h3>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {["All", ...kinds].map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${kind === k ? "bg-ink text-white" : "border border-line bg-white text-body hover:bg-cloud"}`}>{k}</button>)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRESETS.filter((p) => kind === "All" || p.kind === kind).map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p)} className="group overflow-hidden rounded-2xl border border-line bg-white text-left transition hover:border-teal hover:shadow-md">
            <div className="pointer-events-none relative h-52 overflow-hidden bg-cloud">
              <iframe title={p.name} tabIndex={-1} className="absolute left-1/2 top-0 h-[780px] w-[660px] origin-top border-0" style={{ transform: "translateX(-50%) scale(.4)" }}
                srcDoc={renderDesign(p.design, emailVars(SAMPLE, settings), { business: settings?.business_name, address: settings?.address }).html} />
            </div>
            <div className="p-4"><div className="font-semibold text-ink">{p.name}</div><div className="mt-0.5 text-sm text-muted">{p.blurb}</div></div>
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockForm({ b, set }: { b: Block; set: (p: Partial<Block>) => void }) {
  const text = (label: string, k: keyof Block, area = false, hint?: string, ph?: string) => (
    <Field label={label} hint={hint}>
      {area
        ? <textarea data-merge className="field !min-h-[130px]" value={(b[k] as string) ?? ""} placeholder={ph} onChange={(e) => set({ [k]: e.target.value })} />
        : <input data-merge className="field" value={(b[k] as string) ?? ""} placeholder={ph} onChange={(e) => set({ [k]: e.target.value })} />}
    </Field>
  );
  const align = (
    <Field label="Alignment">
      <select className="field" value={b.align ?? "left"} onChange={(e) => set({ align: e.target.value as "left" | "center" })}><option value="left">Left</option><option value="center">Centre</option></select>
    </Field>
  );
  switch (b.type) {
    case "heading": return <div className="space-y-3">{text("Heading", "text")}{align}</div>;
    case "text": return <div className="space-y-3">{text("Text", "text", true)}{align}</div>;
    case "image": return <div className="space-y-3">{text("Image web address", "url", false, "Paste a link that starts with https://. Upload the picture to your website or Google Drive first.", "https://…")}{text("Description (for people who can't see the image)", "alt")}{text("Link when clicked (optional)", "link", false, undefined, "https://…")}</div>;
    case "button": return <div className="space-y-3">{text("Button text", "label")}{text("Where it goes", "url", false, "A web address, or {{booking_link}} for your booking page.", "https://…")}{align}</div>;
    case "offer": return <div className="space-y-3">{text("Headline", "title")}{text("Details", "text", true)}</div>;
    case "list": return <div className="space-y-3">{text("Bullet points", "text", true, "One per line.")}</div>;
    case "quote": return <div className="space-y-3">{text("Quote", "text", true)}{text("Who said it", "by")}</div>;
    case "spacer": return (
      <Field label={`Space height: ${b.size ?? 24}px`}><input type="range" min={8} max={80} step={4} value={b.size ?? 24} onChange={(e) => set({ size: +e.target.value })} className="w-full accent-[#0b8a8a]" /></Field>
    );
    default: return <p className="text-sm text-muted">A thin line between sections. Nothing to set.</p>;
  }
}

const snippet = (b: Block) => (b.text || b.title || b.label || b.url || "").replace(/\s+/g, " ").slice(0, 46);

interface Props {
  subject: string; body: string;
  onSubject: (s: string) => void; onBody: (s: string) => void;
  /** The contact the preview should use. Without one, a sample contact is shown. */
  contact?: { name: string; company: string } | null;
  /** Who the AI writes to: the real contact, or merge fields for a campaign. */
  aiContact: { name: string; company: string };
  aiRecent?: string[];
  goals?: string[];
  aiPlaceholder?: string;
}

export function EmailEditor({ subject, body, onSubject, onBody, contact, aiContact, aiRecent = [], goals = [], aiPlaceholder = "What's this email about?" }: Props) {
  const { data, settings, userEmail, toast } = useCrm();
  const status = useStatus();
  const design = useMemo(() => parseDesign(body), [body]);
  const [sel, setSel] = useState<string | null>(null);
  const [gallery, setGallery] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [goal, setGoal] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [note, setNote] = useState("");
  const [testing, setTesting] = useState(false);

  const vars = emailVars(contact ?? SAMPLE, settings);
  const html = useMemo(() => design ? renderDesign(design, vars, { business: settings?.business_name, address: settings?.address, unsubscribeUrl: "#" }).html : "", [design, settings?.business_name, settings?.address, settings?.booking_link, settings?.review_link, contact?.name, contact?.company]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = design?.blocks.find((b) => b.id === sel) ?? null;

  const setDesign = (d: Design) => onBody(stringifyDesign(d));
  const patch = (id: string, p: Partial<Block>) => design && setDesign({ ...design, blocks: design.blocks.map((b) => (b.id === id ? { ...b, ...p } : b)) });
  const move = (i: number, dir: -1 | 1) => {
    if (!design) return; const bl = [...design.blocks], j = i + dir; if (j < 0 || j >= bl.length) return;
    [bl[i], bl[j]] = [bl[j], bl[i]]; setDesign({ ...design, blocks: bl });
  };
  const dup = (i: number) => { if (!design) return; const bl = [...design.blocks]; const c = { ...bl[i], id: bid() }; bl.splice(i + 1, 0, c); setDesign({ ...design, blocks: bl }); setSel(c.id); };
  const del = (i: number) => { if (!design) return; setDesign({ ...design, blocks: design.blocks.filter((_, k) => k !== i) }); setSel(null); };
  const addBlock = (t: BlockType) => {
    if (!design) return; const b = newBlock(t);
    const at = selected ? design.blocks.findIndex((x) => x.id === selected.id) + 1 : design.blocks.length;
    const bl = [...design.blocks]; bl.splice(at, 0, b); setDesign({ ...design, blocks: bl }); setSel(b.id);
  };

  function toDesign() {
    const first = newBlock("text"); if (body.trim() && !isDesign(body)) first.text = body;
    setDesign(blankDesign([first])); setSel(first.id);
  }
  function toText() {
    if (!design) return;
    onBody(renderDesign(design, TAGS_AS_TEXT).text.replace(/\n--\n[\s\S]*$/, "").trim()); setSel(null);
  }
  function pickPreset(p: Preset) { onSubject(p.subject); setDesign(clone(p.design)); setSel(null); setGallery(false); }
  function pickSaved(id: string) {
    const t = data.templates.find((x) => x.id === id); if (!t) return;
    onSubject(t.subject); onBody(t.body); setSel(null);
  }

  async function draft() {
    setNote(""); setAiNote("");
    if (!goal.trim()) return setNote("Tell the AI what this email is about first (or tap one of the ideas).");
    setAiBusy(true);
    try {
      const cur = design ? design.blocks.find((b) => b.type === "text")?.text ?? "" : body;
      const r = await aiDraftEmail({ goal, contact: aiContact, business: settings?.business_name ?? "", sender: settings?.sender_name ?? "", recent: aiRecent, previous: cur ? { subject, body: cur } : undefined });
      onSubject(r.result.subject);
      if (design) {
        const t = design.blocks.find((b) => b.type === "text");
        setDesign(t ? { ...design, blocks: design.blocks.map((b) => (b.id === t.id ? { ...b, text: r.result.body } : b)) } : { ...design, blocks: [...design.blocks, { ...newBlock("text"), text: r.result.body }] });
      } else onBody(r.result.body);
      if (!r.live) setAiNote("This is a sample draft. Add an Anthropic API key to get personalised drafts.");
    } catch (e) { setNote((e as Error).message); }
    setAiBusy(false);
  }

  async function sendTest() {
    setNote("");
    if (!subject.trim() || (!design && !body.trim()) || (design && design.blocks.length === 0)) return setNote("Add a subject and a message first.");
    if (status?.demo) return toast("Demo mode: test emails aren't really sent");
    if (!userEmail) return setNote("We couldn't find your login email. Log in again.");
    setTesting(true);
    try {
      const sample = { name: contact?.name ?? SAMPLE.name, company: contact?.company ?? SAMPLE.company };
      await callApi("/api/email/send", { to: userEmail, subject: fill(subject, sample), body: design ? plainOf(body, vars) : fill(body, sample), design: design ?? undefined, test: true });
      toast(`Test sent to ${userEmail}`);
    } catch (e) { setNote((e as Error).message); }
    setTesting(false);
  }

  const mergeBar = (
    <div className="flex flex-wrap items-center gap-1.5" onMouseDown={(e) => e.preventDefault()}>
      <span className="text-[13px] font-medium text-muted">Insert:</span>
      {MERGE_FIELDS.map((f) => (
        <button key={f.tag} type="button" onClick={() => { if (!insertTag(f.tag)) setNote("Click inside the subject or a text box first, then pick a field."); else setNote(""); }}
          className="rounded-full border border-line bg-white px-2.5 py-1 text-[12.5px] font-medium text-body hover:bg-cloud">{f.label}</button>
      ))}
    </div>
  );

  if (gallery) return <Gallery onPick={pickPreset} onClose={() => setGallery(false)} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <div className="rounded-2xl border border-line bg-gradient-to-br from-white to-iris-t/40 p-4">
          <div className="mb-2 text-sm font-semibold text-ink">Write it with AI</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className="field" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={aiPlaceholder} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), draft())} />
            <AiButton onClick={draft} busy={aiBusy}>{(design ? design.blocks.some((b) => b.type === "text") : body) ? "Rewrite" : "Write draft"}</AiButton>
          </div>
          {goals.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{goals.map((g) => <button key={g} type="button" onClick={() => setGoal(g)} className="rounded-full border border-line bg-white px-3 py-1 text-[13px] font-medium text-body hover:bg-cloud">{g}</button>)}</div>}
          {aiNote && <p className="mt-2 text-[13px] text-muted">{aiNote}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-cloud p-1" role="tablist" aria-label="Email style">
            <button type="button" role="tab" aria-selected={!design} onClick={() => design && toText()} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${!design ? "bg-white text-ink shadow-sm" : "text-muted"}`}>Simple text</button>
            <button type="button" role="tab" aria-selected={!!design} onClick={() => !design && toDesign()} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${design ? "bg-white text-ink shadow-sm" : "text-muted"}`}>Designed email</button>
          </div>
          <Button type="button" size="sm" variant="soft" onClick={() => setGallery(true)}>Browse designs</Button>
          {data.templates.length > 0 && (
            <select aria-label="Saved templates" className="field !h-9 !w-auto !py-0 text-sm" value="" onChange={(e) => pickSaved(e.target.value)}>
              <option value="" disabled>Saved templates…</option>{data.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>

        <Field label="Subject"><input data-merge className="field" value={subject} onChange={(e) => onSubject(e.target.value)} placeholder="What will they see in their inbox?" /></Field>
        {design && <Field label="Preview line" hint="The short grey text next to the subject in most inboxes."><input data-merge className="field" value={design.preheader} onChange={(e) => setDesign({ ...design, preheader: e.target.value })} placeholder="e.g. We'll be in touch shortly." /></Field>}
        {mergeBar}

        {!design && (
          <Field label="Message" hint={settings?.signature?.trim() ? "Your signature is added automatically." : "Tip: add a signature in Settings."}>
            <textarea data-merge className="field !min-h-[220px]" value={body} onChange={(e) => onBody(e.target.value)} />
          </Field>
        )}

        {design && (
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-semibold text-ink">Email content</div>
              {design.blocks.length === 0 && <p className="rounded-xl bg-cloud px-4 py-3 text-sm text-muted">Empty. Add a block below, or browse designs.</p>}
              <ul className="space-y-1.5">
                {design.blocks.map((b, i) => (
                  <li key={b.id} className={`rounded-xl border ${sel === b.id ? "border-teal bg-teal-t/30" : "border-line bg-white"}`}>
                    <div className="flex items-center gap-1 pr-1.5">
                      <button type="button" onClick={() => setSel(sel === b.id ? null : b.id)} aria-expanded={sel === b.id} className="min-w-0 flex-1 px-3.5 py-2.5 text-left">
                        <span className="whitespace-nowrap text-sm font-semibold text-ink">{BLOCK_LABELS[b.type]}</span>
                        {snippet(b) && <span className="ml-2 text-[13px] text-muted">{snippet(b)}</span>}
                      </button>
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${BLOCK_LABELS[b.type]} up`} className="grid size-8 place-items-center rounded-full text-muted hover:bg-cloud disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === design.blocks.length - 1} aria-label={`Move ${BLOCK_LABELS[b.type]} down`} className="grid size-8 place-items-center rounded-full text-muted hover:bg-cloud disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => dup(i)} aria-label={`Duplicate ${BLOCK_LABELS[b.type]}`} className="grid size-8 place-items-center rounded-full text-[13px] font-semibold text-muted hover:bg-cloud">2×</button>
                      <button type="button" onClick={() => del(i)} aria-label={`Delete ${BLOCK_LABELS[b.type]}`} className="grid size-8 place-items-center rounded-full text-muted hover:bg-rose-t hover:text-rose">×</button>
                    </div>
                    {sel === b.id && <div className="border-t border-line px-3.5 py-3.5"><BlockForm b={b} set={(p) => patch(b.id, p)} /></div>}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold text-ink">Add a block{selected ? " after the one you picked" : ""}</div>
              <div className="flex flex-wrap gap-1.5">{ADDABLE.map((t) => <button key={t} type="button" onClick={() => addBlock(t)} className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-medium text-body hover:border-teal hover:bg-teal-t/40">+ {BLOCK_LABELS[t]}</button>)}</div>
            </div>
            <details className="rounded-xl border border-line bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">Brand and footer</summary>
              <div className="space-y-3 border-t border-line px-4 py-4">
                <Field label="Brand colour"><input type="color" aria-label="Brand colour" value={design.brand} onChange={(e) => setDesign({ ...design, brand: e.target.value })} className="h-10 w-20 cursor-pointer rounded-lg border border-line bg-white p-1" /></Field>
                <Field label="Logo web address (optional)" hint="Without one, your business name is shown at the top."><input className="field" value={design.logo} onChange={(e) => setDesign({ ...design, logo: e.target.value })} placeholder="https://…" /></Field>
                <Field label="Footer note (optional)"><input data-merge className="field" value={design.footer} onChange={(e) => setDesign({ ...design, footer: e.target.value })} placeholder="e.g. Licensed and insured" /></Field>
              </div>
            </details>
          </div>
        )}
        {note && <p role="alert" className="text-sm font-medium text-rose">{note}</p>}
      </div>

      <div className="min-w-0">
        <div className="sticky top-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-ink">Preview{contact ? ` for ${contact.name}` : " (sample contact)"}</div>
            <div className="flex items-center gap-2">
              {design && (
                <div className="inline-flex rounded-full bg-cloud p-1" role="group" aria-label="Preview size">
                  {(["desktop", "mobile"] as const).map((d) => <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} className={`rounded-full px-3 py-1 text-[13px] font-semibold capitalize ${device === d ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{d}</button>)}
                </div>
              )}
              <Button type="button" size="sm" variant="soft" icon="send" onClick={sendTest} disabled={testing}>{testing ? "Sending…" : "Send me a test"}</Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-cloud">
            {design ? (
              <iframe title="Email preview" sandbox="" srcDoc={html} className={`mx-auto block h-[560px] border-0 bg-cloud transition-[width] ${device === "mobile" ? "w-[375px] max-w-full" : "w-full"}`} />
            ) : (
              <div className="h-[560px] overflow-y-auto bg-white p-5 text-[15px] leading-relaxed text-[#222]">
                <div className="mb-3 border-b border-line pb-3 text-sm"><span className="text-muted">Subject:</span> <strong className="text-ink">{fill(subject, contact ?? SAMPLE) || "…"}</strong></div>
                <p className="whitespace-pre-wrap">{fill(body, contact ?? SAMPLE) || <span className="text-muted">Your message will appear here.</span>}</p>
                {settings?.signature?.trim() && <p className="mt-4 whitespace-pre-wrap">{settings.signature}</p>}
              </div>
            )}
          </div>
          <p className="text-[13px] text-muted">{design ? "Test emails go to your login email. Unsubscribe link and business address are added to every campaign email automatically." : "Plain text looks like a personal email. Switch to Designed email for buttons, images and your brand colour."}</p>
        </div>
      </div>
    </div>
  );
}
