// Designed emails: a list of blocks that renders to email-safe HTML (tables, inline styles, fluid columns
// that stack on phones). Pure functions only, so the same code runs in the browser (editor canvas and preview)
// and on the server (sending).

export type BlockType =
  | "hero" | "heading" | "text" | "image" | "button" | "columns" | "offer" | "list" | "quote"
  | "video" | "social" | "html" | "divider" | "spacer";
export type ColLayout = "equal" | "image-left" | "image-right";
export interface Cell { img?: string; alt?: string; title?: string; text?: string; label?: string; url?: string }
export interface Social { facebook?: string; instagram?: string; linkedin?: string; youtube?: string; website?: string }
export interface Block {
  id: string;
  type: BlockType;
  text?: string;   // heading / text / offer / quote / list (one per line) / html source / hero sub-text
  title?: string;  // offer and hero headline
  url?: string;    // image source, button / video / hero link
  img?: string;    // hero image, video thumbnail
  link?: string;   // where a clicked image goes
  alt?: string;
  label?: string;  // button label
  by?: string;     // quote author
  align?: "left" | "center";
  size?: number;   // spacer height
  bg?: string;     // section background (hex)
  cols?: Cell[];   // columns block
  layout?: ColLayout;
  social?: Social;
}
/** "blank" leaves out the brand bar, header and footer so the email can be built from scratch. */
export type Chrome = "standard" | "blank";
export interface Design { v: 1; brand: string; preheader: string; logo: string; footer: string; bg: string; blocks: Block[]; chrome?: Chrome }

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "Hero banner", heading: "Heading", text: "Text", image: "Image", button: "Button", columns: "Columns",
  offer: "Highlight box", list: "Bullet list", quote: "Quote", video: "Video", social: "Social links",
  html: "Custom HTML", divider: "Divider", spacer: "Space",
};

/** What the palette offers. A palette item is a block type plus a starting shape. */
export interface PaletteItem { key: string; label: string; group: "Layout" | "Content"; make: () => Block }

export const MERGE_FIELDS: { tag: string; label: string }[] = [
  { tag: "first_name", label: "First name" }, { tag: "company", label: "Company" }, { tag: "business", label: "Your business" },
  { tag: "booking_link", label: "Booking link" }, { tag: "review_link", label: "Review link" },
];

/** Built-in pictures, served from /email on the CRM's own domain. */
export const LIBRARY: { src: string; alt: string }[] = [
  ["hs-kitchen-navy", "Navy kitchen renovation"], ["hs-kitchen2", "Bright modern kitchen"], ["hs-bath1", "Renovated bathroom"],
  ["hs-living1", "Finished living room"], ["hs-living2", "Open-plan living space"], ["rs-living3", "Living room with large windows"],
  ["hs-entry", "Front entrance"], ["hs-roof", "Roof replacement"], ["hs-tiles", "Tile samples"], ["hs-wall", "Feature wall"],
  ["hs-plan", "Floor plan on a table"], ["fit-lady", "Woman training in a gym"], ["fit-dumb", "Dumbbells on a rack"],
  ["fit-back", "Strength training"], ["fit-stretch", "Stretching class"],
].map(([n, a]) => ({ src: `/email/${n}.jpg`, alt: a }));

const PREFIX = "PIQDESIGN:";
let n = 0;
export const bid = () => `b${Date.now().toString(36)}${(n++).toString(36)}`;

const cell = (p: Cell = {}): Cell => ({ img: "", alt: "", title: "Title", text: "A short line about this.", label: "", url: "", ...p });
export function newBlock(type: BlockType, opts: { count?: number; layout?: ColLayout } = {}): Block {
  const b: Block = { id: bid(), type };
  if (type === "hero") Object.assign(b, { img: "/email/hs-kitchen-navy.jpg", alt: "", title: "Your big headline", text: "One line that makes them want to read on.", label: "Book a free visit", url: "{{booking_link}}" });
  if (type === "heading") b.text = "Your headline";
  if (type === "text") b.text = "Hi {{first_name}},\n\nWrite your message here.";
  if (type === "image") Object.assign(b, { url: "/email/hs-living1.jpg", alt: "", link: "" });
  if (type === "button") Object.assign(b, { label: "Book a visit", url: "{{booking_link}}", align: "center" });
  if (type === "offer") Object.assign(b, { title: "Your offer", text: "Say what they get and when it ends." });
  if (type === "list") b.text = "First benefit\nSecond benefit\nThird benefit";
  if (type === "quote") Object.assign(b, { text: "They were on time, tidy and the result looks fantastic.", by: "Happy customer" });
  if (type === "video") Object.assign(b, { img: "/email/hs-living2.jpg", url: "https://", label: "Watch the 60-second tour", alt: "" });
  if (type === "social") b.social = { facebook: "https://facebook.com/", instagram: "https://instagram.com/", website: "" };
  if (type === "html") b.text = '<p style="margin:0;font-family:Arial,sans-serif;font-size:16px;color:#33405a">Your own HTML goes here.</p>';
  if (type === "spacer") b.size = 24;
  if (type === "columns") {
    const layout = opts.layout ?? "equal";
    b.layout = layout;
    if (layout === "equal") {
      const k = Math.min(4, Math.max(2, opts.count ?? 2));
      const pics = ["/email/hs-kitchen2.jpg", "/email/hs-bath1.jpg", "/email/hs-living1.jpg", "/email/hs-entry.jpg"];
      b.cols = Array.from({ length: k }, (_, i) => cell({ img: pics[i], title: `Service ${i + 1}` }));
    } else {
      b.cols = [cell({ img: "/email/hs-living2.jpg", title: "", text: "" }), cell({ title: "Project spotlight", text: "Tell the story of a recent job and how it turned out.", label: "See the project", url: "https://" })];
    }
  }
  return b;
}

