import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
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
