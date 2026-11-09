// Sales pipelines: any number of pipelines with their own stages, win probabilities and won/lost outcomes,
// plus ready-made pipelines for common industries. Stage ids are stable so workflows and reports keep working.
import type { Deal, Settings } from "./types";

export type StageKind = "open" | "won" | "lost";
export interface PStage { id: string; label: string; prob: number; kind: StageKind }
export interface Pipeline { id: string; name: string; stages: PStage[] }

const S = (id: string, label: string, prob: number, kind: StageKind = "open"): PStage => ({ id, label, prob, kind });
const WON = (label = "Won") => S("won", label, 100, "won"), LOST = (label = "Lost") => S("lost", label, 0, "lost");

export interface Template { id: string; name: string; industry: string; stages: PStage[]; interests: string[] }
export const TEMPLATES: Template[] = [
  { id: "general", name: "Sales pipeline", industry: "General sales (any business)", interests: ["New customer", "Upgrade", "Renewal", "Consulting", "Other"],
    stages: [S("new", "New lead", 10), S("contacted", "Contacted", 20), S("qualified", "Qualified", 35), S("visit_booked", "Meeting booked", 50), S("quoted", "Proposal sent", 65), S("negotiation", "Negotiation", 80), WON("Closed won"), LOST("Closed lost")] },
  { id: "clinic", name: "Patient pipeline", industry: "Cosmetic and aesthetic clinic", interests: ["Botox / injectables", "Dermal fillers", "Laser treatment", "Skin care / facial", "Body contouring", "Hair removal", "Other"],
    stages: [S("new", "New inquiry", 10), S("contacted", "Contacted", 20), S("visit_booked", "Consultation booked", 45), S("visit_done", "Consultation done", 60), S("quoted", "Treatment plan sent", 75), WON("Treatment booked"), S("completed", "Treatment complete", 100, "won"), LOST()] },
  { id: "medical", name: "Patient pipeline", industry: "Medical, dental and health clinic", interests: ["New patient exam", "Physiotherapy", "Chiropractic", "Dental treatment", "Massage therapy", "Mental health", "Other"],
    stages: [S("new", "New inquiry", 10), S("contacted", "Contacted", 25), S("visit_booked", "Assessment booked", 50), S("visit_done", "Assessment done", 65), S("quoted", "Care plan presented", 80), WON("Became a patient"), LOST("Did not proceed")] },
  { id: "fitness", name: "Membership pipeline", industry: "Fitness, yoga and wellness studio", interests: ["Membership", "Personal training", "Class pack", "Corporate wellness", "Other"],
    stages: [S("new", "New lead", 10), S("contacted", "Contacted", 25), S("visit_booked", "Trial booked", 45), S("visit_done", "Trial attended", 65), S("quoted", "Offer made", 80), WON("Joined"), LOST("Didn't join")] },
  { id: "home", name: "Job pipeline", industry: "Home services and renovation", interests: ["Kitchen remodel", "Bathroom remodel", "Basement finishing", "Home addition", "Roofing / exterior", "Flooring", "Other"],
    stages: [S("new", "New lead", 10), S("contacted", "Contacted", 20), S("visit_booked", "Site visit booked", 40), S("visit_done", "Site visit done", 55), S("quoted", "Quote sent", 70), WON("Won"), S("completed", "Job complete", 100, "won"), LOST()] },
  { id: "services", name: "Client pipeline", industry: "Professional services and agencies", interests: ["Retainer", "Project", "Audit", "Training", "Other"],
    stages: [S("new", "New lead", 10), S("qualified", "Qualified", 25), S("visit_booked", "Discovery call booked", 40), S("quoted", "Proposal sent", 60), S("negotiation", "Negotiation", 80), WON("Signed"), LOST()] },
  { id: "realestate", name: "Buyer pipeline", industry: "Real estate", interests: ["Buying", "Selling", "Renting", "Investment", "Other"],
    stages: [S("new", "New lead", 10), S("contacted", "Contacted", 20), S("visit_booked", "Showing booked", 40), S("quoted", "Offer made", 65), S("negotiation", "Under contract", 85), WON("Closed"), LOST()] },
];
export const template = (id: string) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

/** The account's pipelines, or the general one until they choose. */
export function pipelinesOf(s: Settings | null | undefined): Pipeline[] {
  const list = (s?.pipelines ?? []).filter((p) => p?.stages?.length);
  if (list.length) return list;
  const t = template("general");
  return [{ id: "default", name: t.name, stages: t.stages.map((x) => ({ ...x, label: s?.stage_labels?.[x.id]?.trim() || x.label })) }];
}
export const interestsOf = (s: Settings | null | undefined) => s?.interests?.length ? s.interests : template(s?.industry ?? "general").interests;

/** Older deals may sit in a stage this pipeline doesn't have: show them in the closest one. */
const ALIAS: Record<string, string[]> = { visit_done: ["visit_booked", "quoted"], completed: ["won"], negotiation: ["quoted"], qualified: ["contacted"], visit_booked: ["qualified", "contacted"] };
export function pipelineOf(d: Pick<Deal, "pipeline">, ps: Pipeline[]): Pipeline { return ps.find((p) => p.id === d.pipeline) ?? ps[0]; }
export function columnOf(d: Pick<Deal, "stage" | "pipeline">, ps: Pipeline[]): PStage {
  const p = pipelineOf(d, ps);
  return p.stages.find((s) => s.id === d.stage) ?? (ALIAS[d.stage] ?? []).map((a) => p.stages.find((s) => s.id === a)).find(Boolean) ?? p.stages[0];
}
export function kindOf(stageId: string, ps: Pipeline[]): StageKind {
  for (const p of ps) { const s = p.stages.find((x) => x.id === stageId); if (s) return s.kind; }
  return stageId === "lost" ? "lost" : stageId === "won" || stageId === "completed" ? "won" : "open";
}
export const isOpenIn = (d: Pick<Deal, "stage">, ps: Pipeline[]) => kindOf(d.stage, ps) === "open";
export function probOf(d: Pick<Deal, "stage" | "pipeline">, ps: Pipeline[]) { return columnOf(d, ps).prob; }
export const weighted = (d: Pick<Deal, "stage" | "pipeline" | "value">, ps: Pipeline[]) => (d.value || 0) * probOf(d, ps) / 100;
export const wonStage = (p: Pipeline) => p.stages.find((s) => s.kind === "won")?.id ?? "won";
export const lostStage = (p: Pipeline) => p.stages.find((s) => s.kind === "lost")?.id ?? "lost";

/** Unique stage id for a new custom stage. */
export const stageId = (label: string, taken: string[]) => {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "stage";
  let id = base, n = 2; while (taken.includes(id)) id = `${base}_${n++}`;
  return id;
};

export const PRIORITIES = [{ id: "high", label: "High", tone: "rose" }, { id: "medium", label: "Medium", tone: "sun" }, { id: "low", label: "Low", tone: "gray" }] as const;
