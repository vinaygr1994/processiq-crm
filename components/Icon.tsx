const P: Record<string, string> = {
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5",
  heart: "M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z",
  dumbbell: "M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12",
  stethoscope: "M6 3v6a4 4 0 008 0V3M10 13v3a5 5 0 0010 0v-2M20 14a2 2 0 100-4 2 2 0 000 4z",
  briefcase: "M3 8h18v12H3zM9 8V5h6v3M3 13h18",
  key: "M15 9a4 4 0 11-3.8 5.2L4 21H3v-3l7-7A4 4 0 0115 9zM16 8h.01",
  box: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z",
  today: "M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6",
  users: "M16 20v-1.5A3.5 3.5 0 0012.5 15h-5A3.5 3.5 0 004 18.5V20M10 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM20 20v-1.5a3.5 3.5 0 00-2.5-3.35M15.5 4.2a3.5 3.5 0 010 6.6",
  pipeline: "M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v6h-4z",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5h0a1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  plus: "M12 5v14M5 12h14",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  home: "M4 11l8-7 8 7v9H4zM10 20v-6h4v6",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6L6 18",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16",
  chart: "M4 20V10M10 20V4M16 20v-6M22 20H2",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z",
  note: "M5 4h11l3 3v13H5zM8 10h8M8 14h8M8 18h5",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  chevron: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  logout: "M9 4H5v16h4M16 8l4 4-4 4M20 12H9",
  tag: "M3 12V4h8l10 10-8 8zM7.5 8.5h.01",
  building: "M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3M3 21h18",
  alert: "M12 3l10 18H2zM12 10v5M12 18h.01",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01",
};
export function Icon({ name, className = "size-5" }: { name: keyof typeof P | string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] ?? ""} />
    </svg>
  );
}
