"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { AiButton, Button, Field } from "./ui";
import { useCrm } from "@/lib/store";
import { useStatus } from "@/lib/status";
import { callApi } from "@/lib/api";
import { aiDraftEmail } from "@/lib/ai";
import { fill } from "@/lib/format";
import {
  BLOCK_LABELS, LIBRARY, MERGE_FIELDS, PALETTE, PRESETS, bid, blankDesign, scratchDesign, emailVars, isDesign, newBlock, paletteItem, parseDesign, plainOf, renderDesign, stringifyDesign,
  type Block, type Cell, type ColLayout, type Design, type Preset, type Social,
} from "@/lib/emailDesign";

const SAMPLE = { name: "Sarah Collins", company: "Collins Family" };
const TAGS_AS_TEXT = Object.fromEntries([...MERGE_FIELDS.map((f) => [f.tag, `{{${f.tag}}}`]), ["first", "{{first_name}}"], ["name", "{{first_name}}"]]);

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

const clone = (d: Design): Design => ({ ...d, blocks: d.blocks.map((b) => ({ ...b, id: bid(), cols: b.cols?.map((c) => ({ ...c })) })) });

/* ---------------- Template gallery ---------------- */
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
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <button type="button" onClick={() => onPick({ id: "scratch", name: "Blank", kind: "Blank", blurb: "", subject: "", design: scratchDesign() })}
          className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-[#b7c1d6] bg-white p-5 text-left transition hover:border-teal hover:bg-teal-t">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-cloud text-2xl text-muted">+</span>
          <span><span className="block font-semibold text-ink">Blank: start from scratch</span><span className="text-sm text-muted">No header or footer. Build with blocks or paste your own full HTML design.</span></span>
        </button>
        <button type="button" onClick={() => onPick({ id: "blank-branded", name: "Blank with header", kind: "Blank", blurb: "", subject: "", design: blankDesign([]) })}
          className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-[#b7c1d6] bg-white p-5 text-left transition hover:border-teal hover:bg-teal-t">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-cloud text-2xl text-muted">▤</span>
          <span><span className="block font-semibold text-ink">Blank with your header and footer</span><span className="text-sm text-muted">Your brand bar, logo and footer, with an empty body.</span></span>
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRESETS.filter((p) => kind === "All" || p.kind === kind).map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p)} className="group overflow-hidden rounded-2xl border border-line bg-white text-left transition hover:border-teal hover:shadow-md">
            <div className="pointer-events-none relative h-64 overflow-hidden bg-cloud">
              <iframe title={p.name} tabIndex={-1} loading="lazy" className="absolute left-1/2 top-0 h-[1300px] w-[640px] origin-top border-0" style={{ transform: "translateX(-50%) scale(.45)" }}
                srcDoc={renderDesign(p.design, emailVars(SAMPLE, settings), { business: settings?.business_name, address: settings?.address }).html} />
            </div>
            <div className="border-t border-line p-4"><div className="flex items-center gap-2 font-semibold text-ink">{p.name}<span className="rounded-full bg-cloud px-2 py-0.5 text-[11.5px] font-semibold text-muted">{p.kind}</span></div><div className="mt-0.5 text-sm text-muted">{p.blurb}</div></div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Fields ---------------- */
