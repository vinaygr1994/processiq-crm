"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button, Card, ConfirmModal, Empty, Field, Modal, PageHeader } from "@/components/ui";
import { useCrm } from "@/lib/store";
import { KIND, foldersOf, kindOf, starter, uploadImage } from "@/lib/content";
import { PRESETS, emailVars, parseDesign, renderDesign, stringifyDesign, bid, type Design } from "@/lib/emailDesign";
import { timeAgo } from "@/lib/format";
import type { AssetKind, Template } from "@/lib/types";

type Kind = Exclude<AssetKind, "folder">;
const ROOT = "";
const stamp = () => new Date().toISOString();
const cloneDesign = (d: Design): string => stringifyDesign({ ...d, blocks: d.blocks.map((b) => ({ ...b, id: bid(), cols: b.cols?.map((c) => ({ ...c })) })) });

function Thumb({ t }: { t: Template }) {
  const { settings } = useCrm();
  const k = kindOf(t);
  if (k === "image") return <img src={t.body} alt={t.name} loading="lazy" className="size-full object-contain" />;
  const d = parseDesign(t.body);
  if (!d) return <div className="line-clamp-[10] whitespace-pre-wrap p-3 text-left text-[10px] leading-snug text-body">{t.body.slice(0, 600)}</div>;
  const html = renderDesign(d, emailVars({ name: "Sarah Collins", company: "" }, settings), { business: settings?.business_name, address: settings?.address }).html;
  return <iframe title={`${t.name} preview`} sandbox="" loading="lazy" tabIndex={-1} srcDoc={html} className="pointer-events-none h-[640px] w-[300%] origin-top-left scale-[0.3333] border-0" />;
}

