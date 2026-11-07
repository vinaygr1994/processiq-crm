export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
/** Demo mode = no Supabase configured. Data stays in this browser and nothing is really emailed. */
export const isDemo = !SUPABASE_URL || !SUPABASE_ANON;

/** Supabase says which column is unknown when a migration hasn't been run yet. */
export const missingColumn = (msg: string) => /column "?([a-z_]+)"? (?:of relation "?\w+"? )?does not exist/i.exec(msg)?.[1] ?? /Could not find the '([a-z_]+)' column/i.exec(msg)?.[1] ?? null;
