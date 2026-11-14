import { ArrowUpRight } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border-subtle bg-surface-2 p-4", className)}>
      <p className="text-[12px] text-text-muted">{label}</p>
      <p className="num mt-1 text-[20px] font-bold text-text-primary">{value}</p>
      {hint ? <p className="mt-0.5 text-[12px] leading-4 text-text-muted">{hint}</p> : null}
    </div>
  );
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="max-w-[720px]">
      <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.02em] text-text-primary md:text-[40px]">{title}</h1>
      {children ? <p className="mt-2 text-[16px] leading-6 text-text-secondary">{children}</p> : null}
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[var(--container-app)] space-y-6 px-4 pb-16 pt-8 md:px-8", className)}>{children}</div>;
}

export function ExplorerLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#b79bff] underline-offset-2 hover:text-[#d0bdff] hover:underline">
      {children}
      <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  );
}

/** "3 min ago" from unix seconds. */
export function timeAgo(seconds: number, now: number): string {
  const diff = Math.max(0, now - seconds);
  if (diff < 90) return `${diff}s ago`;
  if (diff < 5_400) return `${Math.round(diff / 60)} min ago`;
  if (diff < 129_600) return `${Math.round(diff / 3_600)} h ago`;
  return `${Math.round(diff / 86_400)} d ago`;
}

export function mmss(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A tile with a soft spotlight that follows the pointer. */
export function Tile({ icon, title, children, className }: { icon?: ReactNode; title: string; children?: ReactNode; className?: string }) {
  function move(e: MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  }
  return (
    <div onMouseMove={move} className={cn("kova-tile group relative overflow-hidden rounded-2xl border border-border-subtle bg-surface-2 p-6", className)}>
      {icon ? <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-accent-line bg-accent-soft text-[#c3a9ff]">{icon}</span> : null}
      <h3 className="font-display text-[18px] font-bold text-text-primary">{title}</h3>
      <div className="mt-2 text-[15px] leading-6 text-text-secondary">{children}</div>
    </div>
  );
}

/** A section title with a small label above it. */
export function SectionTitle({ label, title }: { label: string; title: string }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#b79bff]">{label}</p>
      <h2 className="mt-1 font-display text-[30px] font-bold tracking-[-0.02em] text-text-primary md:text-[36px]">{title}</h2>
    </div>
  );
}
