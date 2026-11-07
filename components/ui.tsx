"use client";
import { useEffect, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon } from "./Icon";
import { initials } from "@/lib/format";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "soft" | "ghost" | "danger"; size?: "md" | "sm"; icon?: string };
export function Button({ variant = "primary", size = "md", icon, className = "", children, ...rest }: BtnProps) {
  const v = {
    primary: "bg-ink text-white hover:bg-[#1d2a47] shadow-sm",
    soft: "bg-white text-ink border border-line hover:border-[#cfd6e6] hover:bg-cloud",
    ghost: "text-body hover:bg-white/70",
    danger: "bg-white text-rose border border-line hover:bg-rose-t",
  }[variant];
  const s = size === "sm" ? "h-9 px-3.5 text-sm" : "h-11 px-5 text-[15px]";
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:opacity-50 disabled:pointer-events-none ${v} ${s} ${className}`}
    >
      {icon && <Icon name={icon} className="size-[18px]" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[13px] text-muted">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean | "xl" }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="anim-fade absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`anim-pop relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${wide === "xl" ? "sm:max-w-6xl" : wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}>
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full text-muted hover:bg-cloud" aria-label="Close">
            <Icon name="x" className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-line bg-white p-5 sm:p-6 ${className}`}>{children}</div>;
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "teal" | "iris" | "sun" | "rose" | "green" }) {
  const t = {
    gray: "bg-cloud text-muted",
    teal: "bg-teal-t text-teal-d",
    iris: "bg-iris-t text-iris",
    sun: "bg-sun-t text-[#9a5a00]",
    rose: "bg-rose-t text-[#b8264b]",
    green: "bg-emerald-50 text-emerald-700",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${t}`}>{children}</span>;
}

const AV = ["bg-teal-t text-teal-d", "bg-iris-t text-iris", "bg-sun-t text-[#9a5a00]", "bg-rose-t text-[#b8264b]", "bg-sky-100 text-sky-700"];
export function Avatar({ name, size = "size-10" }: { name: string; size?: string }) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length;
  return <span className={`grid shrink-0 place-items-center rounded-full text-sm font-semibold ${AV[h]} ${size}`}>{initials(name)}</span>;
}

export function Empty({ icon, title, text, action }: { icon: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-teal-t text-teal-d">
        <Icon name={icon} className="size-7" />
      </span>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function AiButton({ onClick, busy, children }: { onClick: () => void; busy?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-teal to-iris px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
    >
      {busy ? <Spinner className="size-4" /> : <Icon name="sparkle" className="size-4" />}
      {children}
    </button>
  );
}

export function ConfirmModal({ title, text, confirmLabel = "Delete", onConfirm, onClose }: { title: string; text: string; confirmLabel?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="mb-6">{text}</p>
      <div className="flex justify-end gap-2">
        <Button variant="soft" onClick={onClose}>Cancel</Button>
        <Button className="!bg-rose hover:!bg-[#d84a6d]" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
