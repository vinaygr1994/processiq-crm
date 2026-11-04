import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON) throw new Error("Supabase is not configured");
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON);
  return client;
}