function TextIn({ label, value, onChange, area, hint, ph, code }: { label: string; value?: string; onChange: (v: string) => void; area?: boolean; hint?: string; ph?: string; code?: boolean }) {
  return (
    <Field label={label} hint={hint}>
      {area
        ? <textarea data-merge className={`field ${code ? "!min-h-[220px] font-mono !text-[13px]" : "!min-h-[110px]"}`} spellCheck={!code} value={value ?? ""} placeholder={ph} onChange={(e) => onChange(e.target.value)} />
        : <input data-merge className="field" value={value ?? ""} placeholder={ph} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

function ImageIn({ label, value, alt, onChange }: { label: string; value?: string; alt?: string; onChange: (src: string, alt?: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      <div className="flex gap-2">
        {value && <img src={value} alt={alt ?? ""} className="size-11 shrink-0 rounded-lg border border-line object-cover" />}
        <input className="field" value={value ?? ""} placeholder="https://… or pick from the library" onChange={(e) => onChange(e.target.value)} aria-label={`${label} web address`} />
      </div>
      <button type="button" onClick={() => setOpen(!open)} className="mt-1.5 text-[13px] font-semibold text-teal-d hover:underline">{open ? "Hide image library" : "Choose from image library"}</button>
      {open && (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {LIBRARY.map((l) => (
            <button key={l.src} type="button" onClick={() => { onChange(l.src, l.alt); setOpen(false); }} className={`overflow-hidden rounded-lg border-2 ${value === l.src ? "border-teal" : "border-transparent hover:border-line"}`} title={l.alt}>
              <img src={l.src} alt={l.alt} className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ColorIn({ label, value, onChange, allowNone }: { label: string; value?: string; onChange: (v: string | undefined) => void; allowNone?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div className="flex items-center gap-2">
        {allowNone && value && <button type="button" onClick={() => onChange(undefined)} className="text-[13px] font-medium text-muted hover:underline">None</button>}
        <input type="color" aria-label={label} value={value ?? "#ffffff"} onChange={(e) => onChange(e.target.value)} className="h-9 w-14 cursor-pointer rounded-lg border border-line bg-white p-1" />
      </div>
    </div>
  );
}

const Align = ({ b, set }: { b: Block; set: (p: Partial<Block>) => void }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-sm font-semibold text-ink">Alignment</span>
    <div className="inline-flex rounded-full bg-cloud p-1">
      {(["left", "center"] as const).map((a) => <button key={a} type="button" aria-pressed={(b.align ?? "left") === a} onClick={() => set({ align: a })} className={`rounded-full px-3 py-1 text-[13px] font-semibold ${(b.align ?? "left") === a ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{a === "left" ? "Left" : "Centre"}</button>)}
    </div>
  </div>
);

function ColumnsForm({ b, set }: { b: Block; set: (p: Partial<Block>) => void }) {
  const cols = b.cols ?? [];
  const [i, setI] = useState(0);
  const c = cols[Math.min(i, cols.length - 1)];
  const setCell = (p: Partial<Cell>) => set({ cols: cols.map((x, k) => (k === Math.min(i, cols.length - 1) ? { ...x, ...p } : x)) });
  const shape = (count: number, layout: ColLayout) => {
    const next = Array.from({ length: count }, (_, k) => cols[k] ?? { img: "", alt: "", title: "Title", text: "A short line about this.", label: "", url: "" });
    set({ layout, cols: next }); setI(0);
  };
  const cur = b.layout && b.layout !== "equal" ? b.layout : String(cols.length);
  const opts: [string, string, () => void][] = [
    ["2", "2 columns", () => shape(2, "equal")], ["3", "3 columns", () => shape(3, "equal")], ["4", "4 columns", () => shape(4, "equal")],
    ["image-left", "Image + text", () => shape(2, "image-left")], ["image-right", "Text + image", () => shape(2, "image-right")],
  ];
  const names = b.layout === "image-left" ? ["Image side", "Text side"] : b.layout === "image-right" ? ["Image side", "Text side"] : cols.map((_, k) => `Column ${k + 1}`);
  return (
    <div className="space-y-4">
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-ink">Layout</span>
        <div className="flex flex-wrap gap-1.5">{opts.map(([k, l, fn]) => <button key={k} type="button" onClick={fn} aria-pressed={cur === k} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${cur === k ? "bg-ink text-white" : "border border-line bg-white text-body hover:bg-cloud"}`}>{l}</button>)}</div>
      </div>
      <div className="flex gap-1 border-b border-line">
        {names.map((nm, k) => <button key={k} type="button" onClick={() => setI(k)} className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold ${k === Math.min(i, cols.length - 1) ? "border-teal text-ink" : "border-transparent text-muted hover:text-ink"}`}>{nm}</button>)}
      </div>
      {c && (
        <div className="space-y-3">
          <ImageIn label="Image (optional)" value={c.img} alt={c.alt} onChange={(img, alt) => setCell(alt !== undefined ? { img, alt } : { img })} />
          {c.img && <TextIn label="Image description" value={c.alt} onChange={(alt) => setCell({ alt })} />}
          <TextIn label="Title" value={c.title} onChange={(title) => setCell({ title })} />
          <TextIn label="Text" value={c.text} onChange={(text) => setCell({ text })} area />
          <TextIn label="Button text (optional)" value={c.label} onChange={(label) => setCell({ label })} />
          {c.label && <TextIn label="Button link" value={c.url} onChange={(url) => setCell({ url })} ph="https://… or {{booking_link}}" />}
        </div>
      )}
      <ColorIn label="Section background" value={b.bg} onChange={(bg) => set({ bg })} allowNone />
    </div>
  );
}

function BlockForm({ b, set }: { b: Block; set: (p: Partial<Block>) => void }) {
  switch (b.type) {
    case "hero": return (
      <div className="space-y-3">
        <ImageIn label="Banner image" value={b.img} alt={b.alt} onChange={(img, alt) => set(alt !== undefined ? { img, alt } : { img })} />
        <TextIn label="Headline" value={b.title} onChange={(title) => set({ title })} />
        <TextIn label="Sub-text" value={b.text} onChange={(text) => set({ text })} area />
        <TextIn label="Button text (optional)" value={b.label} onChange={(label) => set({ label })} />
        {b.label && <TextIn label="Button link" value={b.url} onChange={(url) => set({ url })} ph="https://… or {{booking_link}}" />}
        <ColorIn label="Panel colour" value={b.bg} onChange={(bg) => set({ bg })} allowNone />
      </div>);
    case "heading": return <div className="space-y-3"><TextIn label="Heading" value={b.text} onChange={(text) => set({ text })} /><Align b={b} set={set} /></div>;
    case "text": return <div className="space-y-3"><TextIn label="Text" value={b.text} onChange={(text) => set({ text })} area /><Align b={b} set={set} /><ColorIn label="Background" value={b.bg} onChange={(bg) => set({ bg })} allowNone /></div>;
    case "image": return (
      <div className="space-y-3">
        <ImageIn label="Image" value={b.url} alt={b.alt} onChange={(url, alt) => set(alt !== undefined ? { url, alt } : { url })} />
        <TextIn label="Description (for people who can't see images)" value={b.alt} onChange={(alt) => set({ alt })} />
        <TextIn label="Link when clicked (optional)" value={b.link} onChange={(link) => set({ link })} ph="https://…" />
      </div>);
    case "button": return <div className="space-y-3"><TextIn label="Button text" value={b.label} onChange={(label) => set({ label })} /><TextIn label="Where it goes" value={b.url} onChange={(url) => set({ url })} hint="A web address, or {{booking_link}} for your booking page." ph="https://…" /><Align b={b} set={set} /></div>;
    case "columns": return <ColumnsForm key={b.id} b={b} set={set} />;
    case "offer": return <div className="space-y-3"><TextIn label="Headline" value={b.title} onChange={(title) => set({ title })} /><TextIn label="Details" value={b.text} onChange={(text) => set({ text })} area /></div>;
    case "list": return <TextIn label="Bullet points" value={b.text} onChange={(text) => set({ text })} area hint="One per line." />;
    case "quote": return <div className="space-y-3"><TextIn label="Quote" value={b.text} onChange={(text) => set({ text })} area /><TextIn label="Who said it" value={b.by} onChange={(by) => set({ by })} /></div>;
    case "video": return (
      <div className="space-y-3">
        <ImageIn label="Thumbnail image" value={b.img} alt={b.alt} onChange={(img, alt) => set(alt !== undefined ? { img, alt } : { img })} />
        <TextIn label="Video link (YouTube, Vimeo…)" value={b.url} onChange={(url) => set({ url })} ph="https://…" hint="Email apps can't play video, so the picture links to it." />
        <TextIn label="Caption" value={b.label} onChange={(label) => set({ label })} />
      </div>);
    case "social": {
      const so = b.social ?? {};
      const k: [keyof Social, string][] = [["facebook", "Facebook"], ["instagram", "Instagram"], ["linkedin", "LinkedIn"], ["youtube", "YouTube"], ["website", "Website"]];
      return <div className="space-y-3">{k.map(([key, l]) => <TextIn key={key} label={l} value={so[key]} onChange={(val) => set({ social: { ...so, [key]: val } })} ph="Leave empty to hide" />)}</div>;
    }
    case "html": return <TextIn label="HTML" value={b.text} onChange={(text) => set({ text })} area code hint="Paste your own HTML. Scripts, forms and embeds are removed because email apps block them. Use inline styles." />;
    case "spacer": return <Field label={`Space height: ${b.size ?? 24}px`}><input type="range" min={8} max={80} step={4} value={b.size ?? 24} onChange={(e) => set({ size: +e.target.value })} className="w-full accent-[#0b8a8a]" /></Field>;
    default: return <p className="text-sm text-muted">A thin line between sections. Nothing to set.</p>;
  }
}

const snippet = (b: Block) => (b.type === "columns" ? `${b.cols?.length ?? 0} columns${b.layout && b.layout !== "equal" ? " with image" : ""}` : (b.title || b.text || b.label || b.url || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 40);

/* ---------------- Palette icons (simple wireframes) ---------------- */
function Glyph({ k }: { k: string }) {
  const box = "rounded-[3px] bg-current";
  const cols = (n: number) => <div className="flex h-full gap-[3px]">{Array.from({ length: n }, (_, i) => <div key={i} className={`flex-1 ${box} opacity-40`} />)}</div>;
  const map: Record<string, React.ReactNode> = {
    c1: cols(1), c2: cols(2), c3: cols(3), c4: cols(4),
    il: <div className="flex h-full gap-[3px]"><div className={`flex-1 ${box} opacity-70`} /><div className="flex flex-1 flex-col justify-center gap-[3px]"><div className={`h-[3px] ${box} opacity-50`} /><div className={`h-[3px] w-2/3 ${box} opacity-50`} /></div></div>,
    ir: <div className="flex h-full gap-[3px]"><div className="flex flex-1 flex-col justify-center gap-[3px]"><div className={`h-[3px] ${box} opacity-50`} /><div className={`h-[3px] w-2/3 ${box} opacity-50`} /></div><div className={`flex-1 ${box} opacity-70`} /></div>,
  };
  if (map[k]) return <div className="h-7 w-11">{map[k]}</div>;
  const txt: Record<string, string> = { hero: "▣", heading: "H", text: "¶", image: "▨", button: "▭", offer: "★", list: "☰", quote: "❝", video: "▶", social: "@", html: "</>", divider: "—", spacer: "↕" };
  return <div className="grid h-7 w-11 place-items-center text-[17px] font-bold leading-none">{txt[k] ?? "+"}</div>;
}

/* ---------------- Editor ---------------- */
interface Props {
  subject: string; body: string;
  onSubject: (s: string) => void; onBody: (s: string) => void;
  contact?: { name: string; company: string } | null;
  aiContact: { name: string; company: string };
  aiRecent?: string[];
  goals?: string[];
  aiPlaceholder?: string;
}
type Side = "add" | "edit" | "style";

export function EmailEditor({ subject, body, onSubject, onBody, contact, aiContact, aiRecent = [], goals = [], aiPlaceholder = "What's this email about?" }: Props) {
  const { data, settings, userEmail, toast } = useCrm();
  const status = useStatus();
  const design = useMemo(() => parseDesign(body), [body]);
  const [sel, setSel] = useState<string | null>(null);
  const [side, setSide] = useState<Side>("add");
  const [gallery, setGallery] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [goal, setGoal] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [note, setNote] = useState("");
  const [testing, setTesting] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const scrollY = useRef(0);
  const designRef = useRef(design);
  useEffect(() => { designRef.current = design; }, [design]);

  const vars = emailVars(contact ?? SAMPLE, settings);
  const canvasHtml = useMemo(
    () => (design ? renderDesign(design, vars, { business: settings?.business_name, address: settings?.address, unsubscribeUrl: "#", editor: {} }).html : ""),
    [design, settings?.business_name, settings?.address, settings?.booking_link, settings?.review_link, contact?.name, contact?.company], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const selected = design?.blocks.find((b) => b.id === sel) ?? null;

  const setDesign = (d: Design) => onBody(stringifyDesign(d));
  const patch = (id: string, p: Partial<Block>) => design && setDesign({ ...design, blocks: design.blocks.map((b) => (b.id === id ? { ...b, ...p } : b)) });
  const insertAt = (b: Block, at: number) => {
    const d = designRef.current; if (!d) return;
    const bl = [...d.blocks]; bl.splice(Math.max(0, Math.min(at, bl.length)), 0, b);
    setDesign({ ...d, blocks: bl }); setSel(b.id); setSide("edit");
  };
  const moveTo = (id: string, at: number) => {
    const d = designRef.current; if (!d) return;
    const from = d.blocks.findIndex((b) => b.id === id); if (from < 0) return;
    const bl = [...d.blocks]; const [x] = bl.splice(from, 1); bl.splice(at > from ? at - 1 : at, 0, x);
    setDesign({ ...d, blocks: bl }); setSel(id);
  };
  const addFromPalette = (key: string, at?: number) => {
    const p = paletteItem(key); if (!p || !design) return;
    const pos = at ?? (selected ? design.blocks.findIndex((x) => x.id === selected.id) + 1 : design.blocks.length);
    insertAt(p.make(), pos);
  };
  const handleDrop = (data: string, at: number) => {
    if (data.startsWith("add:")) addFromPalette(data.slice(4), at);
    else if (data.startsWith("move:")) moveTo(data.slice(5), at);
  };
  const dropRef = useRef(handleDrop);
  useEffect(() => { dropRef.current = handleDrop; });
  const selectRef = useRef((id: string) => { setSel(id); setSide("edit"); });

  /** Wires the canvas after every re-render: click to select, drag to reorder, drop from the palette. */
  function wire() {
    const f = frame.current, doc = f?.contentDocument, win = f?.contentWindow;
    if (!doc || !win) return;
    win.scrollTo(0, scrollY.current);
    win.addEventListener("scroll", () => { scrollY.current = win.scrollY; });
    const line = doc.createElement("div");
    line.setAttribute("style", "position:absolute;height:4px;border-radius:4px;background:#0b8a8a;box-shadow:0 0 0 3px rgba(11,138,138,.2);pointer-events:none;display:none;z-index:10");
    doc.body.appendChild(line);
    const blocks = () => [...doc.querySelectorAll<HTMLElement>("[data-bid]")];
    const spot = (y: number) => {
      const list = blocks();
      for (let i = 0; i < list.length; i++) { const r = list[i].getBoundingClientRect(); if (y < r.top + r.height / 2) return { i, el: list[i], before: true }; }
      return { i: list.length, el: list[list.length - 1], before: false };
    };
    doc.addEventListener("click", (e) => {
      e.preventDefault();
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-bid]");
      if (el?.dataset.bid) selectRef.current(el.dataset.bid);
    });
    doc.addEventListener("dragstart", (e) => {
      const el = (e.target as HTMLElement).closest?.<HTMLElement>("[data-bid]");
      if (!el?.dataset.bid || !e.dataTransfer) return;
      e.dataTransfer.setData("text/plain", "move:" + el.dataset.bid); e.dataTransfer.effectAllowed = "move";
      el.classList.add("piq-drag");
    });
    doc.addEventListener("dragend", () => { line.style.display = "none"; doc.querySelectorAll(".piq-drag").forEach((x) => x.classList.remove("piq-drag")); });
    doc.addEventListener("dragover", (e) => {
      e.preventDefault();
      const s = spot(e.clientY), wrap = doc.querySelector<HTMLElement>(".piq-wrap");
      const base = s.el ?? wrap; if (!base) return;
      const r = base.getBoundingClientRect(), w = wrap?.getBoundingClientRect() ?? r;
      const y = s.el ? (s.before ? r.top : r.bottom) : r.top + 60;
      Object.assign(line.style, { display: "block", left: `${w.left + 8}px`, width: `${w.width - 16}px`, top: `${y + win.scrollY - 2}px` });
    });
    doc.addEventListener("dragleave", (e) => { if (!e.relatedTarget) line.style.display = "none"; });
    doc.addEventListener("drop", (e) => {
      e.preventDefault(); line.style.display = "none";
      const d = e.dataTransfer?.getData("text/plain") ?? "";
      dropRef.current(d, spot(e.clientY).i);
    });
    highlight();
  }
  function highlight() {
    const doc = frame.current?.contentDocument; if (!doc) return;
    doc.querySelectorAll(".piq-sel").forEach((x) => x.classList.remove("piq-sel"));
    if (sel) doc.querySelector(`[data-bid="${sel}"]`)?.classList.add("piq-sel");
  }
  useEffect(highlight);

  function toDesign() {
    const first = newBlock("text"); if (body.trim() && !isDesign(body)) first.text = body;
    setDesign(blankDesign([first])); setSel(null); setSide("add");
  }
  function toText() {
    if (!design) return;
    onBody(renderDesign(design, TAGS_AS_TEXT, { assetBase: "https://x" }).text.replace(/\n--\n[\s\S]*$/, "").trim()); setSel(null);
  }
  function pickPreset(p: Preset) { if (p.subject) onSubject(p.subject); setDesign(clone(p.design)); setSel(null); setSide("add"); setGallery(false); scrollY.current = 0; }
  function pickSaved(id: string) { const t = data.templates.find((x) => x.id === id); if (!t) return; onSubject(t.subject); onBody(t.body); setSel(null); }

  async function draft() {
    setNote(""); setAiNote("");
    if (!goal.trim()) return setNote("Tell the AI what this email is about first (or tap one of the ideas).");
    setAiBusy(true);
    try {
      const target = design ? (selected?.type === "text" ? selected : design.blocks.find((b) => b.type === "text")) : null;
      const cur = design ? target?.text ?? "" : body;
      const r = await aiDraftEmail({ goal, contact: aiContact, business: settings?.business_name ?? "", sender: settings?.sender_name ?? "", recent: aiRecent, previous: cur ? { subject, body: cur } : undefined });
      onSubject(r.result.subject);
      if (design) setDesign(target ? { ...design, blocks: design.blocks.map((b) => (b.id === target.id ? { ...b, text: r.result.body } : b)) } : { ...design, blocks: [...design.blocks, { ...newBlock("text"), text: r.result.body }] });
      else onBody(r.result.body);
      if (!r.live) setAiNote("This is a sample draft. Add an Anthropic API key to get personalised drafts.");
    } catch (e) { setNote((e as Error).message); }
    setAiBusy(false);
  }

  async function sendTest() {
    setNote("");
    if (!subject.trim() || (!design && !body.trim()) || (design && design.blocks.length === 0)) return setNote("Add a subject and some content first.");
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

  if (gallery) return <Gallery onPick={pickPreset} onClose={() => setGallery(false)} />;

  const sideTab = (id: Side, l: string) => <button type="button" role="tab" aria-selected={side === id} onClick={() => setSide(id)} className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold ${side === id ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{l}</button>;

  return (
    <div className="space-y-4">
      {/* Top bar: style, designs, AI */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-cloud p-1" role="tablist" aria-label="Email style">
          <button type="button" role="tab" aria-selected={!design} onClick={() => design && toText()} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${!design ? "bg-white text-ink shadow-sm" : "text-muted"}`}>Simple text</button>
          <button type="button" role="tab" aria-selected={!!design} onClick={() => !design && toDesign()} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${design ? "bg-white text-ink shadow-sm" : "text-muted"}`}>Designed email</button>
        </div>
        <Button type="button" size="sm" variant="soft" onClick={() => setGallery(true)}>Browse designs</Button>
        <Button type="button" size="sm" variant="soft" onClick={() => { setDesign(scratchDesign()); setSel(null); setSide("add"); }}>Blank email</Button>
        {data.templates.length > 0 && (
          <select aria-label="Saved templates" className="field !h-9 !w-auto !py-0 text-sm" value="" onChange={(e) => pickSaved(e.target.value)}>
            <option value="" disabled>Saved templates…</option>{data.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <Button type="button" size="sm" variant="soft" icon="sparkle" onClick={() => setAiOpen(!aiOpen)} aria-expanded={aiOpen}>Write with AI</Button>
      </div>
      {aiOpen && (
        <div className="rounded-2xl border border-line bg-gradient-to-br from-white to-iris-t/40 p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className="field" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={aiPlaceholder} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), draft())} />
            <AiButton onClick={draft} busy={aiBusy}>{(design ? design.blocks.some((b) => b.type === "text") : body) ? "Rewrite" : "Write draft"}</AiButton>
          </div>
          {goals.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{goals.map((g) => <button key={g} type="button" onClick={() => setGoal(g)} className="rounded-full border border-line bg-white px-3 py-1 text-[13px] font-medium text-body hover:bg-cloud">{g}</button>)}</div>}
          <p className="mt-2 text-[13px] text-muted">{design ? "Writes the subject and the selected text block (or the first one)." : "Writes the subject and message."}</p>
          {aiNote && <p className="mt-1 text-[13px] text-muted">{aiNote}</p>}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Subject"><input data-merge className="field" value={subject} onChange={(e) => onSubject(e.target.value)} placeholder="What will they see in their inbox?" /></Field>
        {design && <Field label="Preview line"><input data-merge className="field" value={design.preheader} onChange={(e) => setDesign({ ...design, preheader: e.target.value })} placeholder="Grey text shown after the subject" /></Field>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" onMouseDown={(e) => e.preventDefault()}>
        <span className="text-[13px] font-medium text-muted">Insert field:</span>
        {MERGE_FIELDS.map((f) => (
          <button key={f.tag} type="button" onClick={() => setNote(insertTag(f.tag) ? "" : "Click inside the subject or a text box first, then pick a field.")}
            className="rounded-full border border-line bg-white px-2.5 py-1 text-[12.5px] font-medium text-body hover:bg-cloud">{f.label}</button>
        ))}
      </div>
      {note && <p role="alert" className="text-sm font-medium text-rose">{note}</p>}

      {!design ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Field label="Message" hint={settings?.signature?.trim() ? "Your signature is added automatically." : "Tip: add a signature in Settings."}>
            <textarea data-merge className="field !min-h-[320px]" value={body} onChange={(e) => onBody(e.target.value)} />
          </Field>
          <div>
            <div className="mb-1.5 flex items-center justify-between"><span className="text-sm font-semibold text-ink">Preview</span><Button type="button" size="sm" variant="soft" icon="send" onClick={sendTest} disabled={testing}>{testing ? "Sending…" : "Send me a test"}</Button></div>
            <div className="h-[320px] overflow-y-auto rounded-2xl border border-line bg-white p-5 text-[15px] leading-relaxed text-[#222]">
              <div className="mb-3 border-b border-line pb-3 text-sm"><span className="text-muted">Subject:</span> <strong className="text-ink">{fill(subject, contact ?? SAMPLE) || "…"}</strong></div>
              <p className="whitespace-pre-wrap">{fill(body, contact ?? SAMPLE) || <span className="text-muted">Your message will appear here.</span>}</p>
              {settings?.signature?.trim() && <p className="mt-4 whitespace-pre-wrap">{settings.signature}</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Sidebar */}
          <aside className="min-w-0 rounded-2xl border border-line bg-white p-3 lg:max-h-[680px] lg:overflow-y-auto">
            <div className="mb-3 flex rounded-full bg-cloud p-1" role="tablist" aria-label="Editor panel">{sideTab("add", "Add")}{sideTab("edit", "Edit")}{sideTab("style", "Style")}</div>

            {side === "add" && (["Layout", "Content"] as const).map((g) => (
              <div key={g} className="mb-4">
                <div className="mb-2 px-1 text-[13px] font-semibold text-muted">{g === "Layout" ? "Layouts" : "Content blocks"}</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {PALETTE.filter((p) => p.group === g).map((p) => (
                    <button key={p.key} type="button" draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", "add:" + p.key); e.dataTransfer.effectAllowed = "copy"; }}
                      onClick={() => addFromPalette(p.key)} title={`Drag onto the email, or click to add`}
                      className="flex cursor-grab flex-col items-center gap-1.5 rounded-xl border border-line bg-white px-1 py-2.5 text-teal-d transition hover:border-teal hover:bg-teal-t/40 active:cursor-grabbing">
                      <Glyph k={p.key} /><span className="text-center text-[11.5px] font-semibold leading-tight text-ink">{p.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {side === "add" && <p className="px-1 text-[12.5px] text-muted">Drag a block onto the email where you want it, or click to add it {selected ? "after the selected block" : "at the end"}.</p>}

            {side === "edit" && (selected ? (
              <div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="font-semibold text-ink">{BLOCK_LABELS[selected.type]}</div>
                  <div className="flex items-center">
                    {(() => { const i = design.blocks.findIndex((x) => x.id === selected.id); return (<>
                      <button type="button" onClick={() => moveTo(selected.id, i - 1)} disabled={i === 0} aria-label="Move up" className="grid size-8 place-items-center rounded-full text-muted hover:bg-cloud disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => moveTo(selected.id, i + 2)} disabled={i === design.blocks.length - 1} aria-label="Move down" className="grid size-8 place-items-center rounded-full text-muted hover:bg-cloud disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => insertAt({ ...selected, id: bid(), cols: selected.cols?.map((c) => ({ ...c })) }, i + 1)} aria-label="Duplicate" title="Duplicate" className="grid size-8 place-items-center rounded-full text-[12px] font-bold text-muted hover:bg-cloud">2×</button>
                      <button type="button" onClick={() => { setDesign({ ...design, blocks: design.blocks.filter((x) => x.id !== selected.id) }); setSel(null); }} aria-label="Delete block" title="Delete" className="grid size-8 place-items-center rounded-full text-muted hover:bg-rose-t hover:text-rose">×</button>
                    </>); })()}
                  </div>
                </div>
                <BlockForm key={selected.id} b={selected} set={(p) => patch(selected.id, p)} />
                <button type="button" onClick={() => setSel(null)} className="mt-4 text-[13px] font-semibold text-teal-d hover:underline">Done</button>
              </div>
            ) : (
              <div>
                <p className="mb-3 px-1 text-sm text-muted">Click any block in the email to edit it, or drag these to reorder.</p>
                <ul className="space-y-1">
                  {design.blocks.map((b, i) => (
                    <li key={b.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", "move:" + b.id)} onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); handleDrop(e.dataTransfer.getData("text/plain"), e.clientY < r.top + r.height / 2 ? i : i + 1); }}>
                      <button type="button" onClick={() => setSel(b.id)} className="flex w-full cursor-grab items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-2 text-left hover:border-teal">
                        <span className="text-muted" aria-hidden>⋮⋮</span><span className="whitespace-nowrap text-[13px] font-semibold text-ink">{BLOCK_LABELS[b.type]}</span><span className="truncate text-[12.5px] text-muted">{snippet(b)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {side === "style" && (
              <div className="space-y-4">
                <div>
                  <span className="mb-1.5 block text-sm font-semibold text-ink">Header and footer</span>
                  <div className="inline-flex rounded-full bg-cloud p-1" role="group" aria-label="Header and footer">
                    {([["standard", "Show"], ["blank", "Hide"]] as const).map(([k, l]) => (
                      <button key={k} type="button" aria-pressed={(design.chrome ?? "standard") === k} onClick={() => setDesign({ ...design, chrome: k === "blank" ? "blank" : undefined })}
                        className={`rounded-full px-4 py-1.5 text-[13px] font-semibold ${(design.chrome ?? "standard") === k ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{l}</button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-muted">Hide it when your design has its own header and footer. Marketing sends still add a small unsubscribe link, which the law requires.</p>
                </div>
                <ColorIn label="Brand colour" value={design.brand} onChange={(v) => setDesign({ ...design, brand: v ?? "#0b8a8a" })} />
                <ColorIn label="Page background" value={design.bg} onChange={(v) => setDesign({ ...design, bg: v ?? "#f4f6fb" })} />
                <ImageIn label="Logo (optional)" value={design.logo} onChange={(logo) => setDesign({ ...design, logo })} />
                <p className="-mt-2 text-[12.5px] text-muted">Without a logo, your business name is shown at the top.</p>
                <TextIn label="Footer note (optional)" value={design.footer} onChange={(footer) => setDesign({ ...design, footer })} ph="e.g. Licensed and insured" />
              </div>
            )}
          </aside>

          {/* Canvas */}
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-ink">Email{contact ? ` for ${contact.name}` : " (sample contact)"}</div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-full bg-cloud p-1" role="group" aria-label="Preview size">
                  {(["desktop", "mobile"] as const).map((d) => <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} className={`rounded-full px-3 py-1 text-[13px] font-semibold capitalize ${device === d ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{d}</button>)}
                </div>
                <Button type="button" size="sm" variant="soft" icon="send" onClick={sendTest} disabled={testing}>{testing ? "Sending…" : "Send me a test"}</Button>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-line" style={{ background: design.bg }}>
              <iframe ref={frame} title="Email canvas" sandbox="allow-same-origin" srcDoc={canvasHtml} onLoad={wire}
                className={`mx-auto block h-[640px] border-0 transition-[width] ${device === "mobile" ? "w-[375px] max-w-full" : "w-full"}`} />
            </div>
            <p className="mt-2 text-[12.5px] text-muted">Click a block to edit it. Drag blocks to move them. Campaign emails get your address and an unsubscribe link automatically.</p>
          </div>
        </div>
      )}
    </div>
  );
}
