"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isDemo } from "./config";
import { backend, resetDemo } from "./db";
import { resetClock } from "./clock";
import { supabase } from "./supabase";
import { friendlyDbError } from "./dbErrors";
import { can, type Action } from "./perm";
import type { Role, NewRow, Rows, Settings, TableName, Tables } from "./types";

/** Log out after this long with no clicks, typing or scrolling in any CRM tab. */
const IDLE_LIMIT_MS = 60 * 60 * 1000;
const ACTIVE_KEY = "piq-last-active";
let lastWrite = 0;
function markActive() {
  const now = Date.now();
  if (now - lastWrite < 15_000) return; // throttle storage writes
  lastWrite = now;
  try { localStorage.setItem(ACTIVE_KEY, String(now)); } catch {}
}
function idleTooLong() {
  try {
    const v = Number(localStorage.getItem(ACTIVE_KEY));
    return v > 0 && Date.now() - v > IDLE_LIMIT_MS;
  } catch { return false; }
}

const EMPTY: Rows = { suppressions: [], data_extensions: [], de_rows: [], messages: [], contacts: [], deals: [], visits: [], autolog: [], tasks: [], activities: [], templates: [], campaigns: [], emails: [], settings: [], workflows: [], workflow_runs: [], segments: [], forms: [], form_submissions: [], services: [], bookings: [], plans: [], memberships: [], org_members: [], objects: [], records: [] };
export interface Toast { id: number; text: string; tone: "ok" | "error" }

interface Ctx {
  data: Rows;
  ready: boolean;
  userEmail: string;
  /** Who is signed in, their role and permissions. */
  me: { role: Role; name: string; ownOnly: boolean; email: string };
  can: (a: Action) => boolean;
  /** Everyone work can be assigned to (active and invited team members, plus rotation names). */
  team: string[];
  settings: Settings | null;
  add: <T extends TableName>(t: T, row: NewRow<T>) => Promise<Tables[T] | null>;
  update: <T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>) => Promise<void>;
  remove: (t: TableName, id: string) => Promise<void>;
  removeMany: (t: TableName, ids: string[]) => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
  resetDemoData: () => Promise<void>;
  toast: (text: string, tone?: "ok" | "error") => void;
  toasts: Toast[];
  /** Database schema version (null = not checked yet / demo; 0 = older than version tracking). */
  dbVersion: number | null;
}
const CrmContext = createContext<Ctx | null>(null);
export const useCrm = () => {
  const c = useContext(CrmContext);
  if (!c) throw new Error("useCrm outside provider");
  return c;
};

