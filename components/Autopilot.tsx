"use client";
import { useEffect, useRef } from "react";
import { useCrm } from "@/lib/store";
import { useEngine } from "@/lib/useEngine";
import { STARTERS } from "@/lib/engine/starters";

/** Keeps workflows moving while the CRM is open (the server scheduler does the same when it isn't). */
export function Autopilot() {
  const { ready, data, settings, add, saveSettings } = useCrm();
  const run = useEngine();
  const ref = useRef(run); ref.current = run;
  const installed = useRef(false);

  // First login: install the starter workflows once.
  useEffect(() => {
    if (!ready || installed.current || data.workflows.length > 0 || settings?.starters_installed) return;
    installed.current = true;
    (async () => {
      const at = new Date().toISOString();
      for (const w of STARTERS) await add("workflows", { ...w, active: true, activated_at: at });
      await saveSettings({ starters_installed: true });
    })();
  }, [ready, data.workflows.length, settings?.starters_installed, add, saveSettings]);

  useEffect(() => {
    if (!ready) return;
    const t0 = setTimeout(() => ref.current(), 1200);
    const id = setInterval(() => ref.current(), 30000);
    const now = () => ref.current();
    window.addEventListener("piq-clock", now);
    window.addEventListener("piq-kick", now);
    return () => { clearTimeout(t0); clearInterval(id); window.removeEventListener("piq-clock", now); window.removeEventListener("piq-kick", now); };
  }, [ready]);
  return null;
}
