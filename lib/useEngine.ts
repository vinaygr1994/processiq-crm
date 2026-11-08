"use client";
import { useCallback, useRef } from "react";
import { isDemo } from "./config";
import { callApi } from "./api";
import { nowMs } from "./clock";
import { runEngine, type Port, type Summary } from "./engine/engine";
import { localDb } from "./engine/localdb";
import { useCrm } from "./store";

/** Demo storage can't send anything for real, so the demo "sends" are only recorded. */
const demoPort: Port = { now: nowMs, email: async () => ({ status: "demo" }), sms: async () => ({ status: "demo" }) };

/** Returns a function that checks for anything the workflows should do right now. */
export function useEngine() {
  const { reload } = useCrm();
  const busy = useRef(false);
  const reloadRef = useRef(reload); reloadRef.current = reload;
  return useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const s = isDemo ? await runEngine(localDb, demoPort) : await callApi<Summary>("/api/workflows/run", {});
      if (s.enrolled || s.steps || s.sent) await reloadRef.current();
    } catch { /* the scheduler will try again shortly */ } finally { busy.current = false; }
  }, []);
}
