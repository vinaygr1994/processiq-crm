"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isDemo } from "@/lib/config";
import { supabase } from "@/lib/supabase";

/** Where team invites land: the invite link signs the person in, then they choose a password. */
export default function Welcome() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (isDemo) { router.replace("/"); return; }
    const sb = supabase();
    const done = (e: string | null | undefined) => { setEmail(e ?? null); setChecked(true); };
    sb.auth.getSession().then(({ data }) => done(data.session?.user.email));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => { if (s?.user) done(s.user.email); });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (pw.length < 8) return setErr("Use at least 8 characters.");
    if (pw !== pw2) return setErr("The two passwords don't match.");
    setBusy(true);
    const sb = supabase();
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { setErr(error.message); setBusy(false); return; }
    await sb.rpc("crm_accept").then(() => {}, () => {});
    router.replace("/");
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-cloud px-5 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-[0_10px_40px_rgba(17,26,46,.08)]">
        <div className="mb-6 flex items-center gap-2.5"><span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-teal via-[#2f7fd0] to-iris font-display text-sm font-bold text-white">IQ</span><span className="font-display text-lg font-bold text-ink">Process IQ CRM</span></div>
        {!checked ? <p className="text-muted">Checking your invite…</p> : !email ? (
          <><h1 className="text-xl font-semibold">This invite link has expired</h1><p className="mt-2 text-muted">Invite links work once and expire after 24 hours. Ask the person who invited you to send a new one, or <a href="/login" className="font-semibold text-teal-d hover:underline">log in</a> if you already have a password.</p></>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div><h1 className="text-xl font-semibold">Welcome to the team</h1><p className="mt-1 text-muted">Choose a password for <strong className="text-ink">{email}</strong>.</p></div>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">Password</span><input type="password" autoComplete="new-password" className="field" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">Type it again</span><input type="password" autoComplete="new-password" className="field" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
            {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
            <button disabled={busy} className="h-12 w-full rounded-full bg-ink font-semibold text-white hover:bg-[#1d2a47] disabled:opacity-60">{busy ? "Saving…" : "Set password and open the CRM"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
