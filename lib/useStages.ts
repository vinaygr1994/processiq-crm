"use client";
import { useMemo } from "react";
import { useCrm } from "./store";
import { pipelinesOf, type Pipeline } from "./pipelines";

/** All pipelines, plus the main pipeline's stages and a name lookup across every pipeline. */
export function useStages() {
  const { settings } = useCrm();
  return useMemo(() => {
    const pipelines: Pipeline[] = pipelinesOf(settings);
    const stages = pipelines[0].stages;
    const all = pipelines.flatMap((p) => p.stages);
    const name = (id: string) => all.find((s) => s.id === id)?.label ?? id.replace(/_/g, " ");
    return { stages, name, pipelines };
  }, [settings]);
}
