// Content Builder: asset kinds, folders and helpers shared by the library and the editors.
import type { AssetKind, Template } from "./types";
import { bid, blankDesign, parseDesign, scratchDesign, stringifyDesign, newBlock, type Block, type Design } from "./emailDesign";
import { isDemo } from "./config";
import { supabase } from "./supabase";

export const KIND: Record<Exclude<AssetKind, "folder">, { label: string; plural: string; icon: string; tone: string }> = {
  email: { label: "Email", plural: "Emails", icon: "mail", tone: "bg-teal-t text-teal-d" },
  template: { label: "Template", plural: "Templates", icon: "layers", tone: "bg-iris-t text-iris" },
  block: { label: "Content block", plural: "Content blocks", icon: "box", tone: "bg-sun-t text-[#9a5a00]" },
  image: { label: "Image", plural: "Images", icon: "upload", tone: "bg-[#e6effb] text-[#2f6fb8]" },
};
export const kindOf = (t: Pick<Template, "kind">): AssetKind => t.kind ?? "email";
export const isMessage = (t: Template) => { const k = kindOf(t); return k === "email" || k === "template"; };

/** Folder names in use, plus empty folders saved as folder rows. Sorted A–Z. */
export function foldersOf(rows: Template[]): string[] {
  return [...new Set(rows.map((t) => (kindOf(t) === "folder" ? t.name : t.folder ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** Starting body for a new asset. */
export function starter(kind: AssetKind, how: "scratch" | "branded" | "html" = "branded"): string {
  if (kind === "block") return stringifyDesign({ ...scratchDesign(), blocks: [newBlock("text")] });
  if (how === "scratch") return stringifyDesign(scratchDesign());
  if (how === "html") { const b = newBlock("html"); b.text = "<!-- Paste your full email HTML here -->\n"; return stringifyDesign({ ...scratchDesign(), blocks: [b] }); }
  return stringifyDesign(blankDesign([]));
}

/** Blocks of a saved content block, with fresh ids so they can be inserted more than once. */
export function blocksOf(t: Template): Block[] {
  const d = parseDesign(t.body);
  return (d?.blocks ?? []).map((b) => ({ ...b, id: bid(), cols: b.cols?.map((c) => ({ ...c })) }));
}
export const designOf = (t: Template): Design | null => parseDesign(t.body);

/** Uploads an image for use in emails. Live: public Supabase Storage URL. Demo: an inline data URL kept in this browser. */
export async function uploadImage(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) throw new Error("Use a PNG, JPG, GIF or WebP image.");
  if (file.size > (isDemo ? 1_500_000 : 5_000_000)) throw new Error(isDemo ? "In the demo, images must be under 1.5 MB." : "Images must be under 5 MB. Compress it first (for example with squoosh.app).");
  if (isDemo) return await new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(new Error("Couldn't read that file.")); r.readAsDataURL(file); });
  const sb = supabase();
  const { data: org, error: e1 } = await sb.rpc("crm_org");
  if (e1 || !org) throw new Error("Couldn't find your workspace. Try logging in again.");
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${org}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("content").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(/bucket/i.test(error.message) ? "Image storage isn't set up yet. Run supabase/schema.sql (or redeploy with SUPABASE_DB_URL set)." : error.message);
  return sb.storage.from("content").getPublicUrl(path).data.publicUrl;
}
