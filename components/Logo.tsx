import { useId } from "react";

/** Exact brand mark used on processiqautomation.com */
export function Mark({ className = "size-9" }: { className?: string }) {
  const gid = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b8a8a" />
          <stop offset=".55" stopColor="#2f7fd0" />
          <stop offset="1" stopColor="#5a5bef" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill={`url(#${gid})`} />
      <circle cx="31" cy="9" r="3" fill="#ffad4d" />
      <text x="19" y="26.5" textAnchor="middle" fontFamily="Bricolage Grotesque, Arial, sans-serif" fontSize="16" fontWeight="700" fill="#fff">IQ</text>
    </svg>
  );
}
export function Logo({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark className={dark ? "size-8" : "size-9"} />
      <span className={`font-brand text-[1.1rem] font-semibold ${dark ? "text-white" : "text-ink"}`}>
        Process IQ <span className={`font-medium ${dark ? "text-white/55" : "text-muted"}`}>CRM</span>
      </span>
    </span>
  );
}
