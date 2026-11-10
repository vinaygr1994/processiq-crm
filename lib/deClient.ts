"use client";
import { useCallback } from "react";
import { isDemo } from "./config";
import { supabase } from "./supabase";
import { useCrm } from "./store";

/** Adds many records to a data extension in one go (CSV import, filtered copies). */
export function useDeBulk() {
  const { add, reload } = useCrm();
  return useCallback(async (deId: string, rows: Record<string, string>[]) => {
    if (isDemo) { for (const data of rows) await add("de_rows", { de_id: deId, data }); return rows.length; }
    let n = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { error, data } = await supabase().from("de_rows").insert(rows.slice(i, i + 500).map((data) => ({ de_id: deId, data }))).select("id");
      if (error) throw new Error(error.message);
      n += data?.length ?? 0;
    }
    await reload();
    return n;
  }, [add, reload]);
}
