import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isDemo, SUPABASE_ANON, SUPABASE_URL } from "./config";

export interface Authed { user: User; sb: SupabaseClient }

/** Verifies the bearer token and returns a Supabase client that acts as that user (RLS applies). */
export async function authed(req: Request): Promise<Authed | null> {
  if (isDemo) return null;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = createClient(SUPABASE_URL!, SUPABASE_ANON!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, sb };
}

export const serviceClient = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !SUPABASE_URL) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
};

const secret = () => process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const signId = (id: string) => createHmac("sha256", secret()).update(id).digest("hex");
export function verifyId(id: string, sig: string) {
  if (!secret() || !sig) return false;
  const a = Buffer.from(signId(id)), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const appUrl = (req: Request) =>
  process.env.APP_URL?.replace(/\/$/, "") ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : new URL(req.url).origin);

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Records one open or click for an email (every one, not just the first). Never throws: tracking must not break the redirect. */
export async function logEvent(sb: SupabaseClient, emailId: string, kind: "open" | "click", url = "") {
  try {
    const { data } = await sb.from("emails").select("owner_id").eq("id", emailId).maybeSingle();
    if (!data?.owner_id) return;
    await sb.from("email_events").insert({ owner_id: data.owner_id, email_id: emailId, kind, url: url.slice(0, 2000) });
  } catch { /* table not created yet, or a hiccup: the first open/click is still on the email */ }
}
