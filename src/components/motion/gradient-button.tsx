import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The primary action. Carries the brand gradient and a sheen that sweeps on
 * hover, which replaces Rivet's pointer-following buttons: a target that moves
 * under the cursor is unacceptable anywhere near a financial decision, and it is
 * one of Rivet's most recognisable tics.
 */
export function GradientButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`kova-sheen group relative inline-flex min-h-12 items-center justify-center px-8 font-mono text-xs font-bold tracking-[0.14em] text-accent-ink transition-transform duration-300 hover:-translate-y-0.5 ${className}`}
      style={{
        backgroundImage: "linear-gradient(118deg, var(--color-brand-teal), var(--color-brand-cyan) 46%, var(--color-brand-indigo))",
      }}
    >
      <span className="relative z-[2]">{children}</span>
    </Link>
  );
}

/** The quiet counterpart: a hairline button that warms toward the brand on hover. */
export function GhostButton({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-12 items-center justify-center border border-line-strong px-8 font-mono text-xs font-bold tracking-[0.14em] text-ink transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-cyan hover:text-brand-cyan ${className}`}
    >
      {children}
    </Link>
  );
}