export const PALETTE: PaletteItem[] = [
  { key: "c1", label: "1 column", group: "Layout", make: () => newBlock("text") },
  { key: "c2", label: "2 columns", group: "Layout", make: () => newBlock("columns", { count: 2 }) },
  { key: "c3", label: "3 columns", group: "Layout", make: () => newBlock("columns", { count: 3 }) },
  { key: "c4", label: "4 columns", group: "Layout", make: () => newBlock("columns", { count: 4 }) },
  { key: "il", label: "Image + text", group: "Layout", make: () => newBlock("columns", { layout: "image-left" }) },
  { key: "ir", label: "Text + image", group: "Layout", make: () => newBlock("columns", { layout: "image-right" }) },
  ...(["hero", "heading", "text", "image", "button", "offer", "list", "quote", "video", "social", "html", "divider", "spacer"] as BlockType[])
    .map((t): PaletteItem => ({ key: t, label: BLOCK_LABELS[t], group: "Content", make: () => newBlock(t) })),
];
export const paletteItem = (key: string) => PALETTE.find((p) => p.key === key);

export const blankDesign = (blocks: Block[] = []): Design => ({ v: 1, brand: "#0b8a8a", preheader: "", logo: "", footer: "", bg: "#f4f6fb", blocks });
/** A completely empty email: no header, no footer, white page. */
export const scratchDesign = (): Design => ({ ...blankDesign([]), bg: "#ffffff", chrome: "blank" });

export const isDesign = (body: string) => body.startsWith(PREFIX);
export const stringifyDesign = (d: Design) => PREFIX + JSON.stringify(d);
export function parseDesign(body: string): Design | null {
  if (!isDesign(body)) return null;
  try { return sanitizeDesign(JSON.parse(body.slice(PREFIX.length))); } catch { return null; }
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
/** Accepts untrusted JSON (the send route) and returns a safe Design, or null. */
export function sanitizeDesign(raw: unknown): Design | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.blocks) || r.blocks.length > 80) return null;
  const types = Object.keys(BLOCK_LABELS);
  const blocks: Block[] = [];
  for (const x of r.blocks) {
    if (!x || typeof x !== "object") return null;
    const b = x as Record<string, unknown>;
    if (typeof b.type !== "string" || !types.includes(b.type)) return null;
    const out: Block = {
      id: s(b.id, 40) || bid(), type: b.type as BlockType, text: s(b.text, b.type === "html" ? 40_000 : 10_000), title: s(b.title, 300),
      url: s(b.url, 2000), img: s(b.img, 2000), link: s(b.link, 2000), alt: s(b.alt, 300), label: s(b.label, 100), by: s(b.by, 200),
      align: b.align === "center" ? "center" : "left", bg: hex(b.bg),
      size: typeof b.size === "number" ? Math.min(80, Math.max(8, Math.round(b.size))) : undefined,
    };
    if (b.type === "columns") {
      if (!Array.isArray(b.cols) || b.cols.length < 1 || b.cols.length > 4) return null;
      out.layout = b.layout === "image-left" || b.layout === "image-right" ? b.layout : "equal";
      out.cols = (b.cols as Record<string, unknown>[]).map((c) => ({
        img: s(c?.img, 2000), alt: s(c?.alt, 300), title: s(c?.title, 300), text: s(c?.text, 5000), label: s(c?.label, 100), url: s(c?.url, 2000),
      }));
    }
    if (b.type === "social" && b.social && typeof b.social === "object") {
      const so = b.social as Record<string, unknown>;
      out.social = { facebook: s(so.facebook, 500), instagram: s(so.instagram, 500), linkedin: s(so.linkedin, 500), youtube: s(so.youtube, 500), website: s(so.website, 500) };
    }
    blocks.push(out);
  }
  return {
    v: 1, brand: hex(r.brand) ?? "#0b8a8a", bg: hex(r.bg) ?? "#f4f6fb",
    preheader: s(r.preheader, 200) ?? "", logo: s(r.logo, 2000) ?? "", footer: s(r.footer, 500) ?? "", blocks,
    ...(r.chrome === "blank" ? { chrome: "blank" as const } : {}),
  };
}

