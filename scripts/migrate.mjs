// Brings the database up to date before every build, so a deploy never ships features
// whose tables or columns don't exist yet. supabase/schema.sql is safe to run any number
// of times (every statement is "if not exists" / "create or replace").
//
// Production (VERCEL_ENV=production) is strict: if the database can't be updated, the build
// fails on purpose. Vercel then keeps the previous working version live, so clients never see
// half-finished features. Preview and local builds only warn.
//
// Needs SUPABASE_DB_URL (Supabase → Connect → Session pooler connection string, real password).
// Emergency override: set SKIP_DB_MIGRATE=1 to deploy without touching the database.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const strict = process.env.VERCEL_ENV === "production" && process.env.SKIP_DB_MIGRATE !== "1";
const fail = (msg) => {
  if (strict) {
    console.error(`\n[migrate] DEPLOY STOPPED: ${msg}`);
    console.error("[migrate] Your previous version stays live, so clients are not affected.");
    console.error("[migrate] Fix: Vercel → Settings → Environment Variables → SUPABASE_DB_URL = Supabase → Connect → Session pooler string with your real database password. Then Redeploy.\n");
    process.exit(1);
  }
  console.warn(`[migrate] WARNING: ${msg} (not production, continuing)`);
  process.exit(0);
};

// 1. The schema file and the app must agree on the version.
const schema = readFileSync(fileURLToPath(new URL("../supabase/schema.sql", import.meta.url)), "utf8");
const sections = [...schema.matchAll(/^-- ===== (\d+)_/gm)].map((m) => Number(m[1]));
const latest = Math.max(...sections);
const recorded = Number(/values \('schema_version', '(\d+)'/.exec(schema)?.[1]);
const app = Number(/SCHEMA_VERSION = (\d+)/.exec(readFileSync(fileURLToPath(new URL("../lib/schemaVersion.ts", import.meta.url)), "utf8"))?.[1]);
if (latest !== recorded || latest !== app) {
  console.error(`[migrate] Version mismatch: schema.sql has section ${latest}, records version ${recorded}, app expects ${app}. Update all three to match.`);
  process.exit(1);
}

if (process.env.SKIP_DB_MIGRATE === "1") { console.warn("[migrate] SKIP_DB_MIGRATE=1: database not updated."); process.exit(0); }
const url = process.env.SUPABASE_DB_URL;
if (!url) fail("SUPABASE_DB_URL is not set, so the database can't be updated.");
if (/\[YOUR-PASSWORD\]/i.test(url)) fail("SUPABASE_DB_URL still contains [YOUR-PASSWORD]. Replace it with your real database password.");
if (/db\.[a-z0-9]+\.supabase\.co/i.test(url)) fail("SUPABASE_DB_URL is the Direct connection string, which Vercel can't reach. Use the Session pooler string (it contains pooler.supabase.com).");

// 2. Apply it.
let sql;
try {
  sql = postgres(url, { ssl: /sslmode=disable/.test(url) ? false : "require", max: 1, prepare: false, onnotice: () => {}, connect_timeout: 20 });
  const t0 = Date.now();
  await sql.unsafe(schema);
  await sql.unsafe("notify pgrst, 'reload schema'");
  const [row] = await sql`select value from public.crm_meta where key = 'schema_version'`;
  console.log(`[migrate] Database is at version ${row?.value} (${Date.now() - t0} ms).`);
} catch (e) {
  // Never print the URL itself: it contains the database password.
  const msg = String(e?.message ?? e).replace(url, "<SUPABASE_DB_URL>");
  const hint = /password authentication failed/i.test(msg) ? " The database password in SUPABASE_DB_URL is wrong (reset it in Supabase → Project Settings → Database)."
    : /ENOTFOUND|getaddrinfo|timeout|ECONNREFUSED/i.test(msg) ? " The database couldn't be reached. Use the Session pooler string." : "";
  try { await sql?.end({ timeout: 5 }); } catch {}
  fail(`database update failed: ${msg}.${hint}`);
}
try { await sql?.end({ timeout: 5 }); } catch {}
