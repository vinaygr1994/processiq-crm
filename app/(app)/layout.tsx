"use client";
import type { ReactNode } from "react";
import { CrmProvider } from "@/lib/store";
import { Shell } from "@/components/Shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <CrmProvider>
      <Shell>{children}</Shell>
    </CrmProvider>
  );
}
