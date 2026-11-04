import { callApi } from "./api";

export interface AiResult<T> { result: T; live: boolean }

export const aiDraftEmail = (p: {
  goal: string; contact: { name: string; company: string }; business: string; sender: string;
  recent: string[]; previous?: { subject: string; body: string };
}) => callApi<AiResult<{ subject: string; body: string }>>("/api/ai", { task: "draft_email", ...p });

export const aiSummarize = (p: {
  contact: { name: string; company: string; tags: string[] };
  activities: { kind: string; body: string; when: string }[];
  deals: { title: string; value: number; stage: string }[];
  tasks: { title: string; due: string | null; done: boolean }[];
}) => callApi<AiResult<{ summary: string; next_step: string }>>("/api/ai", { task: "summarize", ...p });

export const aiToday = (p: {
  overdue: { title: string; who: string }[];
  stale: { deal: string; who: string; days: number; value: number }[];
  fresh: { name: string; company: string; days: number }[];
}) => callApi<AiResult<{ items: string[] }>>("/api/ai", { task: "today", ...p });
