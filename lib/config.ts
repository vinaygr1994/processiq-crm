export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
/** Demo mode = no Supabase configured. Data stays in this browser and nothing is really emailed. */
export const isDemo = !SUPABASE_URL || !SUPABASE_ANON;
