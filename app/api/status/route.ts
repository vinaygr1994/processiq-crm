import { isDemo } from "@/lib/config";
import { json } from "@/lib/server";

export const dynamic = "force-dynamic";
export function GET() {
  return json({
    demo: isDemo,
    email: !isDemo && !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL,
    ai: !isDemo && !!process.env.ANTHROPIC_API_KEY,
    unsubscribe: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    from: process.env.RESEND_FROM_EMAIL ?? "",
  });
}
