"use client";
import { useMemo } from "react";
import { useCrm } from "./store";
import { STAGES } from "./stages";

/** The pipeline stages with the account's own names applied. Stage ids never change, so workflows keep working. */
export function useStages() {
  const { settings } = useCrm();
  const labels = settings?.stage_labels;
  return useMemo(() => {
    const list = STAGES.map((s) => ({ ...s, label: labels?.[s.id]?.trim() || s.label }));
    const name = (id: string) => list.find((s) => s.id === id)?.label ?? id;
    return { stages: list, name };
  }, [labels]);
}
