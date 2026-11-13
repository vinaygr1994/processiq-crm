"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isDemo } from "@/lib/config";
import { supabase } from "@/lib/supabase";

/**
 * Where the "Forgot password?" email lands. The link signs the person in with a
 * short-lived recovery session; they must choose a new password before the CRM opens.
 */
export default function ResetPassword() {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready" | "expired" | "done">("checking");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isDemo) { router.replace("/"); return; }
    // Supabase puts errors (e.g. an expired or already-used link) in the URL hash.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.get("error")) { const t = setTimeout(() => setState("expired"), 0); return () => clearTimeout(t); }
    const sb = supabase();
    let settled = false;
    const ok = (e?: string | null) => { if (settled) return; settled = true; setEmail(e ?? ""); setState("ready"); };
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && s?.user) ok(s.user.email);
    });
    sb.auth.getSession().then(({ data }) => { if (data.session) ok(data.session.user.email); });
    const t = setTimeout(() => { if (!settled) setState("expired"); }, 6000);
    return () => { clearTimeout(t); sub.subscription.unsubscribe(); };
  }, [router]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (pw.length < 8) return setErr("Use at least 8 characters.");
    if (pw !== pw2) return setErr("The two passwords don't match.");
    setBusy(true);
    const sb = supabase();
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { setErr(error.message); setBusy(false); return; }
    // Sign out everywhere so old sessions stop working, then log in with the new password.
    await sb.auth.signOut({ scope: "global" });
    setState("done");
    setBusy(false);
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-cloud px-5 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-[0_10px_40px_rgba(17,26,46,.08)]">
        <div className="mb-6 flex items-center gap-2.5"><span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-teal via-[#2f7fd0] to-iris font-display text-sm font-bold text-white">IQ</span><span className="font-display text-lg font-bold text-ink">Process IQ CRM</span></div>
        {state === "checking" && <p className="text-muted">Checking your reset link…</p>}
        {state === "expired" && (
          <><h1 className="text-xl font-semibold">This reset link has expired</h1><p className="mt-2 text-muted">Reset links work once and expire after an hour. Go back to <a href="/login" className="font-semibold text-teal-d hover:underline">log in</a>, type your email and click “Forgot password?” to get a new one.</p></>
        )}
        {state === "done" && (
          <><h1 className="text-xl font-semibold">Password changed</h1><p className="mt-2 text-muted">You&apos;ve been signed out on all devices. Log in with your new password.</p>
            <a href="/login" className="mt-6 grid h-12 w-full place-items-center rounded-full bg-ink font-semibold text-white hover:bg-[#1d2a47]">Go to log in</a></>
        )}
        {state === "ready" && (
          <form onSubmit={save} className="space-y-4">
            <div><h1 className="text-xl font-semibold">Choose a new password</h1>{email && <p className="mt-1 text-muted">For <strong className="text-ink">{email}</strong>.</p>}</div>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">New password</span><input type="password" autoComplete="new-password" className="field" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">Type it again</span><input type="password" autoComplete="new-password" className="field" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
            {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
            <button disabled={busy} className="h-12 w-full rounded-full bg-ink font-semibold text-white hover:bg-[#1d2a47] disabled:opacity-60">{busy ? "Saving…" : "Save new password"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
