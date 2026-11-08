import type { SupabaseClient } from "@supabase/supabase-js";
import type { Db } from "./engine";
import { missingColumn } from "../config";
import type { Tables } from "../types";

/** Supabase storage. With a service-role client pass the owner's id so every query is scoped to that one user. */
export function supaDb(sb: SupabaseClient, ownerId?: string): Db {
  return {
    async list(t) {
      const out: unknown[] = [];
      for (let from = 0; from < 20000; from += 1000) {
        let q = sb.from(t).select("*").order("created_at", { ascending: false }).range(from, from + 999);
        if (ownerId) q = q.eq("owner_id", ownerId);
        const { data, error } = await q;
        if (error) throw new Error(`${t}: ${error.message}`);
        out.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return out as Tables[typeof t][];
    },
    async insert(t, row) {
      let r: Record<string, unknown> = ownerId ? { ...row, owner_id: ownerId } : { ...row };
      for (let i = 0; i < 6; i++) {
        const { data, error } = await sb.from(t).insert(r as never).select().single();
        if (!error) return data as Tables[typeof t];
        const col = missingColumn(error.message);
        if (!col || !(col in r)) throw new Error(`${t}: ${error.message}`);
        r = { ...r }; delete r[col];
      }
      throw new Error(`${t}: insert failed`);
    },
    async update(t, id, patch) {
      const { error } = await sb.from(t).update(patch as never).eq("id", id);
      if (error) throw new Error(`${t}: ${error.message}`);
    },
    async claim(runId, lockUntil, nowIso) {
      const { data, error } = await sb.from("workflow_runs").update({ locked_until: lockUntil }).eq("id", runId).eq("status", "active").or(`locked_until.is.null,locked_until.lt.${nowIso}`).select("id");
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },
    async claimCampaign(id, leaseUntil, nowIso) {
      const { data, error } = await sb.from("campaigns").update({ status: "sending", scheduled_at: leaseUntil }).eq("id", id).in("status", ["scheduled", "sending"]).lte("scheduled_at", nowIso).select("id");
      if (error) return false;
      return (data?.length ?? 0) > 0;
    },
  };
}
