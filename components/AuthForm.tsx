"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "./Logo";
import { Button, Field } from "./ui";
import { isDemo } from "@/lib/config";
import { supabase } from "@/lib/supabase";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reason") === "idle") queueMicrotask(() => setInfo("You were logged out after an hour with no activity. Log in again to continue."));
    if (isDemo) router.replace("/");
    else supabase().auth.getSession().then(({ data }) => data.session && router.replace("/"));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setInfo("");
    if (password.length < 8 && signup) return setErr("Please choose a password with at least 8 characters.");
    setBusy(true);
    const sb = supabase();
    if (signup) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      setBusy(false);
      if (error) return setErr(error.message);
      if (data.session) router.replace("/");
      else setInfo("Almost there! Check your inbox and click the link we sent to confirm your email, then log in.");
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setErr(error.message === "Invalid login credentials" ? "That email or password isn't right." : error.message);
      try { localStorage.removeItem("piq-last-active"); } catch {}
      router.replace("/");
    }
  }
  async function reset() {
    setErr(""); setInfo("");
    if (!email) return setErr("Type your email above first, then click “Forgot password?”.");
    const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) setErr(error.message); else setInfo("If that email has an account, a reset link is on its way.");
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="rounded-3xl border border-line bg-white p-7 shadow-sm sm:p-9">
          <h1 className="text-[22px] font-semibold">{signup ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-1 text-muted">{signup ? "Free to start. No credit card." : "Log in to see what needs your attention today."}</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email"><input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password"><input className="field" type="password" autoComplete={signup ? "new-password" : "current-password"} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            {err && <p role="alert" className="text-sm font-medium text-rose">{err}</p>}
            {info && <p role="status" className="rounded-xl bg-teal-t px-4 py-3 text-sm font-medium text-teal-d">{info}</p>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "One moment…" : signup ? "Create account" : "Log in"}</Button>
          </form>
          {!signup && <button onClick={reset} className="mt-4 text-sm font-semibold text-teal-d hover:underline">Forgot password?</button>}
        </div>
        {!signup && <p className="mt-6 text-center text-sm text-muted">Invite-only. Ask your administrator for access.</p>}
      </div>
    </main>
  );
}
