// Designed emails: a list of simple blocks that renders to email-safe HTML (tables, inline styles).
// Pure functions only, so the same code runs in the browser (live preview) and on the server (sending).

export type BlockType = "heading" | "text" | "image" | "button" | "offer" | "list" | "quote" | "divider" | "spacer";
export interface Block {
  id: string;
  type: BlockType;
  text?: string;   // heading / text / offer body / quote / list items (one per line)
  title?: string;  // offer headline
  url?: string;    // image source, or button link
  link?: string;   // where a clicked image goes
  alt?: string;    // image description
  label?: string;  // button label
  by?: string;     // quote author
  align?: "left" | "center";
  size?: number;   // spacer height
}
export interface Design { v: 1; brand: string; preheader: string; logo: string; footer: string; blocks: Block[] }

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Heading", text: "Text", image: "Image", button: "Button", offer: "Highlight box",
  list: "Bullet list", quote: "Quote", divider: "Divider", spacer: "Space",
};

export const MERGE_FIELDS: { tag: string; label: string }[] = [
  { tag: "first_name", label: "First name" }, { tag: "company", label: "Company" }, { tag: "business", label: "Your business" },
  { tag: "booking_link", label: "Booking link" }, { tag: "review_link", label: "Review link" },
];

const PREFIX = "PIQDESIGN:";
let n = 0;
export const bid = () => `b${Date.now().toString(36)}${(n++).toString(36)}`;
export const newBlock = (type: BlockType): Block => {
  const b: Block = { id: bid(), type };
  if (type === "heading") b.text = "Your headline";
  if (type === "text") b.text = "Hi {{first_name}},\n\nWrite your message here.";
  if (type === "image") { b.url = ""; b.alt = ""; }
  if (type === "button") { b.label = "Book a visit"; b.url = "{{booking_link}}"; b.align = "center"; }
  if (type === "offer") { b.title = "Your offer"; b.text = "Say what they get and when it ends."; }
  if (type === "list") b.text = "First benefit\nSecond benefit\nThird benefit";
  if (type === "quote") { b.text = "They were on time, tidy and the result looks fantastic."; b.by = "Happy customer"; }
  if (type === "spacer") b.size = 24;
  return b;
};
export const blankDesign = (blocks: Block[] = []): Design => ({ v: 1, brand: "#0b8a8a", preheader: "", logo: "", footer: "", blocks });

export const isDesign = (body: string) => body.startsWith(PREFIX);
export const stringifyDesign = (d: Design) => PREFIX + JSON.stringify(d);
export function parseDesign(body: string): Design | null {
  if (!isDesign(body)) return null;
  try { return sanitizeDesign(JSON.parse(body.slice(PREFIX.length))); } catch { return null; }
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
/** Accepts untrusted JSON (the send route) and returns a safe Design, or null. */
export function sanitizeDesign(raw: unknown): Design | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.blocks) || r.blocks.length > 60) return null;
  const types = Object.keys(BLOCK_LABELS);
  const blocks: Block[] = [];
  for (const x of r.blocks) {
    if (!x || typeof x !== "object") return null;
    const b = x as Record<string, unknown>;
    if (typeof b.type !== "string" || !types.includes(b.type)) return null;
    blocks.push({
      id: s(b.id, 40) || bid(), type: b.type as BlockType, text: s(b.text, 10_000), title: s(b.title, 300), url: s(b.url, 2000),
      alt: s(b.alt, 300), link: s(b.link, 2000), label: s(b.label, 100), by: s(b.by, 200), align: b.align === "center" ? "center" : "left",
      size: typeof b.size === "number" ? Math.min(80, Math.max(8, Math.round(b.size))) : undefined,
    });
  }
  const brand = typeof r.brand === "string" && /^#[0-9a-f]{6}$/i.test(r.brand) ? r.brand : "#0b8a8a";
  return { v: 1, brand, preheader: s(r.preheader, 200) ?? "", logo: s(r.logo, 2000) ?? "", footer: s(r.footer, 500) ?? "", blocks };
}