export function CrmProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [data, setData] = useState<Rows>(EMPTY);
  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState(isDemo ? "demo@processiq.crm" : "");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dbVersion, setDbVersion] = useState<number | null>(null);
  const seq = useRef(0);

  const toast = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3000);
  }, []);

  const load = useCallback(async () => {
    if (!isDemo) supabase().from("crm_meta").select("value").eq("key", "schema_version").maybeSingle()
      .then(({ data, error }) => setDbVersion(error ? 0 : Number(data?.value) || 0), () => setDbVersion(0));
    try {
      setData(await backend.loadAll());
    } catch (e) {
      toast(`Couldn't load your data: ${friendlyDbError((e as Error).message)}`, "error");
    } finally {
      setReady(true);
    }
  }, [toast]);

  useEffect(() => {
    if (isDemo) {
      load();
      return;
    }
    const sb = supabase();
    // A reset link that lands on the app root still has to go through "choose a new password".
    if (/type=recovery/.test(window.location.hash)) { router.replace("/reset-password" + window.location.hash); return; }
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { router.replace("/reset-password"); return; }
      if (!session) router.replace("/login");
    });
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      if (idleTooLong()) {
        try { localStorage.removeItem(ACTIVE_KEY); } catch {}
        await sb.auth.signOut();
        router.replace("/login?reason=idle");
        return;
      }
      markActive();
      setUserEmail(session.user.email ?? "");
      load();
    });
    return () => sub.subscription.unsubscribe();
  }, [load, router]);

  // Sign out automatically after a period with no activity (shared across tabs).
  useEffect(() => {
    if (isDemo) return;
    const bump = () => markActive();
    const events = ["pointerdown", "keydown", "scroll", "visibilitychange"] as const;
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    const check = async () => {
      if (!idleTooLong()) return;
      try { localStorage.removeItem(ACTIVE_KEY); } catch {}
      await supabase().auth.signOut();
      router.replace("/login?reason=idle");
    };
    const iv = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => { events.forEach((ev) => window.removeEventListener(ev, bump)); window.clearInterval(iv); window.removeEventListener("focus", check); };
  }, [router]);

  const add: Ctx["add"] = useCallback(async (t, row) => {
    try {
      const created = await backend.insert(t, row);
      setData((d) => ({ ...d, [t]: [created, ...(d[t] as Tables[typeof t][])] }) as Rows);
      return created;
    } catch (e) {
      toast(`Couldn't save: ${friendlyDbError((e as Error).message)}`, "error");
      return null;
    }
  }, [toast]);

  const update: Ctx["update"] = useCallback(async (t, id, patch) => {
    setData((d) => ({ ...d, [t]: (d[t] as Tables[typeof t][]).map((r) => (r.id === id ? { ...r, ...patch } : r)) }) as Rows);
    try {
      await backend.update(t, id, patch);
    } catch (e) {
      toast(`Couldn't save: ${friendlyDbError((e as Error).message)}`, "error");
      load();
    }
  }, [toast, load]);

  const remove: Ctx["remove"] = useCallback(async (t, id) => {
    setData((d) => ({ ...d, [t]: (d[t] as Tables[typeof t][]).filter((r) => r.id !== id) }) as Rows);
    try {
      await backend.remove(t, id);
    } catch (e) {
      toast(`Couldn't delete: ${friendlyDbError((e as Error).message)}`, "error");
      load();
    }
  }, [toast, load]);

  const removeMany: Ctx["removeMany"] = useCallback(async (t, ids) => {
    const gone = new Set(ids);
    setData((d) => ({ ...d, [t]: (d[t] as Tables[typeof t][]).filter((r) => !gone.has(r.id)) }) as Rows);
    try {
      await backend.removeMany(t, ids);
    } catch (e) {
      toast(`Couldn't delete: ${friendlyDbError((e as Error).message)}`, "error");
      load();
    }
  }, [toast, load]);

  const settings = data.settings[0] ?? null;
  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    if (settings) await update("settings", settings.id, patch);
    else
      await add("settings", { business_name: "", sender_name: "", reply_to: "", address: "", signature: "", reps: [], owner_email: "", review_link: "", booking_link: "", automations_off: [], rr_index: 0, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", starters_installed: false, stage_labels: {}, custom_fields: [], intake_key: Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""), ...patch });
  }, [settings, update, add]);

  useEffect(() => {
    if (isDemo || !userEmail) return;
    const m = data.org_members.find((x) => x.email.toLowerCase() === userEmail.toLowerCase());
    if (m?.status === "invited") supabase().rpc("crm_accept").then(() => {}, () => {});
  }, [data.org_members, userEmail]);
  const me = useMemo(() => {
    const m = data.org_members.find((x) => x.email.toLowerCase() === userEmail.toLowerCase() && x.status !== "disabled" && !isDemo);
    return { role: (m?.role ?? "owner") as Role, name: m?.name ?? (settings?.sender_name?.split(" from ")[0] || "Owner"), ownOnly: !!m?.own_only, email: userEmail };
  }, [data.org_members, userEmail, settings?.sender_name]);
  const canDo = useCallback((a: Action) => can(me.role, a), [me.role]);
  const team = useMemo(() => [...new Set([...(settings?.reps ?? []), ...data.org_members.filter((m) => m.status !== "disabled").map((m) => m.name).filter(Boolean)])], [settings?.reps, data.org_members]);

  const signOut = useCallback(async () => {
    if (isDemo) return;
    try { localStorage.removeItem(ACTIVE_KEY); } catch {}
    await supabase().auth.signOut();
    router.replace("/login");
  }, [router]);

  const resetDemoData = useCallback(async () => {
    resetDemo();
    resetClock();
    await load();
    toast("Demo data reset");
  }, [load, toast]);

  const value = useMemo<Ctx>(
    () => ({ data, ready, userEmail, me, can: canDo, team, settings, add, update, remove, removeMany, saveSettings, reload: load, signOut, resetDemoData, toast, toasts, dbVersion }),
    [data, ready, userEmail, me, canDo, team, settings, add, update, remove, removeMany, saveSettings, load, signOut, resetDemoData, toast, toasts, dbVersion],
  );
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}
