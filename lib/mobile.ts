"use client";
import { useCallback, useEffect, useState } from "react";
import { callApi } from "./api";
import { isDemo } from "./config";
import { fill } from "./format";
import { useCrm } from "./store";
import type { Channel, Contact } from "./types";

export interface ChannelStatus { sms: boolean; whatsapp: boolean; smsInbound: boolean; whatsappInbound: boolean; twilioWebhook: string; whatsappWebhook: string }
export interface WaTemplate { name: string; lang: string; params: string[] }
export const CH: Record<Channel, { label: string; color: string; icon: string }> = { sms: { label: "SMS", color: "#3b6fd9", icon: "chat" }, whatsapp: { label: "WhatsApp", color: "#1c9d5b", icon: "phone" } };

/** SMS is billed in parts: 160 characters for plain text, 70 when it contains emoji or other special characters. */
export function smsParts(text: string) {
  const plain = /^[\x20-\x7E\n\r£¥èéùìòÇØøÅåÆæßÉÄÖÑÜäöñüà€]*$/.test(text);
  const one = plain ? 160 : 70, many = plain ? 153 : 67;
  return { parts: text.length === 0 ? 0 : text.length <= one ? 1 : Math.ceil(text.length / many), plain, left: text.length <= one ? one - text.length : many - (text.length % many || many) };
}

export function useChannelStatus() {
  const [st, setSt] = useState<ChannelStatus | null>(null);
  useEffect(() => {
    if (isDemo) return;
    let on = true;
    callApi<ChannelStatus>("/api/messages/status", {}).then((r) => on && setSt(r)).catch(() => on && setSt({ sms: false, whatsapp: false, smsInbound: false, whatsappInbound: false, twilioWebhook: "", whatsappWebhook: "" }));
    return () => { on = false; };
  }, []);
  return isDemo ? ({ sms: true, whatsapp: true, smsInbound: true, whatsappInbound: true, twilioWebhook: "", whatsappWebhook: "" } as ChannelStatus) : st;
}

export function useSendMessage() {
  const { add, reload } = useCrm();
  return useCallback(async (channel: Channel, contacts: Contact[], body: string, template?: WaTemplate) => {
    if (isDemo) {
      let sent = 0, skipped = 0;
      for (const c of contacts) {
        if (!c.phone.trim() || (channel === "sms" && c.sms_opt_out)) { skipped++; continue; }
        await add("messages", { contact_id: c.id, channel, direction: "out", phone: c.phone, body: fill(body, c) || `Template: ${template?.name}`, template: template?.name ?? "", status: "demo", error: "", provider_id: "", read: true });
        sent++;
      }
      return { sent, failed: 0, skipped, errors: [] as string[] };
    }
    const r = await callApi<{ sent: number; failed: number; skipped: number; errors: string[] }>("/api/messages/send", { channel, contactIds: contacts.map((c) => c.id), body, template });
    await reload();
    return r;
  }, [add, reload]);
}
