"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { pairs, type FormConfig, type PageBlock } from "@/lib/forms";

/** The public form (and optional landing page). Used by /f/[slug] and by the editor's live preview. */
export function PublicForm({ cfg, business, onSubmit, preview = false, embed = false }: {
  cfg: FormConfig; business?: string; preview?: boolean; embed?: boolean;
  onSubmit: (raw: Record<string, unknown>) => Promise<void>;
}) {
  const [vals, setVals] = useState<Record<string, string | boolean>>({});
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState("");
  const [started] = useState(() => Date.now());
  const top = useRef<HTMLDivElement>(null);
  const brand = cfg.brand || "#0b8a8a";

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (preview) { setState("done"); return; }
    setState("busy");
    try {
      await onSubmit({ ...vals, consent, website: hp, elapsed: Date.now() - started });
      if (cfg.redirect && /^https?:\/\//.test(cfg.redirect)) { window.top ? (window.top.location.href = cfg.redirect) : (window.location.href = cfg.redirect); return; }
      setState("done"); top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (x) { setErr((x as Error).message); setState("idle"); }
  }

  const form = state === "done" ? (
    <div className="py-6 text-center" role="status">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full text-2xl text-white" style={{ background: brand }}>✓</div>
      <p className="text-lg font-semibold text-[#111a2e]">{cfg.thanks}</p>
      {preview && <button type="button" onClick={() => setState("idle")} className="mt-4 text-sm font-semibold underline" style={{ color: brand }}>Show the form again</button>}
    </div>
  ) : (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {cfg.title && <h2 className="text-[22px] font-semibold leading-tight text-[#111a2e]">{cfg.title}</h2>}
      {cfg.intro && <p className="-mt-2 text-[15px] text-[#5d6782]">{cfg.intro}</p>}
      {cfg.fields.map((f) => {
        const id = `pf-${f.id}`, v = vals[f.id];
        const label = <span className="mb-1.5 block text-sm font-semibold text-[#111a2e]">{f.label}{f.required ? <span className="text-[#c2264d]"> *</span> : <span className="font-normal text-[#8a93a8]"> (optional)</span>}</span>;
        const cls = "w-full rounded-xl border border-[#d9dfea] bg-white px-3.5 py-2.5 text-[15px] text-[#111a2e] outline-none transition focus:border-[var(--b)] focus:ring-4 focus:ring-[var(--b)]/15";
        if (f.type === "checkbox") return (
          <label key={f.id} htmlFor={id} className="flex items-start gap-2.5 text-[15px] text-[#33405a]">
            <input id={id} type="checkbox" className="mt-0.5 size-[18px]" style={{ accentColor: brand }} checked={!!v} onChange={(e) => setVals({ ...vals, [f.id]: e.target.checked })} />{f.label}
          </label>
        );
        return (
          <label key={f.id} htmlFor={id} className="block" style={{ ["--b" as string]: brand }}>
            {label}
            {f.type === "textarea" ? <textarea id={id} className={`${cls} min-h-[100px]`} placeholder={f.placeholder} value={(v as string) ?? ""} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })} required={f.required} />
              : f.type === "select" ? <select id={id} className={cls} value={(v as string) ?? ""} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })} required={f.required}><option value="">Choose…</option>{(f.options ?? []).map((o) => <option key={o}>{o}</option>)}</select>
              : <input id={id} className={cls} type={f.type === "phone" ? "tel" : f.type} placeholder={f.placeholder} value={(v as string) ?? ""} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })} required={f.required}
                  autoComplete={f.mapTo === "name" ? "name" : f.mapTo === "email" ? "email" : f.mapTo === "phone" ? "tel" : f.mapTo === "company" ? "organization" : undefined} />}
            {f.help && <span className="mt-1 block text-[13px] text-[#8a93a8]">{f.help}</span>}
          </label>
        );
      })}
      {cfg.consent.enabled && (
        <label className="flex items-start gap-2.5 text-[14px] text-[#5d6782]">
          <input type="checkbox" className="mt-0.5 size-[18px]" style={{ accentColor: brand }} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>{cfg.consent.text}{cfg.consent.required && <span className="text-[#c2264d]"> *</span>}</span>
        </label>
      )}
      <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" name="website" value={hp} onChange={(e) => setHp(e.target.value)} />
      {err && <p role="alert" className="rounded-xl bg-[#fde8ee] px-3 py-2 text-sm text-[#b8264b]">{err}</p>}
      <button disabled={state === "busy"} className="h-12 w-full rounded-full font-semibold text-white transition hover:brightness-110 disabled:opacity-60" style={{ background: brand }}>{state === "busy" ? "Sending…" : cfg.button || "Send"}</button>
      {business && <p className="text-center text-[12px] text-[#8a93a8]">Your details go to {business}.</p>}
    </form>
  );

  if (!cfg.page.enabled || embed) return <div ref={top} className={embed ? "p-4" : "mx-auto max-w-md px-5 py-10"}>{form}</div>;

  if (cfg.page.mode === "custom") {
    const blocks: PageBlock[] = cfg.page.blocks ?? [];
    const hasForm = blocks.some((b) => b.type === "form");
    const jump = () => document.getElementById("pf-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    const wrap = "mx-auto max-w-5xl px-5 @xl:px-8";
    const h2 = "text-[26px] font-semibold leading-tight text-[#111a2e] @xl:text-[32px]";
    const formCard = (b?: PageBlock) => (
      <section key={b?.id ?? "auto-form"} id="pf-form" className="py-10 @xl:py-14"><div className={`mx-auto px-5 ${b?.p.width === "wide" ? "max-w-2xl" : "max-w-md"}`}>
        {b?.p.heading && <h2 className={`${h2} mb-5 text-center`}>{b.p.heading}</h2>}
        <div className="rounded-2xl bg-white p-6 shadow-xl ring-1 ring-black/5 @xl:p-7">{form}</div></div></section>
    );
    return (
      <div ref={top} className="@container min-h-full bg-[#f4f6fb] text-[#33405a]">
        {business && <div className="bg-white py-3 shadow-sm"><div className={`${wrap} text-[15px] font-semibold text-[#111a2e]`}>{business}</div></div>}
        {blocks.map((b) => {
          const p = b.p;
          switch (b.type) {
            case "hero": return (
              <section key={b.id} style={{ background: `linear-gradient(135deg, ${brand}, #111a2e)` }} className="text-white"><div className={`${wrap} py-12 @xl:py-20 ${p.align === "center" ? "text-center" : p.image ? "grid items-center gap-10 @4xl:grid-cols-2" : ""}`}>
                <div><h1 className="text-[34px] font-semibold leading-[1.08] @xl:text-[48px]" style={{ color: "#fff" }}>{p.headline}</h1>
                  {p.subtext && <p className={`mt-4 text-[17px] leading-relaxed text-white/85 ${p.align === "center" ? "mx-auto max-w-2xl" : "max-w-xl"}`}>{p.subtext}</p>}
                  {p.button && <button type="button" onClick={jump} className="mt-7 h-12 rounded-full bg-white px-7 font-semibold transition hover:brightness-95" style={{ color: brand }}>{p.button}</button>}</div>
                {p.image && <img src={p.image} alt="" className={`w-full rounded-2xl object-cover shadow-2xl ${p.align === "center" ? "mx-auto mt-10 aspect-[21/9] max-w-3xl" : "aspect-[4/3]"}`} />}
              </div></section>);
            case "text": return <section key={b.id} className="py-10 @xl:py-14"><div className="mx-auto max-w-3xl px-5">{p.heading && <h2 className={h2}>{p.heading}</h2>}{p.body.split(/\n\s*\n/).map((x, i) => <p key={i} className="mt-4 whitespace-pre-line text-[16.5px] leading-relaxed">{x}</p>)}</div></section>;
            case "image": return p.src ? <section key={b.id} className="py-6"><figure className={wrap}><img src={p.src} alt={p.alt} className="w-full rounded-2xl object-cover" />{p.caption && <figcaption className="mt-2 text-center text-[14px] text-[#5d6782]">{p.caption}</figcaption>}</figure></section> : null;
            case "features": { const items = pairs(p.items); return (
              <section key={b.id} className="bg-white py-10 @xl:py-14"><div className={wrap}>{p.heading && <h2 className={`${h2} text-center`}>{p.heading}</h2>}
                <div className="mt-8 grid gap-5 @xl:grid-cols-3">{items.map(([t2, d], i) => <div key={i} className="rounded-2xl border border-[#e4e8f0] p-5"><div className="mb-3 grid size-9 place-items-center rounded-full text-white" style={{ background: brand }}>✓</div><h3 className="text-[17px] font-semibold text-[#111a2e]">{t2}</h3>{d && <p className="mt-1 text-[15px]">{d}</p>}</div>)}</div></div></section>); }
            case "testimonial": return <section key={b.id} className="py-10 @xl:py-14"><figure className="mx-auto max-w-3xl px-5 text-center"><blockquote className="text-[22px] font-medium leading-snug text-[#111a2e] @xl:text-[26px]">“{p.quote}”</blockquote>{p.name && <figcaption className="mt-4 text-[15px] text-[#5d6782]">{p.name}</figcaption>}</figure></section>;
            case "faq": { const items = pairs(p.items); return (
              <section key={b.id} className="bg-white py-10 @xl:py-14"><div className="mx-auto max-w-3xl px-5">{p.heading && <h2 className={h2}>{p.heading}</h2>}
                <div className="mt-5 divide-y divide-[#e4e8f0] border-y border-[#e4e8f0]">{items.map(([q2, a], i) => <details key={i} className="group py-4"><summary className="cursor-pointer list-none text-[16.5px] font-semibold text-[#111a2e]"><span className="mr-2 inline-block transition group-open:rotate-90" style={{ color: brand }}>›</span>{q2}</summary><p className="mt-2 pl-5 text-[15.5px] leading-relaxed">{a}</p></details>)}</div></div></section>); }
            case "form": return formCard(b);
            case "cta": return <section key={b.id} style={{ background: brand }} className="py-10 text-center text-white @xl:py-12"><div className={wrap}><h2 className="text-[26px] font-semibold @xl:text-[30px]" style={{ color: "#fff" }}>{p.headline}</h2>{p.button && <button type="button" onClick={jump} className="mt-5 h-12 rounded-full bg-white px-7 font-semibold" style={{ color: brand }}>{p.button}</button>}</div></section>;
            case "html": return <iframe key={b.id} title="Custom content" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<!doctype html><base target="_blank"><style>html,body{margin:0}</style>${p.code}`} className="block w-full border-0" style={{ height: Math.min(4000, Math.max(40, Number(p.height) || 220)) }} />;
            case "spacer": return <div key={b.id} style={{ height: Math.min(400, Math.max(0, Number(p.height) || 40)) }} />;
          }
        })}
        {!hasForm && formCard()}
      </div>
    );
  }

  const bullets = cfg.page.bullets.split("\n").map((b) => b.trim()).filter(Boolean);
  const side = cfg.page.layout === "side";
  return (
    <div ref={top} className="@container min-h-full bg-[#f4f6fb]">
      <div style={{ background: `linear-gradient(135deg, ${brand}, #111a2e)` }} className="text-white">
        <div className={`mx-auto max-w-6xl px-5 py-10 @xl:px-8 @xl:py-14 ${side ? "grid items-start gap-10 @4xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" : ""}`}>
          <div>
            {business && <div className="mb-6 text-sm font-semibold text-white/80">{business}</div>}
            <h1 className="text-[32px] font-semibold leading-[1.1] @xl:text-[44px]" style={{ color: "#fff" }}>{cfg.page.headline || cfg.title}</h1>
            {cfg.page.subtext && <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-white/85">{cfg.page.subtext}</p>}
            {bullets.length > 0 && <ul className="mt-6 space-y-2.5">{bullets.map((b) => <li key={b} className="flex items-start gap-2.5 text-[16px]"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/20 text-[12px]">✓</span>{b}</li>)}</ul>}
            {cfg.page.image && <img src={cfg.page.image} alt="" className={`mt-8 w-full rounded-2xl object-cover shadow-2xl ${side ? "aspect-[3/2]" : "aspect-[21/9]"}`} />}
          </div>
          {side && <div className="rounded-3xl bg-white p-6 text-[#111a2e] shadow-2xl @xl:p-7 @4xl:sticky @4xl:top-6">{form}</div>}
        </div>
      </div>
      {!side && <div className="mx-auto -mt-8 max-w-xl px-5 pb-12"><div className="rounded-3xl bg-white p-6 shadow-xl @xl:p-7">{form}</div></div>}
    </div>
  );
}
