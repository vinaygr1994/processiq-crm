"use client";
import { RANGE_OPTIONS, ymd, type Custom, type RangeId } from "@/lib/dateRange";
import { nowMs } from "@/lib/clock";

/** Preset dropdown plus two date fields when "Custom range" is chosen. */
export function DateRangePicker({ id, custom, onId, onCustom }: { id: RangeId; custom: Custom; onId: (v: RangeId) => void; onCustom: (v: Custom) => void }) {
  const max = ymd(nowMs());
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className="field !h-9 !w-auto !py-0" aria-label="Date range" value={id} onChange={(e) => onId(e.target.value as RangeId)}>
        {RANGE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {id === "custom" && (
        <div className="flex items-center gap-1.5 text-[13px] text-muted">
          <input type="date" className="field !h-9 !w-auto !py-0" aria-label="From date" value={custom.from} max={custom.to || max} onChange={(e) => onCustom({ ...custom, from: e.target.value })} />
          <span>to</span>
          <input type="date" className="field !h-9 !w-auto !py-0" aria-label="To date" value={custom.to} min={custom.from || undefined} max={max} onChange={(e) => onCustom({ ...custom, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}