export const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Custom HTML stays the sender's own markup, minus anything that runs code. */
export const cleanHtml = (h: string) => h
  .replace(/<\s*(script|iframe|object|embed|form|input|button|meta|link|base)\b[\s\S]*?(<\s*\/\s*\1\s*>|\/?>)/gi, "")
  .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '$1="#"');

/** A pasted full HTML document keeps its <style> rules and body; <html>/<head>/<body> wrappers are dropped. */
export function bodyOf(h: string): string {
  if (!/<body[\s>]/i.test(h)) return h;
  const styles = (h.match(/<style[\s\S]*?<\/style>/gi) ?? []).join("");
  const inner = h.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  return styles + inner.replace(/<style[\s\S]*?<\/style>/gi, "") ;
}

export type Vars = Record<string, string>;
const sub = (t: string, v: Vars) => t.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, k: string) => v[k.toLowerCase()] ?? "");

/** Variables for one recipient. */
export function emailVars(c: { name: string; company: string } | null, st: { business_name?: string; booking_link?: string; review_link?: string } | null | undefined): Vars {
  const first = (c?.name ?? "").trim().split(/\s+/)[0] || "there";
  return {
    first_name: first, first, name: c?.name || "there", company: c?.company || "your company",
    business: st?.business_name || "our team", booking_link: st?.booking_link || "", review_link: st?.review_link || "",
  };
}

const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const W = 600, PAD = 32, INNER = W - PAD * 2; // 536

export interface RenderOpts {
  business?: string; address?: string; unsubscribeUrl?: string;
  /** Prefix for built-in /email/… pictures. Required when sending; the preview can use relative paths. */
  assetBase?: string;
  /** Editor canvas: tags every block so it can be clicked, hovered and dragged. */
  editor?: { selected?: string | null };
}
export interface Rendered { html: string; text: string }

