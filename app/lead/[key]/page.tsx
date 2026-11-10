"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PROJECTS, BUDGETS } from "@/lib/stages";

/** Public "request a free quote" form. Share the link or point ads at it. Leads land straight in the CRM. */
export default function LeadForm() {
  const { key } = useParams<{ key: string }>();
  const [f, setF] = useState({ name: "", phone: "", email: "", project: PROJECTS[0], budget: "", address: "", message: "", website: "" });
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    if (!f.name.trim() || (!f.phone.trim() && !f.email.trim())) { setErr("Please add your name and a phone number or email."); return; }
    setState("busy");
    try {
      const sp = new URLSearchParams(window.location.search);
      const r = await fetch(`/api/leads?key=${encodeURIComponent(key)}&source=${encodeURIComponent(sp.get("source") || "Website form")}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
      setState("done");
    } catch (x) { setErr((x as Error).message); setState("idle"); }
  };
  if (state === "done") return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-5"><div className="text-center"><div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-teal-t text-2xl text-teal-d">✓</div><h1 className="text-[22px] font-semibold">Thanks, we got it</h1><p className="mt-2 text-muted">We&apos;ll be in touch shortly to talk about your project.</p></div></main>
  );
  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <h1 className="text-[22px] font-semibold">Get your free quote</h1>
      <p className="mt-1 text-muted">Tell us about your project. We&apos;ll call you back fast.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">Your name</span><input className="field" value={f.name} onChange={set("name")} autoComplete="name" required /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">Phone</span><input className="field" type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">Email</span><input className="field" type="email" value={f.email} onChange={set("email")} autoComplete="email" /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">What are you interested in?</span><select className="field" value={f.project} onChange={set("project")}>{PROJECTS.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">Budget (optional)</span><select className="field" value={f.budget} onChange={set("budget")}><option value="">Not sure yet</option>{BUDGETS.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">Address or city (optional)</span><input className="field" value={f.address} onChange={set("address")} autoComplete="street-address" /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-semibold">Anything else? (optional)</span><textarea className="field !min-h-[90px]" value={f.message} onChange={set("message")} /></label>
        <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website} onChange={set("website")} name="website" />
        {err && <p role="alert" className="rounded-xl bg-rose-t px-3 py-2 text-sm text-[#b8264b]">{err}</p>}
        <button disabled={state === "busy"} className="h-12 w-full rounded-full bg-ink font-semibold text-white hover:bg-[#1d2a47] disabled:opacity-60">{state === "busy" ? "Sending…" : "Request my free quote"}</button>
      </form>
    </main>
  );
}
