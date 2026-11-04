const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** A calendar file (.ics) that works with Google Calendar, Outlook and Apple Calendar. */
export function downloadIcs(o: { id: string; start: string; summary: string; location?: string; description?: string }) {
  const s = new Date(o.start), e = new Date(s.getTime() + 3600000);
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Process IQ CRM//EN", "BEGIN:VEVENT", `UID:${o.id}@processiq-crm`, `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(s)}`, `DTEND:${fmt(e)}`, `SUMMARY:${esc(o.summary)}`, o.location ? `LOCATION:${esc(o.location)}` : "", o.description ? `DESCRIPTION:${esc(o.description)}` : "",
    "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "visit.ics" });
  a.click();
  URL.revokeObjectURL(url);
}
