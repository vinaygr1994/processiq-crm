"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button, Card } from "@/components/ui";
import { EmailEditor } from "@/components/EmailEditor";
import { useCrm } from "@/lib/store";
import { useStatus } from "@/lib/status";
import { callApi } from "@/lib/api";
import { fill } from "@/lib/format";
import { KIND, foldersOf, kindOf } from "@/lib/content";
import { emailVars, parseDesign, plainOf, renderDesign } from "@/lib/emailDesign";
import type { Contact } from "@/lib/types";

type Tab = "content" | "preview";

/** Quick content checks before sending, like a pre-flight. */
function checks(subject: string, body: string, kind: string): { level: "error" | "warn"; text: string }[] {
  const out: { level: "error" | "warn"; text: string }[] = [];
  const d = parseDesign(body);
  if (kind !== "block" && !subject.trim()) out.push({ level: "error", text: "The subject line is empty." });
  if (kind !== "block" && subject.length > 70) out.push({ level: "warn", text: `The subject is ${subject.length} characters. Phones cut it off around 40–60.` });
  if (d && kind !== "block" && !d.preheader.trim()) out.push({ level: "warn", text: "No preview line. Inboxes will show the first words of the email instead." });
  if (d && !d.blocks.length) out.push({ level: "error", text: "The email has no content." });
  const known = new Set(["first_name", "first", "name", "company", "business", "booking_link", "review_link", "amount", "stage", "visit_time", "rep"]);
  const tags = [...new Set([...(subject + body).matchAll(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g)].map((m) => m[1]))].filter((t) => !known.has(t));
  if (tags.length) out.push({ level: "warn", text: `Unknown merge field${tags.length > 1 ? "s" : ""}: ${tags.map((t) => `{{${t}}}`).join(", ")}. They'll show as blank.` });
  if (d) {
    const imgs = d.blocks.filter((b) => (b.type === "image" || b.type === "hero") && !(b.alt ?? "").trim()).length;
    if (imgs) out.push({ level: "warn", text: `${imgs} image${imgs > 1 ? "s have" : " has"} no alt text, so people with images off see nothing.` });
    const dead = d.blocks.filter((b) => (b.type === "button" || b.type === "video") && (!b.url || /^https?:\/\/?$/.test(b.url))).length;
    if (dead) out.push({ level: "error", text: `${dead} button${dead > 1 ? "s don't" : " doesn't"} have a link yet.` });
  }
  if (/\{\{booking_link\}\}/.test(body)) out.push({ level: "warn", text: "Uses {{booking_link}}: make sure it's set in Settings, or the link will be empty." });
  return out;
}

