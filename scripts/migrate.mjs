// Applies supabase/schema.sql to the database before every build, so a deploy can
// never ship features whose tables don't exist yet. The file is safe to run any
// number of times (every statement is "if not exists" / "create or replace").
//
// Needs SUPABASE_DB_URL (Supabase → Connect → Session pooler connection string).
// Without it, or if the database can't be reached, the build continues and only
// prints a warning: a database problem must never block a deploy.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.warn("[migrate] SUPABASE_DB_URL is not set, skipping database update. New features may fail until supabase/schema.sql is run.");
  process.exit(0);
}

const file = fileURLToPath(new URL("../supabase/schema.sql", import.meta.url));
const schema = readFileSync(file, "utf8");
let sql;
try {
  sql = postgres(url, { ssl: /sslmode=disable/.test(url) ? false : "require", max: 1, prepare: false, onnotice: () => {}, connect_timeout: 20 });
  const t0 = Date.now();
  await sql.unsafe(schema);
  await sql.unsafe("notify pgrst, 'reload schema'");
  console.log(`[migrate] Database is up to date (${Date.now() - t0} ms).`);
} catch (e) {
  // Never print the URL itself: it contains the database password.
  console.warn(`[migrate] WARNING: database update skipped: ${String(e?.message ?? e).replace(url, "<SUPABASE_DB_URL>")}`);
  console.warn("[migrate] Check SUPABASE_DB_URL in Vercel (use the Session pooler string, with your real password), or run supabase/schema.sql in the Supabase SQL Editor.");
} finally {
  try { await sql?.end({ timeout: 5 }); } catch {}
}
process.exitCode = 0;