export const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeUrl = (u: string, allowMail = false) => (/^https:\/\//i.test(u) || (allowMail && /^(mailto:|tel:)/i.test(u)) ? u : "");

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
const para = (t: string, v: Vars) => esc(sub(t, v)).replace(/(https:\/\/[^\s<]+)/g, (m) => `<a href="${m}" style="color:inherit;text-decoration:underline">${m}</a>`).replace(/\n/g, "<br>");

export interface RenderOpts { business?: string; address?: string; unsubscribeUrl?: string }
export interface Rendered { html: string; text: string }

export function renderDesign(d: Design, v: Vars, o: RenderOpts = {}): Rendered {
  const brand = d.brand, rows: string[] = [], plain: string[] = [];
  const row = (inner: string, pad = "0 32px 18px") => rows.push(`<tr><td style="padding:${pad}">${inner}</td></tr>`);

  for (const b of d.blocks) {
    const al = b.align === "center" ? "center" : "left";
    switch (b.type) {
      case "heading": {
        const t = sub(b.text ?? "", v); if (!t.trim()) break;
        row(`<h1 style="margin:0;font:700 26px/1.25 ${FONT};color:#111a2e;text-align:${al}">${esc(t)}</h1>`); plain.push(t.toUpperCase()); break;
      }
      case "text": {
        const t = sub(b.text ?? "", v); if (!t.trim()) break;
        row(`<div style="font:16px/1.65 ${FONT};color:#33405a;text-align:${al}">${para(b.text ?? "", v)}</div>`); plain.push(t); break;
      }
      case "image": {
        const u = safeUrl(sub(b.url ?? "", v)); if (!u) break;
        const link = safeUrl(sub(b.link ?? "", v));
        const img = `<img src="${esc(u)}" alt="${esc(sub(b.alt ?? "", v))}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:10px">`;
        row(link ? `<a href="${esc(link)}">${img}</a>` : img); break;
      }
      case "button": {
        const u = safeUrl(sub(b.url ?? "", v), true), l = sub(b.label ?? "", v).trim(); if (!u || !l) break;
        row(`<table role="presentation" cellpadding="0" cellspacing="0" align="${al}" style="margin:0 ${al === "center" ? "auto" : "0"}"><tr><td style="background:${brand};border-radius:999px"><a href="${esc(u)}" style="display:inline-block;padding:14px 28px;font:700 16px ${FONT};color:#ffffff;text-decoration:none">${esc(l)}</a></td></tr></table>`);
        plain.push(`${l}: ${u}`); break;
      }
      case "offer": {
        const t = sub(b.title ?? "", v), x = sub(b.text ?? "", v); if (!t.trim() && !x.trim()) break;
        row(`<div style="background:${brand}14;border-left:4px solid ${brand};border-radius:10px;padding:18px 20px"><div style="font:700 19px/1.3 ${FONT};color:#111a2e">${esc(t)}</div><div style="margin-top:6px;font:15px/1.6 ${FONT};color:#33405a">${para(b.text ?? "", v)}</div></div>`);
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
      case "divider": row(`<div style="border-top:1px solid #e4e8f0;line-height:0;font-size:0">&nbsp;</div>`, "4px 32px 18px"); break;
      case "spacer": rows.push(`<tr><td style="height:${b.size ?? 24}px;line-height:${b.size ?? 24}px;font-size:0">&nbsp;</td></tr>`); break;
    }
  }

  const biz = o.business?.trim() || "";
  const logoUrl = safeUrl(d.logo);
  const head = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${esc(biz)}" height="36" style="display:block;height:36px;width:auto;border:0">`
    : biz ? `<div style="font:700 18px ${FONT};color:${brand}">${esc(biz)}</div>` : "";
  const footBits = [d.footer && esc(sub(d.footer, v)), biz && o.address ? `${esc(biz)} &middot; ${esc(o.address)}` : biz && esc(biz)].filter(Boolean);
  const unsub = o.unsubscribeUrl ? `<br><a href="${esc(o.unsubscribeUrl)}" style="color:#6b7690">Unsubscribe</a>` : "";
  const pre = d.preheader.trim() ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${esc(sub(d.preheader, v))}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>` +
    `<body style="margin:0;padding:0;background:#f4f6fb">${pre}` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px">` +
    `<tr><td style="height:6px;background:${brand};border-radius:14px 14px 0 0;line-height:6px;font-size:0">&nbsp;</td></tr>` +
    (head ? `<tr><td style="padding:24px 32px 18px">${head}</td></tr>` : `<tr><td style="height:18px;line-height:18px;font-size:0">&nbsp;</td></tr>`) +
    rows.join("") + `<tr><td style="height:12px;line-height:12px;font-size:0">&nbsp;</td></tr></table>` +
    `<div style="max-width:600px;padding:16px 20px;font:12.5px/1.6 ${FONT};color:#6b7690;text-align:center">${footBits.join("<br>")}${unsub}</div>` +
    `</td></tr></table></body></html>`;

  const foot = [d.footer && sub(d.footer, v), biz && o.address ? `${biz}, ${o.address}` : biz].filter(Boolean).join("\n");
  const text = plain.filter(Boolean).join("\n\n") + (foot ? `\n\n--\n${foot}` : "") + (o.unsubscribeUrl ? `\nUnsubscribe: ${o.unsubscribeUrl}` : "");
  return { html, text };
}

/** Readable text for history and previews, whichever way the email was written. */
export function plainOf(body: string, v: Vars = {}): string {
  const d = parseDesign(body);
  return d ? renderDesign(d, v).text : body;
}

/* ---------- Ready-made designs ---------- */
export interface Preset { id: string; name: string; kind: string; blurb: string; subject: string; design: Design }
const B = (type: BlockType, p: Partial<Block> = {}): Block => ({ ...newBlock(type), ...p });
const mk = (id: string, name: string, kind: string, blurb: string, subject: string, pre: string, blocks: Block[], brand = "#0b8a8a"): Preset => ({
  id, name, kind, blurb, subject, design: { ...blankDesign(blocks), brand, preheader: pre },
});

export const PRESETS: Preset[] = [
  mk("welcome", "Welcome", "Welcome", "Thank a new lead and set expectations.", "Thanks for reaching out, {{first_name}}", "We'll be in touch shortly.", [
    B("heading", { text: "Thanks for getting in touch" }),
    B("text", { text: "Hi {{first_name}},\n\nThanks for contacting {{business}}. We've got your request and one of our team will call you shortly to talk through what you need." }),
    B("list", { text: "A free, no-pressure visit and quote\nClear pricing before any work starts\nA dedicated person who answers your calls" }),
    B("button", { label: "Pick a time that suits you", url: "{{booking_link}}" }),
    B("text", { text: "Talk soon,\n{{business}}" }),
  ]),
  mk("quote-follow", "Quote follow-up", "Follow-up", "Nudge after you've sent a quote.", "Any questions on your quote, {{first_name}}?", "Happy to adjust anything.", [
    B("heading", { text: "Checking in on your quote" }),
    B("text", { text: "Hi {{first_name}},\n\nI wanted to make sure you received our quote and see if you have any questions. We can adjust the scope, timing or materials to fit your budget." }),
    B("offer", { title: "Ready when you are", text: "Reply to this email or book a quick call and we'll lock in your start date." }),
    B("button", { label: "Book a quick call", url: "{{booking_link}}" }),
  ]),
  mk("newsletter", "Monthly newsletter", "Newsletter", "News, a tip and a call to action.", "What's new at {{business}}", "A tip, a project and an offer.", [
    B("heading", { text: "What's new this month" }),
    B("text", { text: "Hi {{first_name}},\n\nHere's a quick round-up from the team." }),
    B("image", { url: "", alt: "Recent project" }),
    B("heading", { text: "Project spotlight", align: "left" }),
    B("text", { text: "Tell the story of a recent job: the problem, what you did and how it turned out." }),
    B("divider"),
    B("heading", { text: "Tip of the month" }),
    B("list", { text: "Share one useful tip\nKeep it short and practical\nLink to a page for more" }),
    B("button", { label: "See more projects", url: "https://" }),
  ]),
  mk("promo", "Seasonal offer", "Promotion", "Announce a limited-time offer.", "{{first_name}}, a seasonal offer from {{business}}", "Limited time only.", [
    B("heading", { text: "Our seasonal offer is here", align: "center" }),
    B("offer", { title: "10% off your first project", text: "Book before the end of the month to lock in the offer." }),
    B("text", { text: "Hi {{first_name}},\n\nWe have a few spots left this season. Book a free visit and we'll put together a clear quote with the offer applied." }),
    B("button", { label: "Claim the offer", url: "{{booking_link}}" }),
    B("text", { text: "Offer ends soon. Terms apply." }),
  ], "#5a5bef"),
  mk("review", "Review request", "Review", "Ask a happy customer for a review.", "How did we do, {{first_name}}?", "It takes 30 seconds.", [
    B("heading", { text: "How did we do?" }),
    B("text", { text: "Hi {{first_name}},\n\nThank you for choosing {{business}}. If you're happy with the work, a short review helps other people find us and means a lot to the team." }),
    B("button", { label: "Leave a review", url: "{{review_link}}" }),
    B("quote", { text: "Great team, great result. Would use again.", by: "A recent customer" }),
  ], "#ffad4d"),
  mk("reminder", "Visit reminder", "Reminder", "Confirm an upcoming visit or appointment.", "Your visit with {{business}}", "Here are the details.", [
    B("heading", { text: "Your visit is coming up" }),
    B("text", { text: "Hi {{first_name}},\n\nThis is a quick reminder about your upcoming visit with {{business}}. Reply to this email if you need to change the time." }),
    B("offer", { title: "What to expect", text: "Our team will look at the space, answer your questions and send a written quote within a few days." }),
    B("button", { label: "Change my visit", url: "{{booking_link}}" }),
  ]),
  mk("reengage", "We miss you", "Re-engagement", "Wake up contacts who've gone quiet.", "Still thinking about your project, {{first_name}}?", "No pressure, we're here when you're ready.", [
    B("heading", { text: "Still thinking it over?" }),
    B("text", { text: "Hi {{first_name}},\n\nIt's been a little while. If your plans have changed, that's completely fine. If you're still thinking about it, we'd be glad to help." }),
    B("list", { text: "Free visit and quote\nFlexible start dates\nTalk to the same person from start to finish" }),
    B("button", { label: "Let's talk", url: "{{booking_link}}" }),
  ], "#ec5b7f"),
  mk("plain", "Simple letter", "One-to-one", "A clean, personal note with a button.", "Quick note from {{business}}", "", [
    B("text", { text: "Hi {{first_name}},\n\nWrite your message here." }),
    B("button", { label: "Book a call", url: "{{booking_link}}", align: "left" }),
  ]),
];
