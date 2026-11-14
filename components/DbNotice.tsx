"use client";
import { useState } from "react";
import { useCrm } from "@/lib/store";
import { SCHEMA_VERSION } from "@/lib/schemaVersion";

/** Tells the account owner (only) when the database is behind the app, with the fix. Team members never see it. */
export function DbNotice() {
  const { dbVersion, me } = useCrm();
  const [open, setOpen] = useState(false);
  if (dbVersion === null || dbVersion >= SCHEMA_VERSION || (me.role !== "owner" && me.role !== "admin")) return null;
  return (
    <div className="border-b border-[#f3c1c1] bg-[#fff1f1] px-4 py-1.5 text-center text-[12.5px] text-[#8a1f1f]">
      <strong>Database update needed</strong> (version {dbVersion || "unknown"} of {SCHEMA_VERSION}). Some newer features won&apos;t save until it&apos;s done.{" "}
      <button type="button" onClick={() => setOpen(!open)} className="font-semibold underline">{open ? "Hide" : "How to fix"}</button>
      {open && <span className="mt-1 block">In Supabase open <strong>SQL Editor → New query</strong>, paste all of <strong>supabase/schema.sql</strong> and click <strong>Run</strong>. Or set <strong>SUPABASE_DB_URL</strong> in Vercel (Session pooler string) and redeploy, and it updates itself on every deploy.</span>}
    </div>
  );
}
