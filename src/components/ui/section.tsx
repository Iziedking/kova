import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SectionHeader({
  title,
  subtitle,
  icon,
  badge,
  action,
  as: Heading = "h2",
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  action?: { label: string; href: string };
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      {icon ? <span className="text-accent" aria-hidden="true">{icon}</span> : null}
      <Heading className="font-display text-[20px] font-bold leading-none tracking-[-0.01em] text-text-primary">{title}</Heading>
      {badge}
      {subtitle ? <p className="hidden text-[14px] text-text-secondary sm:block">{subtitle}</p> : null}
      {action ? (
        <Link
          href={action.href}
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-[#b79bff] transition-colors hover:text-[#d0bdff]"
        >
          {action.label}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/** The standard Kova surface: flat, bordered, no shadow. */
export function Card({
  children,
  className,
  as: Tag = "div",
  interactive,
  selected,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  interactive?: boolean;
  selected?: boolean;
}) {
  return (
    <Tag
      className={cn(
        "rounded-card border bg-surface-1",
        selected ? "border-accent-line bg-accent-soft" : "border-border-subtle",
        interactive && !selected && "transition-colors duration-[120ms] hover:border-border-strong hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
