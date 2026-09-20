import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "accent" | "success" | "danger" | "warning" | "outline";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-3 text-text-secondary border-border-subtle",
  accent: "bg-accent-soft text-[#c3a9ff] border-accent-line",
  success: "bg-success-soft text-success border-success/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  outline: "bg-transparent text-text-secondary border-border-strong",
};

export function Badge({
  tone = "neutral",
  icon,
  dot,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  /** A leading status dot (used for Live). */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[12px] font-semibold leading-none",
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot" aria-hidden="true" /> : null}
      {icon ? <span aria-hidden="true" className="shrink-0">{icon}</span> : null}
      {children}
    </span>
  );
}

/** The status pill used on table cards and headers. */
export function LiveBadge({ label = "Live" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success">
      <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
