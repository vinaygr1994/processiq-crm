"use client";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PublicForm } from "@/components/PublicForm";
import { isDemo } from "@/lib/config";
import { localDb } from "@/lib/engine/localdb";
import { handleSubmission, readConfig, validate, type FormConfig } from "@/lib/forms";
import type { FormDef } from "@/lib/types";

/** Public form or landing page. Share the link, point ads at it, or embed it with ?embed=1. */
function Page() {
  const { slug } = useParams<{ slug: string }>();
  const embed = useSearchParams().get("embed") === "1";
  const [state, setState] = useState<{ cfg: FormConfig; business: string; form?: FormDef } | "missing" | null>(null);

  useEffect(() => {
    (async () => {
      if (isDemo) {
        const form = (await localDb.list("forms")).find((f) => f.slug === slug);
        const st = (await localDb.list("settings"))[0];
        setState(form ? { cfg: readConfig(form), business: st?.business_name ?? "", form } : "missing");
        return;
      }
      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
      if (!r.ok) return setState("missing");
      const j = await r.json();
      setState({ cfg: j.config, business: j.business });
    })().catch(() => setState("missing"));
  }, [slug]);

  async function submit(raw: Record<string, unknown>) {
    if (state === "missing" || !state) return;
    if (isDemo && state.form) {
      const v = validate(state.cfg, raw);
      if ("error" in v) throw new Error(v.error);
      await handleSubmission(localDb, state.form, v.values, v.consent);
      return;
    }
    const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(raw) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
  }

  if (state === null) return <main className="min-h-dvh bg-[#f4f6fb]" />;
  if (state === "missing") return <main className="grid min-h-dvh place-items-center px-5 text-center"><div><h1 className="text-xl font-semibold">This form isn&apos;t available</h1><p className="mt-1 text-muted">It may have been unpublished. Check the link and try again.</p></div></main>;
  return <main className={embed ? "bg-white" : "min-h-dvh"}><PublicForm cfg={state.cfg} business={state.business} onSubmit={submit} embed={embed} /></main>;
}

export default function PublicFormPage() {
  return <Suspense fallback={null}><Page /></Suspense>;
}