export function renderDesign(d: Design, v: Vars, o: RenderOpts = {}): Rendered {
  const brand = d.brand, rows: string[] = [], plain: string[] = [];
  const blank = d.chrome === "blank";
  const url = (raw: string, allowMail = false) => {
    let u = sub(raw ?? "", v).trim();
    if (/^\/(?!\/)/.test(u)) u = (o.assetBase ?? "") + u;
    if (/^https?:\/\//i.test(u) || (allowMail && /^(mailto:|tel:)/i.test(u)) || (!o.assetBase && /^\/(?!\/)/.test(u))) return u.replace(/^http:\/\/(?!localhost)/i, "https://");
    return "";
  };
  const para = (t: string) => esc(sub(t, v)).replace(/(https:\/\/[^\s<]+)/g, (m) => `<a href="${m}" style="color:inherit;text-decoration:underline">${m}</a>`).replace(/\n/g, "<br>");
  const btn = (label: string, href: string, al: string, small = false) => {
    const u = url(href, true), l = sub(label ?? "", v).trim(); if (!u || !l) return "";
    plain.push(`${l}: ${u}`);
    return `<table role="presentation" cellpadding="0" cellspacing="0" align="${al}" style="margin:0 ${al === "center" ? "auto" : "0"}"><tr><td style="background:${brand};border-radius:999px"><a href="${esc(u)}" style="display:inline-block;padding:${small ? "10px 20px" : "14px 28px"};font:700 ${small ? 14 : 16}px ${FONT};color:#ffffff;text-decoration:none">${esc(l)}</a></td></tr></table>`;
  };
  const img = (src: string, alt: string, width: number, radius = 10, link = "") => {
    const u = url(src); if (!u) return "";
    const tag = `<img src="${esc(u)}" alt="${esc(sub(alt ?? "", v))}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:${radius}px">`;
    const l = link ? url(link) : "";
    return l ? `<a href="${esc(l)}" style="display:block">${tag}</a>` : tag;
  };

  for (const b of d.blocks) {
    const al = b.align === "center" ? "center" : "left";
    const start = rows.length;
    const row = (inner: string, pad = `0 ${PAD}px 20px`) => rows.push(`<tr><td style="padding:${pad}${b.bg ? `;background:${b.bg}` : ""}">${inner}</td></tr>`);
    switch (b.type) {
      case "hero": {
        const t = sub(b.title ?? "", v), x = sub(b.text ?? "", v);
        const pic = img(b.img ?? "", b.alt ?? "", W, 0);
        if (pic) rows.push(`<tr><td style="padding:0 0 0">${pic}</td></tr>`);
        const inner = `${t ? `<h1 style="margin:0;font:800 30px/1.2 ${FONT};color:#ffffff">${esc(t)}</h1>` : ""}${x ? `<div style="margin-top:10px;font:17px/1.55 ${FONT};color:#ffffffd9">${para(b.text ?? "")}</div>` : ""}`;
        const button = b.label ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr><td style="background:#ffffff;border-radius:999px"><a href="${esc(url(b.url ?? "", true) || "#")}" style="display:inline-block;padding:13px 26px;font:700 16px ${FONT};color:${brand};text-decoration:none">${esc(sub(b.label, v))}</a></td></tr></table>` : "";
        if (inner || button) rows.push(`<tr><td style="padding:30px ${PAD}px;background:${b.bg ?? brand}">${inner}${button}</td></tr>`);
        rows.push(`<tr><td style="height:24px;line-height:24px;font-size:0">&nbsp;</td></tr>`);
        plain.push([t.toUpperCase(), x].filter(Boolean).join("\n"));
        if (b.label && url(b.url ?? "", true)) plain.push(`${sub(b.label, v)}: ${url(b.url ?? "", true)}`);
        break;
      }
      case "heading": {
        const t = sub(b.text ?? "", v); if (!t.trim()) break;
        row(`<h2 style="margin:0;font:700 25px/1.25 ${FONT};color:#111a2e;text-align:${al}">${esc(t)}</h2>`); plain.push(t.toUpperCase()); break;
      }
      case "text": {
        const t = sub(b.text ?? "", v); if (!t.trim()) break;
        row(`<div style="font:16px/1.65 ${FONT};color:#33405a;text-align:${al}">${para(b.text ?? "")}</div>`); plain.push(t); break;
      }
      case "image": { const p = img(b.url ?? "", b.alt ?? "", INNER, 10, b.link ?? ""); if (p) row(p); break; }
      case "button": { const h = btn(b.label ?? "", b.url ?? "", al); if (h) row(h); break; }
      case "columns": {
        const cols = b.cols ?? []; if (!cols.length) break;
        const k = cols.length, gap = 16;
        const widths = b.layout && b.layout !== "equal" ? [Math.floor((INNER + gap) / 2), Math.floor((INNER + gap) / 2)] : Array(k).fill(Math.floor((INNER + gap) / k));
        const cls = k === 4 ? "piq-c4" : "piq-col";
        const cells = cols.map((c, i) => {
          const w = widths[i] ?? widths[0];
          const pic = img(c.img ?? "", c.alt ?? "", w - gap, 8);
          const t = sub(c.title ?? "", v), x = sub(c.text ?? "", v);
          if (t || x) plain.push([t, x].filter(Boolean).join("\n"));
          const body = `${pic}${t ? `<div style="margin-top:${pic ? 12 : 0}px;font:700 ${k >= 3 ? 16 : 18}px/1.3 ${FONT};color:#111a2e">${esc(t)}</div>` : ""}${x ? `<div style="margin-top:6px;font:${k >= 3 ? 14 : 15}px/1.55 ${FONT};color:#33405a">${para(c.text ?? "")}</div>` : ""}${c.label ? `<div style="margin-top:12px">${btn(c.label, c.url ?? "", "left", true)}</div>` : ""}`;
          return `<div class="${cls}" style="display:inline-block;width:100%;max-width:${w}px;vertical-align:${b.layout && b.layout !== "equal" ? "middle" : "top"};font-size:16px;text-align:left"><div style="padding:0 ${gap / 2}px 14px">${body}</div></div>`;
        });
        const ordered = b.layout === "image-right" ? [...cells].reverse() : cells;
        rows.push(`<tr><td style="padding:0 ${PAD - gap / 2}px 6px;font-size:0;text-align:left${b.bg ? `;background:${b.bg}` : ""}">${ordered.join("")}</td></tr>`);
        break;
      }
      case "offer": {
        const t = sub(b.title ?? "", v), x = sub(b.text ?? "", v); if (!t.trim() && !x.trim()) break;
        row(`<div style="background:${brand}14;border-left:4px solid ${brand};border-radius:10px;padding:18px 20px"><div style="font:700 19px/1.3 ${FONT};color:#111a2e">${esc(t)}</div><div style="margin-top:6px;font:15px/1.6 ${FONT};color:#33405a">${para(b.text ?? "")}</div></div>`);
        plain.push(`${t}\n${x}`); break;
      }
      case "list": {
        const items = sub(b.text ?? "", v).split("\n").map((i) => i.trim()).filter(Boolean); if (!items.length) break;
        row(`<table role="presentation" cellpadding="0" cellspacing="0">${items.map((i) => `<tr><td style="vertical-align:top;padding:0 10px 8px 0;font:700 16px ${FONT};color:${brand}">&#10003;</td><td style="padding:0 0 8px;font:16px/1.5 ${FONT};color:#33405a">${esc(i)}</td></tr>`).join("")}</table>`);
        plain.push(items.map((i) => `- ${i}`).join("\n")); break;
      }
      case "quote": {
        const t = sub(b.text ?? "", v); if (!t.trim()) break;
        row(`<div style="border-left:3px solid ${brand};padding:4px 0 4px 16px"><div style="font:italic 17px/1.55 ${FONT};color:#111a2e">&ldquo;${esc(t)}&rdquo;</div>${b.by ? `<div style="margin-top:6px;font:600 14px ${FONT};color:#5d6782">${esc(sub(b.by, v))}</div>` : ""}</div>`);
        plain.push(`"${t}"${b.by ? ` - ${sub(b.by, v)}` : ""}`); break;
      }
      case "video": {
        const link = url(b.url ?? ""), pic = img(b.img ?? "", b.alt || "Play video", INNER, 10);
        if (!pic && !link) break;
        const cap = sub(b.label ?? "", v);
        row(`${link ? `<a href="${esc(link)}" style="display:block;text-decoration:none">` : ""}${pic}<div style="margin-top:10px;font:700 15px ${FONT};color:${brand}">&#9654;&nbsp; ${esc(cap || "Watch the video")}</div>${link ? "</a>" : ""}`);
        if (link) plain.push(`${cap || "Watch the video"}: ${link}`); break;
      }
      case "social": {
        const names: [keyof Social, string][] = [["facebook", "Facebook"], ["instagram", "Instagram"], ["linkedin", "LinkedIn"], ["youtube", "YouTube"], ["website", "Website"]];
        const links = names.map(([k, l]) => [l, url(b.social?.[k] ?? "")] as const).filter(([, u]) => u && !/^https?:\/\/$/.test(u));
        if (!links.length) break;
        row(`<div style="text-align:center">${links.map(([l, u]) => `<a href="${esc(u)}" style="display:inline-block;margin:0 4px 8px;padding:8px 14px;border:1px solid #e4e8f0;border-radius:999px;font:600 13px ${FONT};color:#33405a;text-decoration:none">${l}</a>`).join("")}</div>`);
        plain.push(links.map(([l, u]) => `${l}: ${u}`).join("\n")); break;
      }
      case "html": {
        const h = cleanHtml(bodyOf(sub(b.text ?? "", v)));
        if (h.trim()) { row(h, blank ? "0" : undefined); plain.push(h.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()); }
        break;
      }
      case "divider": row(`<div style="border-top:1px solid #e4e8f0;line-height:0;font-size:0">&nbsp;</div>`, `4px ${PAD}px 20px`); break;
      case "spacer": rows.push(`<tr><td style="height:${b.size ?? 24}px;line-height:${b.size ?? 24}px;font-size:0">&nbsp;</td></tr>`); break;
    }
    if (o.editor) {
      const mine = rows.splice(start);
      const sel = o.editor.selected === b.id ? " piq-sel" : "";
      const inner = mine.length ? mine.join("") : `<tr><td style="padding:14px ${PAD}px;font:13px ${FONT};color:#9aa5bd;text-align:center">${esc(BLOCK_LABELS[b.type])} (empty, click to edit)</td></tr>`;
      rows.push(`<tr><td class="piq-blk${sel}" data-bid="${esc(b.id)}" data-label="${esc(BLOCK_LABELS[b.type])}" draggable="true"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${inner}</table></td></tr>`);
    }
  }

  const biz = o.business?.trim() || "";
  const logoUrl = url(d.logo);
  const head = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(biz)}" height="36" style="display:block;height:36px;width:auto;border:0">`
    : biz ? `<div style="font:700 18px ${FONT};color:${brand}">${esc(biz)}</div>` : "";
  const footBits = [d.footer && esc(sub(d.footer, v)), biz && o.address ? `${esc(biz)} &middot; ${esc(o.address)}` : biz && esc(biz)].filter(Boolean);
  const unsub = o.unsubscribeUrl ? `<br><a href="${esc(o.unsubscribeUrl)}" style="color:#6b7690">Unsubscribe</a>` : "";
  const pre = d.preheader.trim() ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(sub(d.preheader, v))}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : "";
  const editorCss = o.editor ? `.piq-blk{position:relative;cursor:pointer;outline:2px solid transparent;outline-offset:-2px;transition:outline-color .1s}.piq-blk:hover{outline-color:#9fd8d3}.piq-sel,.piq-sel:hover{outline-color:#0b8a8a}.piq-blk.piq-drag{opacity:.4}body{padding-bottom:120px}` : "";
  const bg = d.bg || "#f4f6fb";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">` +
    `<style>body{margin:0}img{-ms-interpolation-mode:bicubic}@media (max-width:620px){.piq-col{max-width:100%!important;display:block!important}.piq-c4{max-width:50%!important}.piq-wrap{border-radius:0!important}}${editorCss}</style></head>` +
    `<body style="margin:0;padding:0;background:${bg}">${pre}` +
    (blank
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg}"><tr><td align="center" style="padding:0">` +
        `<table role="presentation" class="piq-wrap" width="100%" cellpadding="0" cellspacing="0" style="width:100%">` +
        (rows.length ? rows.join("") : o.editor ? `<tr><td style="padding:60px 20px;font:14px ${FONT};color:#9aa5bd;text-align:center">Blank email. Add blocks from the left, or a Custom HTML block to paste your own design.</td></tr>` : "") +
        `</table>` +
        (unsub ? `<div style="padding:12px 20px;font:12px/1.6 ${FONT};color:#6b7690;text-align:center">${unsub.replace(/^<br>/, "")}</div>` : "") +
        `</td></tr></table>`
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg}"><tr><td align="center" style="padding:24px 12px">` +
        `<table role="presentation" class="piq-wrap" width="${W}" cellpadding="0" cellspacing="0" style="width:100%;max-width:${W}px;background:#ffffff;border-radius:14px;overflow:hidden">` +
        `<tr><td style="height:6px;background:${brand};line-height:6px;font-size:0">&nbsp;</td></tr>` +
        (head ? `<tr><td style="padding:22px ${PAD}px 20px">${head}</td></tr>` : `<tr><td style="height:18px;line-height:18px;font-size:0">&nbsp;</td></tr>`) +
        rows.join("") + `<tr><td style="height:12px;line-height:12px;font-size:0">&nbsp;</td></tr></table>` +
        `<div style="max-width:${W}px;padding:16px 20px;font:12.5px/1.6 ${FONT};color:#6b7690;text-align:center">${footBits.join("<br>")}${unsub}</div>` +
        `</td></tr></table>`) +
    `</body></html>`;

  const foot = blank ? "" : [d.footer && sub(d.footer, v), biz && o.address ? `${biz}, ${o.address}` : biz].filter(Boolean).join("\n");
  const text = plain.filter(Boolean).join("\n\n") + (foot ? `\n\n--\n${foot}` : "") + (o.unsubscribeUrl ? `\nUnsubscribe: ${o.unsubscribeUrl}` : "");
  return { html, text };
}

