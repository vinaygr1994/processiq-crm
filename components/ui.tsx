"use client";
import { useEffect, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon } from "./Icon";
import { initials } from "@/lib/format";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "soft" | "ghost" | "danger"; size?: "md" | "sm"; icon?: string };
export function Button({ variant = "primary", size = "md", icon, className = "", children, ...rest }: BtnProps) {
  const v = {
    primary: "bg-teal-d text-white hover:bg-[#055656] shadow-[0_1px_2px_rgba(16,24,40,.12)]",
    soft: "bg-white text-ink border border-[#cdd4e2] hover:bg-cloud shadow-[0_1px_2px_rgba(16,24,40,.05)]",
    ghost: "text-body hover:bg-[#e9edf4]",
    danger: "bg-white text-[#c42b52] border border-[#cdd4e2] hover:bg-rose-t",
  }[variant];
  const s = size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-sm";
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-semibold transition disabled:opacity-50 disabled:pointer-events-none ${v} ${s} ${className}`}
    >
      {icon && <Icon name={icon} className="size-4" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-[13px] font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12.5px] text-muted">{hint}</span>}
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
      <div className="anim-fade absolute inset-0 bg-[#0b1324]/55" onClick={onClose} />
      <div className={`anim-pop relative flex max-h-[92dvh] w-full flex-col rounded-t-xl bg-white shadow-2xl sm:rounded-xl ${wide === "xl" ? "sm:max-w-6xl" : wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}>
        <div className="flex items-center justify-between border-b border-line bg-[#f8f9fc] px-5 py-3 sm:rounded-t-xl">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-md text-muted hover:bg-[#e9edf4]" aria-label="Close">
            <Icon name="x" className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[10px] border border-line bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.04)] ${className}`}>{children}</div>;
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "teal" | "iris" | "sun" | "rose" | "green" }) {
  const t = {
    gray: "bg-[#eef1f6] text-[#4b5670] ring-[#dfe4ee]",
    teal: "bg-teal-t text-teal-d ring-[#bfe6e2]",
    iris: "bg-iris-t text-[#4344c9] ring-[#d6d6fb]",
    sun: "bg-sun-t text-[#8a5000] ring-[#ffdcae]",
    rose: "bg-rose-t text-[#b8264b] ring-[#ffc9d6]",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  }[tone];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-[5px] px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset ${t}`}>{children}</span>;
}

const AV = ["bg-teal-t text-teal-d", "bg-iris-t text-iris", "bg-sun-t text-[#9a5a00]", "bg-rose-t text-[#b8264b]", "bg-sky-100 text-sky-700"];
export function Avatar({ name, size = "size-10" }: { name: string; size?: string }) {
  const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length;
  return <span className={`grid shrink-0 place-items-center rounded-full text-sm font-semibold ${AV[h]} ${size}`}>{initials(name)}</span>;
}

export function Empty({ icon, title, text, action }: { icon: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-lg bg-[#eef1f6] text-muted">
        <Icon name={icon} className="size-5" />
      </span>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-[13.5px] text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold leading-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-[13.5px] text-muted">{sub}</p>}
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
      className="inline-flex h-9 items-center gap-2 rounded-md bg-gradient-to-r from-teal to-iris px-3.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60"
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
