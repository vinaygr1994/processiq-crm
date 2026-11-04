"use client";
import { useEffect, useRef } from "react";
import { useCrm } from "@/lib/store";
import { useFlow } from "@/lib/flow";

/** Runs the time-based automations (chase, reminders, follow-ups…) while the CRM is open. */
export function Autopilot() {
  const { ready } = useCrm();
  const flow = useFlow();
  const ref = useRef(flow.runDue);
  ref.current = flow.runDue;
  useEffect(() => {
    if (!ready) return;
    const t0 = setTimeout(() => ref.current(), 1200);
    const id = setInterval(() => ref.current(), 30000);
    const onSkip = () => ref.current();
    window.addEventListener("piq-clock", onSkip);
    return () => { clearTimeout(t0); clearInterval(id); window.removeEventListener("piq-clock", onSkip); };
  }, [ready]);
  return null;
}