/** Readable text for history and previews, whichever way the email was written. */
export function plainOf(body: string, v: Vars = {}): string {
  const d = parseDesign(body);
  return d ? renderDesign(d, v, { assetBase: "https://x" }).text : body;
}

/* ---------- Ready-made designs ---------- */
export interface Preset { id: string; name: string; kind: string; blurb: string; subject: string; design: Design }
const B = (type: BlockType, p: Partial<Block> = {}): Block => ({ ...newBlock(type), ...p });
const C = (cols: Cell[], layout: ColLayout = "equal", p: Partial<Block> = {}): Block => ({ ...newBlock("columns"), layout, cols: cols.map((c) => cell(c)), ...p });
const mk = (id: string, name: string, kind: string, blurb: string, subject: string, pre: string, blocks: Block[], brand = "#0b8a8a", bg = "#f4f6fb"): Preset => ({
  id, name, kind, blurb, subject, design: { ...blankDesign(blocks), brand, preheader: pre, bg },
});
const SOCIAL = () => B("social", { social: { facebook: "https://facebook.com/", instagram: "https://instagram.com/", website: "" } });

export const PRESETS: Preset[] = [
  mk("newsletter", "Renovation newsletter", "Newsletter", "Hero, three services, a project story and a review.", "This month at {{business}}: ideas for your home", "A finished kitchen, three ways we can help and a spring offer.", [
    B("hero", { img: "/email/hs-kitchen-navy.jpg", alt: "Navy kitchen renovation", title: "Kitchens that make the whole house feel new", text: "A look at this month's favourite project, plus three ways we can help with yours.", label: "Book a free visit", url: "{{booking_link}}" }),
    B("text", { text: "Hi {{first_name}},\n\nSpring is the busiest time of year for renovations, so here's what we've been working on and how to get on the calendar early." }),
    B("heading", { text: "What we do best" }),
    C([
      { img: "/email/hs-kitchen2.jpg", alt: "Kitchen", title: "Kitchens", text: "Layouts, cabinets, counters and lighting, managed start to finish." },
      { img: "/email/hs-bath1.jpg", alt: "Bathroom", title: "Bathrooms", text: "Walk-in showers, double vanities and heated floors." },
      { img: "/email/hs-living1.jpg", alt: "Living room", title: "Basements", text: "Turn unused space into a family room or rental suite." },
    ]),
    B("divider"),
    C([{ img: "/email/hs-living2.jpg", alt: "Open-plan living space", title: "", text: "" }, { title: "Project spotlight: the Martins' open-plan", text: "We took down one wall, moved the kitchen and added a skylight. Six weeks, on budget.", label: "See the photos", url: "https://" }], "image-left"),
    B("quote", { text: "Clear quote, tidy crew, finished a day early. We'd hire them again tomorrow.", by: "Priya S., basement renovation" }),
    B("button", { label: "Get your free quote", url: "{{booking_link}}" }),
    SOCIAL(),
  ]),
  mk("promo", "Seasonal offer", "Promotion", "Banner, offer box and before-and-after photos.", "{{first_name}}, 10% off if you book this month", "Only a few spots left this season.", [
    B("hero", { img: "/email/hs-bath1.jpg", alt: "Renovated bathroom", title: "10% off your bathroom renovation", text: "Book your free visit before the end of the month to lock it in.", label: "Claim the offer", url: "{{booking_link}}", bg: "#5a5bef" }),
    B("text", { text: "Hi {{first_name}},\n\nWe have a handful of spots left in our spring schedule. Book a free visit and we'll send a clear, fixed quote with the discount already applied." }),
    C([{ img: "/email/hs-wall.jpg", alt: "Before", title: "Before", text: "Dated tile and a cramped tub." }, { img: "/email/hs-bath1.jpg", alt: "After", title: "After", text: "Walk-in shower and warm wood vanity." }]),
    B("offer", { title: "What's included", text: "Free design visit, 3D layout, fixed-price quote and a 5-year workmanship warranty." }),
    B("button", { label: "Book my free visit", url: "{{booking_link}}" }),
    B("text", { text: "Offer ends on the last day of the month. Cannot be combined with other offers.", align: "center" }),
  ], "#5a5bef"),
  mk("welcome", "Welcome: how it works", "Welcome", "Three-step process for new leads.", "Welcome, {{first_name}}: here's what happens next", "Three simple steps from first call to finished project.", [
    B("hero", { img: "/email/hs-plan.jpg", alt: "Floor plan", title: "Thanks for reaching out, {{first_name}}", text: "Here's exactly what happens next.", label: "", url: "" }),
    B("heading", { text: "Three simple steps", align: "center" }),
    C([
      { title: "1. Free visit", text: "We come to you, measure up and listen to what you want." },
      { title: "2. Clear quote", text: "A fixed price within 48 hours. No surprises later." },
      { title: "3. We build", text: "One project lead, weekly updates and a tidy site." },
    ], "equal", { bg: "#f7fbfb" }),
    B("button", { label: "Pick a time for your visit", url: "{{booking_link}}" }),
    B("text", { text: "Questions before then? Just reply to this email and it comes straight to me.\n\n{{business}}" }),
  ]),
  mk("portfolio", "Project gallery", "Showcase", "Four-image grid of recent work.", "Our latest finished projects", "Kitchens, baths and living spaces from the past month.", [
    B("heading", { text: "Fresh from the job site", align: "center" }),
    B("text", { text: "Hi {{first_name}}, here are four projects we finished this month. Each one started with a free visit.", align: "center" }),
    C([
      { img: "/email/hs-kitchen2.jpg", alt: "Kitchen", title: "Kitchen", text: "" },
      { img: "/email/hs-bath1.jpg", alt: "Bathroom", title: "Bathroom", text: "" },
      { img: "/email/rs-living3.jpg", alt: "Living room", title: "Living room", text: "" },
      { img: "/email/hs-entry.jpg", alt: "Entrance", title: "Entrance", text: "" },
    ]),
    B("video", { img: "/email/hs-living2.jpg", alt: "Video tour", url: "https://", label: "Watch the 60-second tour" }),
    B("button", { label: "Start your project", url: "{{booking_link}}" }),
    SOCIAL(),
  ]),
  mk("quote-follow", "Quote follow-up", "Follow-up", "Personal note with a project image and next step.", "Any questions on your quote, {{first_name}}?", "Happy to adjust scope, timing or materials.", [
    B("text", { text: "Hi {{first_name}},\n\nI wanted to make sure our quote arrived and see if you have any questions. We can adjust the scope, timing or materials to suit your budget." }),
    C([{ img: "/email/hs-tiles.jpg", alt: "Tile samples", title: "", text: "" }, { title: "Want to see materials first?", text: "Visit our showroom or we'll bring samples to you.", label: "Book a call", url: "{{booking_link}}" }], "image-right"),
    B("offer", { title: "Ready when you are", text: "Reply to this email and we'll lock in your start date." }),
    B("text", { text: "Thanks,\n{{business}}" }),
  ]),
  mk("review", "Review request", "Review", "Thank-you, star prompt and a short quote.", "How did we do, {{first_name}}?", "It takes 30 seconds and helps a small business a lot.", [
    B("heading", { text: "Thank you for choosing us", align: "center" }),
    B("text", { text: "Hi {{first_name}},\n\nIt was a pleasure working on your project. If you're happy with the result, a quick review helps other homeowners find us.", align: "center" }),
    B("html", { text: '<div style="text-align:center;font-size:34px;letter-spacing:6px;color:#ffad4d">&#9733;&#9733;&#9733;&#9733;&#9733;</div>' }),
    B("button", { label: "Leave a review", url: "{{review_link}}" }),
    B("quote", { text: "Great team, great result. Would use again.", by: "A recent customer" }),
  ], "#ffad4d"),
  mk("reminder", "Visit reminder", "Reminder", "Appointment details and how to prepare.", "Your visit with {{business}} is coming up", "Here's what to expect and how to prepare.", [
    B("heading", { text: "Your visit is coming up" }),
    B("text", { text: "Hi {{first_name}},\n\nA quick reminder about your free design visit. Reply to this email if you need to change the time." }),
    C([
      { title: "Before we arrive", text: "Clear access to the room and jot down any must-haves." },
      { title: "During the visit", text: "About 45 minutes: measuring, photos and your questions." },
      { title: "After", text: "Your written quote within 48 hours." },
    ], "equal", { bg: "#f7fbfb" }),
    B("button", { label: "Change my visit", url: "{{booking_link}}" }),
  ]),
  mk("fitness", "Class launch (fitness)", "Promotion", "New class timetable for studios and gyms.", "New classes start Monday, {{first_name}}", "Strength, mobility and HIIT. First class free.", [
    B("hero", { img: "/email/fit-lady.jpg", alt: "Woman training", title: "New classes start Monday", text: "Strength, mobility and HIIT, with your first class on us.", label: "Book your free class", url: "{{booking_link}}", bg: "#111a2e" }),
    C([
      { img: "/email/fit-dumb.jpg", alt: "Dumbbells", title: "Strength", text: "Mon, Wed 6pm" },
      { img: "/email/fit-stretch.jpg", alt: "Stretching", title: "Mobility", text: "Tue, Thu 7am" },
      { img: "/email/fit-back.jpg", alt: "Training", title: "HIIT", text: "Sat 9am" },
    ]),
    B("list", { text: "Small groups, max 12 people\nCoaches who learn your name\nNo contract, cancel any time" }),
    B("button", { label: "Reserve my spot", url: "{{booking_link}}" }),
    SOCIAL(),
  ], "#ec5b7f"),
  mk("reengage", "We miss you", "Re-engagement", "Win back contacts who went quiet.", "Still thinking about your project, {{first_name}}?", "No pressure, we're here when you're ready.", [
    B("hero", { img: "/email/rs-living3.jpg", alt: "Living room", title: "Still thinking it over?", text: "No pressure. Here's an easy way to pick things up again.", label: "Let's talk", url: "{{booking_link}}", bg: "#ec5b7f" }),
    B("text", { text: "Hi {{first_name}},\n\nIt's been a little while. If your plans changed, that's completely fine. If you're still thinking about it, we'd be glad to help." }),
    B("list", { text: "Free visit and fixed quote\nFlexible start dates\nThe same person from start to finish" }),
  ], "#ec5b7f"),
  mk("plain", "Simple letter", "One-to-one", "Clean personal note with one button.", "Quick note from {{business}}", "", [
    B("text", { text: "Hi {{first_name}},\n\nWrite your message here." }),
    B("button", { label: "Book a call", url: "{{booking_link}}", align: "left" }),
  ]),
];
