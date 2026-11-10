"use client";
import type { ReactNode } from "react";
import { CrmProvider } from "@/lib/store";
import { McShell } from "@/components/McShell";

/** Marketing Cloud: its own workspace and navigation, opened in a separate window from the CRM. */
export default function McLayout({ children }: { children: ReactNode }) {
  return (
    <CrmProvider>
      <McShell>{children}</McShell>
    </CrmProvider>
  );
}
