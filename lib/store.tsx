"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isDemo } from "./config";
import { backend, resetDemo } from "./db";
import { resetClock } from "./clock";
import { supabase } from "./supabase";
import { can, type Action } from "./perm";
import type { Role, NewRow, Rows, Settings, TableName, Tables } from "./types";

const EMPTY: Rows = { data_extensions: [], de_rows: [], messages: [], contacts: [], deals: [], visits: [], autolog: [], tasks: [], activities: [], templates: [], campaigns: [], emails: [], settings: [], workflows: [], workflow_runs: [], segments: [], forms: [], form_submissions: [], services: [], bookings: [], plans: [], memberships: [], org_members: [], objects: [], records: [] };
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
  const seq = useRef(0);

  const toast = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3000);
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await backend.loadAll());
    } catch (e) {
      toast(`Couldn't load your data: ${(e as Error).message}`, "error");
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
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      setUserEmail(session.user.email ?? "");
      load();
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [load, router]);

  const add: Ctx["add"] = useCallback(async (t, row) => {
    try {
      const created = await backend.insert(t, row);
      setData((d) => ({ ...d, [t]: [created, ...(d[t] as Tables[typeof t][])] }) as Rows);
      return created;
    } catch (e) {
      toast(`Couldn't save: ${(e as Error).message}`, "error");
      return null;
    }
  }, [toast]);

  const update: Ctx["update"] = useCallback(async (t, id, patch) => {
    setData((d) => ({ ...d, [t]: (d[t] as Tables[typeof t][]).map((r) => (r.id === id ? { ...r, ...patch } : r)) }) as Rows);
    try {
      await backend.update(t, id, patch);
    } catch (e) {
      toast(`Couldn't save: ${(e as Error).message}`, "error");
      load();
    }
  }, [toast, load]);

  const remove: Ctx["remove"] = useCallback(async (t, id) => {
    setData((d) => ({ ...d, [t]: (d[t] as Tables[typeof t][]).filter((r) => r.id !== id) }) as Rows);
    try {
      await backend.remove(t, id);
    } catch (e) {
      toast(`Couldn't delete: ${(e as Error).message}`, "error");
      load();
    }
  }, [toast, load]);

  const removeMany: Ctx["removeMany"] = useCallback(async (t, ids) => {
    const gone = new Set(ids);
    setData((d) => ({ ...d, [t]: (d[t] as Tables[typeof t][]).filter((r) => !gone.has(r.id)) }) as Rows);
    try {
      await backend.removeMany(t, ids);
    } catch (e) {
      toast(`Couldn't delete: ${(e as Error).message}`, "error");
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
    () => ({ data, ready, userEmail, me, can: canDo, team, settings, add, update, remove, removeMany, saveSettings, reload: load, signOut, resetDemoData, toast, toasts }),
    [data, ready, userEmail, me, canDo, team, settings, add, update, remove, removeMany, saveSettings, load, signOut, resetDemoData, toast, toasts],
  );
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}
