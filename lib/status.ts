"use client";
import { useEffect, useState } from "react";

export interface Status { demo: boolean; email: boolean; ai: boolean; unsubscribe: boolean; from: string }
let cache: Status | null = null;
export function useStatus() {
  const [s, setS] = useState<Status | null>(cache);
  useEffect(() => {
    if (cache) return;
    fetch("/api/status").then((r) => r.json()).then((j: Status) => { cache = j; setS(j); }).catch(() => {});
  }, []);
  return s;
}