export default function ContentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { data, ready, update, toast, settings, userEmail } = useCrm();
  const status = useStatus();
  const saved = data.templates.find((t) => t.id === id);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [folder, setFolder] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>("content");
  const [who, setWho] = useState<Contact | null>(null);
  const [find, setFind] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [view, setView] = useState<"html" | "text">("html");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- copy the saved asset into the editor once it has loaded
    if (saved && !loaded) { setName(saved.name); setSubject(saved.subject); setBody(saved.body); setFolder(saved.folder ?? ""); setLoaded(true); }
  }, [saved, loaded]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const kind = saved ? kindOf(saved) : "email";
  const design = useMemo(() => parseDesign(body), [body]);
  const contact = who ?? data.contacts.find((c) => c.email) ?? null;
  const vars = emailVars(contact, settings);
  const rendered = useMemo(() => (design ? renderDesign(design, vars, { business: settings?.business_name, address: settings?.address, unsubscribeUrl: kind === "block" ? undefined : "#" }) : null), [design, vars.first_name, vars.company, settings?.business_name, settings?.address, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const issues = useMemo(() => checks(subject, body, kind), [subject, body, kind]);
  const matches = useMemo(() => { const s = find.trim().toLowerCase(); return data.contacts.filter((c) => c.email && (!s || c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s))).slice(0, 30); }, [data.contacts, find]);

  if (!ready) return null;
  if (!saved || kind === "folder" || kind === "image") return <Card><p>That content doesn&apos;t exist. <Link href="/content" className="font-semibold text-teal-d hover:underline">Back to Content Builder</Link></p></Card>;

  const folders = foldersOf(data.templates);
  async function save() {
    await update("templates", saved!.id, { name: name.trim() || "Untitled", subject, body, folder, updated_at: new Date().toISOString() });
    setDirty(false); toast("Saved");
  }
  async function sendTest() {
    if (issues.some((i) => i.level === "error")) return toast("Fix the errors in the content check first", "error");
    if (status?.demo) return toast("Demo mode: test emails aren't really sent");
    if (!userEmail) return toast("Log in again to send a test", "error");
    setTesting(true);
    try {
      const sample = { name: contact?.name ?? "Sarah Collins", company: contact?.company ?? "" };
      await callApi("/api/email/send", { to: userEmail, subject: fill(subject, sample), body: design ? plainOf(body, vars) : fill(body, sample), design: design ?? undefined, test: true, vars });
      toast(`Test sent to ${userEmail}, personalised as ${contact?.name ?? "a sample contact"}`);
    } catch (e) { toast((e as Error).message, "error"); }
    setTesting(false);
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#f4f6fb]">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-white px-3 sm:px-4">
        <Link href={`/content${saved.folder ? `?folder=${encodeURIComponent(saved.folder)}` : ""}`} aria-label="Back to Content Builder" onClick={(e) => { if (dirty && !confirm("Leave without saving your changes?")) e.preventDefault(); }} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-cloud hover:text-ink"><Icon name="back" className="size-5" /></Link>
        <span className={`hidden size-8 place-items-center rounded-lg sm:grid ${KIND[kind as keyof typeof KIND].tone}`}><Icon name={KIND[kind as keyof typeof KIND].icon} className="size-4" /></span>
        <input className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-[17px] font-semibold text-ink hover:border-line focus:border-teal focus:outline-none sm:max-w-sm" aria-label="Name" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
        <span className="hidden rounded-md bg-cloud px-2 py-1 text-[12px] font-semibold text-body md:inline">{KIND[kind as keyof typeof KIND].label}</span>
        <select aria-label="Folder" className="field hidden !h-9 !w-auto !py-0 text-[13px] lg:block" value={folder} onChange={(e) => { setFolder(e.target.value); setDirty(true); }}>
          <option value="">Content Builder</option>{folders.map((f) => <option key={f}>{f}</option>)}
        </select>
        {dirty && <span className="hidden text-[12.5px] text-muted lg:inline">Unsaved changes</span>}
        <div className="ml-auto flex items-center gap-2">
          {kind === "email" && <Link href={`/marketing/send?template=${saved.id}`} onClick={(e) => { if (dirty) { e.preventDefault(); toast("Save first, then send", "error"); } }} className="hidden h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-ink hover:bg-cloud sm:inline-flex"><Icon name="send" className="size-4" />Send</Link>}
          <Button size="sm" onClick={save} disabled={!dirty}>{dirty ? "Save" : "Saved"}</Button>
        </div>
      </div>
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-white px-3">
        {([["content", "Content"], ...(kind === "block" ? [] : [["preview", "Preview and Test"]])] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`pill -mb-px h-11 border-b-2 px-3 text-[13.5px] font-semibold ${tab === k ? "border-teal-d text-teal-d" : "border-transparent text-muted hover:text-ink"}`}>{l}</button>
        ))}
        {kind !== "block" && <span className={`ml-auto rounded-full px-2.5 py-1 text-[12px] font-semibold ${issues.some((i) => i.level === "error") ? "bg-rose-t text-rose" : issues.length ? "bg-sun-t text-[#8a5200]" : "bg-[#e3f6ec] text-[#16794a]"}`}>{issues.some((i) => i.level === "error") ? `${issues.filter((i) => i.level === "error").length} to fix` : issues.length ? `${issues.length} suggestion${issues.length > 1 ? "s" : ""}` : "Content check passed"}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "content" ? (
          <div className="mx-auto max-w-[1500px] p-4 sm:p-5">
            <div className="rounded-2xl border border-line bg-white p-4">
              <EmailEditor subject={subject} body={body} mode={kind === "block" ? "block" : "message"} tall
                onSubject={(s) => { setSubject(s); setDirty(true); }} onBody={(b) => { setBody(b); setDirty(true); }}
                contact={contact} aiContact={{ name: "{{first_name}}", company: "{{company}}" }} />
            </div>
          </div>
        ) : (
          <div className="mx-auto grid max-w-[1500px] gap-4 p-4 sm:p-5 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
            <aside className="rounded-2xl border border-line bg-white p-3 lg:self-start">
              <div className="mb-2 text-sm font-semibold text-ink">Preview as subscriber</div>
              <input className="field !h-9 !text-[13px]" placeholder="Search contacts" value={find} onChange={(e) => setFind(e.target.value)} />
              <ul className="mt-2 max-h-[52vh] space-y-0.5 overflow-y-auto">
                {matches.map((c) => (
                  <li key={c.id}><button type="button" onClick={() => setWho(c)} className={`w-full rounded-lg px-2.5 py-2 text-left ${contact?.id === c.id ? "bg-teal-t" : "hover:bg-cloud"}`}>
                    <span className="block truncate text-[13px] font-semibold text-ink">{c.name}</span><span className="block truncate text-[12px] text-muted">{c.email}</span>
                  </button></li>
                ))}
                {matches.length === 0 && <li className="px-2 py-3 text-[13px] text-muted">No contacts with an email address match.</li>}
              </ul>
            </aside>

            <div className="min-w-0">
              <div className="mb-3 rounded-2xl border border-line bg-white p-4">
                <div className="text-[12px] font-semibold text-muted">Inbox view</div>
                <div className="mt-1 flex items-baseline gap-2"><span className="shrink-0 font-semibold text-ink">{settings?.sender_name || settings?.business_name || "Your business"}</span></div>
                <div className="truncate text-[14px]"><span className="font-semibold text-ink">{fill(subject, contact ?? { name: "there", company: "" }) || "(no subject)"}</span>{design?.preheader && <span className="text-muted"> – {fill(design.preheader, contact ?? { name: "there", company: "" })}</span>}</div>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-line">{(["html", "text"] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} className={`rounded-md px-3 py-1 text-[13px] font-semibold ${view === v ? "bg-ink text-white" : "text-body"}`}>{v === "html" ? "HTML" : "Text version"}</button>)}</div>
                {view === "html" && <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-line">{(["desktop", "mobile"] as const).map((v) => <button key={v} type="button" onClick={() => setDevice(v)} className={`rounded-md px-3 py-1 text-[13px] font-semibold capitalize ${device === v ? "bg-ink text-white" : "text-body"}`}>{v}</button>)}</div>}
              </div>
              <div className="overflow-hidden rounded-2xl border border-line bg-white" style={{ background: design?.bg }}>
                {view === "text" || !rendered
                  ? <pre className="max-h-[70vh] min-h-[400px] overflow-auto whitespace-pre-wrap bg-white p-5 font-sans text-[14px] leading-relaxed text-body">{rendered ? rendered.text : fill(body, contact ?? { name: "there", company: "" })}</pre>
                  : <iframe title="Email preview" sandbox="" srcDoc={rendered.html} className={`mx-auto block h-[70vh] min-h-[480px] border-0 transition-[width] ${device === "mobile" ? "w-[375px] max-w-full" : "w-full"}`} />}
              </div>
            </div>

            <aside className="space-y-3 lg:self-start">
              <div className="rounded-2xl border border-line bg-white p-4">
                <div className="font-semibold text-ink">Test send</div>
                <p className="mt-1 text-[13px] text-muted">Sends this email to <strong className="text-ink">{userEmail || "your login email"}</strong>, personalised as {contact?.name ?? "a sample contact"}. The subject starts with [Test].</p>
                <Button className="mt-3 w-full" icon="send" onClick={sendTest} disabled={testing}>{testing ? "Sending…" : "Send test"}</Button>
              </div>
              <div className="rounded-2xl border border-line bg-white p-4">
                <div className="font-semibold text-ink">Content check</div>
                {issues.length === 0 ? <p className="mt-2 flex items-center gap-2 text-sm text-[#16794a]"><Icon name="check" className="size-4" />Everything looks good.</p> : (
                  <ul className="mt-2 space-y-2">{issues.map((i) => (
                    <li key={i.text} className={`rounded-lg px-3 py-2 text-[13px] ${i.level === "error" ? "bg-rose-t text-rose" : "bg-sun-t text-[#7a4700]"}`}>{i.text}</li>
                  ))}</ul>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
