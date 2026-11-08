"use client";
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import type { FormConfig } from "@/lib/forms";

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
