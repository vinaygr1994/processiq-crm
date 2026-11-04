"use client";
import { useCrm } from "@/lib/store";
import type { Contact, Deal } from "@/lib/types";

/** Inputs for the custom fields the owner defined in Settings → Customize. Saves when you leave a field. */
export function CustomFields({ on, record, compact = false }: { on: "deal" | "contact"; record: Deal | Contact; compact?: boolean }) {
  const { settings, update } = useCrm();
  const fields = (settings?.custom_fields ?? []).filter((f) => f.on === on);
  if (fields.length === 0) return null;
  const save = (id: string, v: string) => {
    const cur = record.custom ?? {};
    if ((cur[id] ?? "") === v) return;
    return update(on === "deal" ? "deals" : "contacts", record.id, { custom: { ...cur, [id]: v } } as never);
  };
  return (
    <div className={compact ? "grid gap-3 sm:grid-cols-2" : "space-y-3.5"}>
      {fields.map((f) => {
        const val = record.custom?.[f.id] ?? "";
        const common = { className: "field", defaultValue: val, key: `${record.id}-${f.id}-${val}` };
        return (
          <label key={f.id} className="block"><span className="mb-1 block text-[13px] font-semibold text-muted">{f.label}</span>
            {f.type === "select" ? (
              <select {...common} onChange={(e) => save(f.id, e.target.value)}><option value="">—</option>{(f.options ?? []).map((o) => <option key={o}>{o}</option>)}</select>
            ) : (
              <input {...common} type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} onBlur={(e) => save(f.id, e.target.value)} />
            )}
          </label>
        );
      })}
    </div>
  );
}
