import type { SupabaseClient } from "@supabase/supabase-js";
import type { Port } from "./engine/engine";
import { sendMail } from "./mail";
import { sendMessage } from "./messaging";

/** Server-side Port: real emails (Resend) and texts (Twilio). */
export function serverPort(sb: SupabaseClient, baseUrl: string, ownerId?: string): Port {
  return {
    now: () => Date.now(),
    async email(o) {
      const r = await sendMail({ sb, ownerId, to: o.to, subject: o.subject, body: o.body, contactId: o.contactId, marketing: o.marketing, toOwner: !o.contactId, baseUrl, design: o.design, vars: o.vars, trackId: o.trackId });
      return r.ok ? { status: "sent" } : { status: o.contactId || r.code !== 400 ? "failed" : "skipped", error: r.error };
    },
    async sms(o) {
      const r = await sendMessage({ sb, ownerId, channel: o.channel ?? "sms", to: o.to, body: o.body, contactId: o.contactId, template: o.template });
      return r.ok ? { status: "sent" } : { status: r.skipped ? "skipped" : "failed", error: r.error };
    },
  };
}