function Inner() {
  const { data, add, update, remove, can, toast } = useCrm();
  const router = useRouter();
  const params = useSearchParams();
  const [folder, setFolder] = useState<string>(params.get("folder") ?? ROOT);
  const [type, setType] = useState<Kind | "">((params.get("type") as Kind) || "");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [menu, setMenu] = useState(false);
  const [create, setCreate] = useState<{ kind: Kind; html?: boolean } | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("branded");
  const [del, setDel] = useState<Template | null>(null);
  const [move, setMove] = useState<Template | null>(null);
  const [folderModal, setFolderModal] = useState<{ old?: string } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [img, setImg] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const write = can("write");

  const assets = useMemo(() => data.templates.filter((t) => kindOf(t) !== "folder"), [data.templates]);
  const folders = useMemo(() => foldersOf(data.templates), [data.templates]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return assets
      .filter((t) => (s ? true : folder === ROOT || (t.folder ?? "") === folder) && (!type || kindOf(t) === type) && (!s || t.name.toLowerCase().includes(s) || t.subject.toLowerCase().includes(s)))
      .sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at));
  }, [assets, folder, type, q]);
  const count = (f: string) => assets.filter((t) => (t.folder ?? "") === f).length;

  const open = (t: Template) => (kindOf(t) === "image" ? setImg(t) : router.push(`/content/${t.id}`));

  async function doCreate() {
    if (!create) return;
    const k = create.kind;
    let body = starter(k, create.html ? "html" : start === "scratch" ? "scratch" : "branded"), subject = "";
    if (!create.html && start.startsWith("preset:")) { const p = PRESETS.find((x) => x.id === start.slice(7)); if (p) { body = cloneDesign(p.design); subject = p.subject; } }
    if (!create.html && start.startsWith("tpl:")) { const t = data.templates.find((x) => x.id === start.slice(4)); if (t) { const d = parseDesign(t.body); body = d ? cloneDesign(d) : t.body; subject = t.subject; } }
    setBusy(true);
    const row = await add("templates", { name: name.trim() || `Untitled ${KIND[k].label.toLowerCase()}`, subject, body, kind: k, folder, updated_at: stamp() });
    setBusy(false);
    if (row) { setCreate(null); router.push(`/content/${row.id}`); }
  }
  async function duplicate(t: Template) {
    const row = await add("templates", { name: `${t.name} copy`, subject: t.subject, body: t.body, kind: kindOf(t), folder: t.folder ?? "", updated_at: stamp() });
    if (row) toast(`Duplicated as “${row.name}”`);
  }
  async function moveTo(t: Template, f: string) { await update("templates", t.id, { folder: f, updated_at: stamp() }); toast(f ? `Moved to ${f}` : "Moved to Content Builder"); setMove(null); }
  async function saveFolder() {
    const n = folderName.trim().replace(/\s+/g, " ");
    if (!n) return;
    if (folders.includes(n) && n !== folderModal?.old) return toast("A folder with that name already exists", "error");
    if (folderModal?.old) {
      const old = folderModal.old;
      for (const t of data.templates) {
        if (kindOf(t) === "folder" && t.name === old) await update("templates", t.id, { name: n });
        else if ((t.folder ?? "") === old) await update("templates", t.id, { folder: n });
      }
      if (folder === old) setFolder(n);
    } else { await add("templates", { name: n, subject: "", body: "", kind: "folder", folder: "", updated_at: stamp() }); setFolder(n); }
    setFolderModal(null); setFolderName("");
  }
  async function deleteFolder(f: string) {
    if (count(f)) return toast("Move or delete what's in this folder first", "error");
    for (const t of data.templates.filter((x) => kindOf(x) === "folder" && x.name === f)) await remove("templates", t.id);
    if (folder === f) setFolder(ROOT);
  }
  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        const url = await uploadImage(f);
        if (await add("templates", { name: f.name.replace(/\.[a-z0-9]+$/i, ""), subject: "", body: url, kind: "image", folder, updated_at: stamp() })) ok++;
      } catch (e) { toast(`${f.name}: ${(e as Error).message}`, "error"); }
    }
    setBusy(false);
    if (ok) toast(`${ok} image${ok === 1 ? "" : "s"} uploaded`);
    if (file.current) file.current.value = "";
  }

  const createItems: [Kind, string, string, boolean?][] = [
    ["email", "Email message", "A designed or plain email to send or use in a journey"],
    ["email", "HTML paste email", "Paste the full HTML of an email you built elsewhere", true],
    ["template", "Template", "A reusable starting layout for new emails"],
    ["block", "Content block", "A reusable piece (header, footer, offer, signature) to drop into any email"],
  ];
  const userTemplates = data.templates.filter((t) => kindOf(t) === "template");

  return (
    <div>
      <PageHeader title="Content Builder" sub="Every email, template, reusable content block and image, organised in folders."
        action={write ? (
          <div className="flex gap-2">
            <input ref={file} type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => onUpload(e.target.files)} />
            <Button variant="soft" icon="upload" disabled={busy} onClick={() => file.current?.click()}>{busy ? "Uploading…" : "Upload images"}</Button>
            <div className="relative">
              <Button icon="plus" onClick={() => setMenu(!menu)} aria-expanded={menu}>Create</Button>
              {menu && (
                <div className="absolute right-0 top-full z-30 mt-2 w-[min(92vw,340px)] rounded-xl border border-line bg-white p-1.5 shadow-xl" role="menu">
                  {createItems.map(([k, l, d, html]) => (
                    <button key={l} role="menuitem" type="button" onClick={() => { setMenu(false); setName(""); setStart(k === "block" ? "scratch" : "branded"); setCreate({ kind: k, html }); }}
                      className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-cloud">
                      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${KIND[k].tone}`}><Icon name={html ? "note" : KIND[k].icon} className="size-4" /></span>
                      <span><span className="block text-sm font-semibold text-ink">{l}</span><span className="block text-[12.5px] text-muted">{d}</span></span>
                    </button>
                  ))}
                  <button role="menuitem" type="button" onClick={() => { setMenu(false); setFolderName(""); setFolderModal({}); }} className="flex w-full items-start gap-3 rounded-lg border-t border-line px-3 py-2.5 text-left hover:bg-cloud">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cloud text-body"><Icon name="box" className="size-4" /></span>
                    <span><span className="block text-sm font-semibold text-ink">Folder</span><span className="block text-[12.5px] text-muted">Organise your content</span></span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : undefined} />

      <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* Folder tree */}
        <aside className="rounded-xl border border-line bg-white p-2 lg:self-start">
          {[ROOT, ...folders].map((f) => (
            <div key={f || "root"} className={`group flex items-center rounded-lg ${dropOn === f ? "bg-teal-t ring-2 ring-teal" : folder === f ? "bg-cloud" : "hover:bg-cloud"} ${f ? "ml-3" : ""}`}
              onDragOver={(e) => { if (e.dataTransfer.types.includes("text/plain")) { e.preventDefault(); setDropOn(f); } }} onDragLeave={() => setDropOn(null)}
              onDrop={(e) => { e.preventDefault(); setDropOn(null); const id = e.dataTransfer.getData("text/plain").replace(/^asset:/, ""); const t = assets.find((x) => x.id === id); if (t && (t.folder ?? "") !== f) moveTo(t, f); }}>
              <button type="button" onClick={() => { setFolder(f); setQ(""); }} className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-[13.5px] ${folder === f ? "font-semibold text-ink" : "text-body"}`}>
                <Icon name={f ? "box" : "layers"} className="size-4 shrink-0 text-muted" /><span className="truncate">{f || "Content Builder"}</span>
                <span className="ml-auto text-[12px] text-muted">{f ? count(f) : assets.length}</span>
              </button>
              {f && write && (
                <span className="hidden shrink-0 pr-1 group-hover:flex">
                  <button type="button" aria-label={`Rename ${f}`} onClick={() => { setFolderName(f); setFolderModal({ old: f }); }} className="grid size-7 place-items-center rounded text-muted hover:text-ink"><Icon name="note" className="size-3.5" /></button>
                  <button type="button" aria-label={`Delete ${f}`} onClick={() => deleteFolder(f)} className="grid size-7 place-items-center rounded text-muted hover:text-rose"><Icon name="trash" className="size-3.5" /></button>
                </span>
              )}
            </div>
          ))}
          {write && <button type="button" onClick={() => { setFolderName(""); setFolderModal({}); }} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-semibold text-teal-d hover:bg-cloud"><Icon name="plus" className="size-4" />New folder</button>}
          <p className="px-2.5 pb-1 pt-2 text-[12px] text-muted">Drag items onto a folder to move them.</p>
        </aside>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs"><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all content" aria-label="Search content" /></div>
            <select className="field !w-auto" aria-label="Content type" value={type} onChange={(e) => setType(e.target.value as Kind | "")}>
              <option value="">All types</option>{(Object.keys(KIND) as Kind[]).map((k) => <option key={k} value={k}>{KIND[k].plural}</option>)}
            </select>
            <div className="ml-auto flex rounded-lg bg-white p-0.5 ring-1 ring-line" role="group" aria-label="View">
              {(["list", "grid"] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-[13px] font-semibold capitalize ${view === v ? "bg-ink text-white" : "text-body"}`}>{v}</button>)}
            </div>
          </div>
          <div className="mb-2 text-[13px] text-muted">{q.trim() ? `Search results in all folders` : folder || "Content Builder"} · {shown.length} item{shown.length === 1 ? "" : "s"}</div>

          {shown.length === 0 ? (
            <Card><Empty icon="layers" title={q || type ? "Nothing matches" : "This folder is empty"} text={q || type ? "Try another search or type." : "Create an email, template or content block, or upload images."} action={write && !q && !type ? <Button icon="plus" onClick={() => setMenu(true)}>Create</Button> : undefined} /></Card>
          ) : view === "list" ? (
            <Card className="!p-0 overflow-hidden">
              <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-line bg-[#f8f9fc] text-left text-muted"><tr><th className="px-5 py-2.5 font-semibold">Name</th><th className="px-3 py-2.5 font-semibold">Type</th><th className="px-3 py-2.5 font-semibold">Folder</th><th className="px-3 py-2.5 font-semibold">Modified</th><th className="px-5 py-2.5" /></tr></thead>
                <tbody className="divide-y divide-line">
                  {shown.map((t) => { const k = kindOf(t) as Kind; return (
                    <tr key={t.id} draggable={write} onDragStart={(e) => { e.dataTransfer.setData("text/plain", "asset:" + t.id); e.dataTransfer.effectAllowed = "move"; }} className="hover:bg-cloud/60">
                      <td className="px-5 py-2.5">
                        <button type="button" onClick={() => open(t)} className="flex min-w-0 items-center gap-3 text-left">
                          <span className={`grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg ${KIND[k].tone}`}>{k === "image" ? <img src={t.body} alt="" className="size-full object-cover" /> : <Icon name={KIND[k].icon} className="size-4" />}</span>
                          <span className="min-w-0"><span className="block truncate font-semibold text-ink hover:text-teal-d">{t.name}</span>{t.subject && <span className="block truncate text-[12.5px] text-muted">{t.subject}</span>}</span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-body">{KIND[k].label}</td>
                      <td className="px-3 py-2.5 text-muted">{t.folder || "–"}</td>
                      <td className="px-3 py-2.5 text-muted">{timeAgo(t.updated_at ?? t.created_at)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right">
                        {k === "email" && <Link href={`/marketing/send?template=${t.id}`} className="mr-3 text-[13px] font-semibold text-teal-d hover:underline">Send</Link>}
                        {write && <><button type="button" onClick={() => duplicate(t)} className="mr-3 text-[13px] font-semibold text-body hover:text-ink">Duplicate</button>
                        <button type="button" onClick={() => setMove(t)} className="mr-3 text-[13px] font-semibold text-body hover:text-ink">Move</button>
                        <button type="button" onClick={() => setDel(t)} aria-label={`Delete ${t.name}`} className="align-middle text-[#b3bdd2] hover:text-rose"><Icon name="trash" className="size-[17px]" /></button></>}
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table></div>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((t) => { const k = kindOf(t) as Kind; return (
                <div key={t.id} draggable={write} onDragStart={(e) => { e.dataTransfer.setData("text/plain", "asset:" + t.id); e.dataTransfer.effectAllowed = "move"; }} className="group overflow-hidden rounded-xl border border-line bg-white transition hover:shadow-md">
                  <button type="button" onClick={() => open(t)} className="block h-44 w-full overflow-hidden bg-cloud" aria-label={`Open ${t.name}`}><Thumb t={t} /></button>
                  <div className="border-t border-line p-3">
                    <div className="truncate text-[13.5px] font-semibold text-ink">{t.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted"><span className={`rounded px-1.5 py-0.5 font-semibold ${KIND[k].tone}`}>{KIND[k].label}</span><span className="truncate">{timeAgo(t.updated_at ?? t.created_at)}</span></div>
                  </div>
                </div>
              ); })}
            </div>
          )}
        </div>
      </div>

      {create && (
        <Modal title={`Create ${create.html ? "HTML paste email" : KIND[create.kind].label.toLowerCase()}`} onClose={() => setCreate(null)} wide>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={create.kind === "block" ? "e.g. Footer with socials" : "e.g. November newsletter"} /></Field>
              <Field label="Folder"><select className="field" value={folder} onChange={(e) => setFolder(e.target.value)}><option value="">Content Builder (top level)</option>{folders.map((f) => <option key={f}>{f}</option>)}</select></Field>
            </div>
            {!create.html && create.kind !== "block" && (
              <div>
                <div className="mb-2 text-sm font-semibold">Start from</div>
                <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                  {[["scratch", "Blank", "Nothing but your own blocks: no header or footer"], ["branded", "Blank with header and footer", "Your logo and footer, empty body"],
                    ...userTemplates.map((t) => [`tpl:${t.id}`, t.name, "Your template"]), ...PRESETS.map((p) => [`preset:${p.id}`, p.name, p.blurb])].map(([id, l, d]) => (
                    <button key={id} type="button" onClick={() => setStart(id)} className={`rounded-xl border p-3 text-left ${start === id ? "border-teal bg-teal-t/50 ring-2 ring-teal/20" : "border-line hover:border-[#b7c1d6]"}`}>
                      <span className="block text-[13.5px] font-semibold text-ink">{l}</span><span className="mt-0.5 line-clamp-2 block text-[12px] text-muted">{d}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {create.html && <p className="rounded-xl bg-cloud px-4 py-3 text-sm text-muted">You&apos;ll get a blank email with one Custom HTML block. Paste your full email code into it. Your own header and footer are kept as they are.</p>}
            <div className="flex justify-end gap-2"><Button variant="soft" onClick={() => setCreate(null)}>Cancel</Button><Button disabled={busy} onClick={doCreate}>{busy ? "Creating…" : "Create and edit"}</Button></div>
          </div>
        </Modal>
      )}
      {move && (
        <Modal title={`Move “${move.name}”`} onClose={() => setMove(null)}>
          <div className="space-y-1.5">
            {[ROOT, ...folders].map((f) => <button key={f || "root"} type="button" disabled={(move.folder ?? "") === f} onClick={() => moveTo(move, f)} className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-left text-sm hover:border-teal disabled:opacity-50"><Icon name={f ? "box" : "layers"} className="size-4 text-muted" />{f || "Content Builder (top level)"}{(move.folder ?? "") === f && <span className="ml-auto text-[12px] text-muted">Current</span>}</button>)}
          </div>
        </Modal>
      )}
      {folderModal && (
        <Modal title={folderModal.old ? "Rename folder" : "New folder"} onClose={() => setFolderModal(null)}>
          <Field label="Folder name"><input className="field" autoFocus value={folderName} onChange={(e) => setFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveFolder()} placeholder="e.g. Newsletters" /></Field>
          <div className="mt-5 flex justify-end gap-2"><Button variant="soft" onClick={() => setFolderModal(null)}>Cancel</Button><Button onClick={saveFolder}>{folderModal.old ? "Rename" : "Create folder"}</Button></div>
        </Modal>
      )}
      {img && (
        <Modal title={img.name} onClose={() => setImg(null)} wide>
          <div className="grid place-items-center rounded-xl bg-cloud p-4"><img src={img.body} alt={img.name} className="max-h-[50vh] max-w-full rounded-lg object-contain" /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Name"><input className="field" defaultValue={img.name} onBlur={(e) => e.target.value.trim() && e.target.value !== img.name && update("templates", img.id, { name: e.target.value.trim(), updated_at: stamp() })} /></Field>
            <Field label="Image address"><div className="flex gap-2"><input className="field" readOnly value={img.body.startsWith("data:") ? "(stored in this browser)" : img.body} /><Button variant="soft" disabled={img.body.startsWith("data:")} onClick={() => navigator.clipboard.writeText(img.body).then(() => toast("Copied"))}>Copy</Button></div></Field>
          </div>
          <p className="mt-3 text-[13px] text-muted">Use it in any email: Image block → Choose from image library.</p>
        </Modal>
      )}
      {del && <ConfirmModal title={`Delete “${del.name}”?`} text={kindOf(del) === "image" ? "Emails already sent keep showing it, but it's removed from your library." : "This can't be undone."} onClose={() => setDel(null)} onConfirm={() => remove("templates", del.id)} />}
    </div>
  );
}

export default function ContentBuilderPage() { return <Suspense><Inner /></Suspense>; }
