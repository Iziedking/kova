import { Rocket } from "lucide-react";

/**
 * The integration indicator: small and secondary, never louder than the section
 * title (blueprint 7.2). Names the sponsor integration exactly.
 */
export function PompSourceBadge({ label = "Powered by ClawPump / pump.fun" }: { label?: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border-strong bg-surface-2 px-2.5 text-[12px] font-medium text-text-secondary">
      <span className="grid h-4 w-4 place-items-center rounded-full bg-accent-soft text-accent">
        <Rocket size={10} aria-hidden="true" />
      </span>
      {label}
    </span>
  );
}
