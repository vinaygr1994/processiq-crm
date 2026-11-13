// Applies supabase/schema.sql to the database before every build, so a deploy can
// never ship features whose tables don't exist yet. The file is safe to run any
// number of times (every statement is "if not exists" / "create or replace").
//
// Needs SUPABASE_DB_URL (Supabase → Connect → Session pooler connection string).
// Without it the build continues and only prints a warning.
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
const sql = postgres(url, { ssl: /sslmode=disable/.test(url) ? false : "require", max: 1, prepare: false, onnotice: () => {}, connect_timeout: 20 });

try {
  const t0 = Date.now();
  await sql.unsafe(schema);
  await sql.unsafe("notify pgrst, 'reload schema'");
  console.log(`[migrate] Database is up to date (${Date.now() - t0} ms).`);
} catch (e) {
  console.error(`[migrate] Database update failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
