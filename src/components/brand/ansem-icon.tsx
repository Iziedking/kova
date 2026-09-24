import { cn } from "@/lib/cn";

/** The ANSEM stake chip: a small violet coin. Purely a label glyph, never a live balance. */
export function AnsemIcon({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn("shrink-0", className)}>
      <circle cx="12" cy="12" r="11" fill="#1a1428" stroke="#9b6cff" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="7.6" stroke="#c3a9ff" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2.4 2.2" />
      <path d="M12 6.6c.4 3.2 1.5 4.7 3.3 5.4-1.8.7-2.9 2.2-3.3 5.4-.4-3.2-1.5-4.7-3.3-5.4 1.8-.7 2.9-2.2 3.3-5.4Z" fill="#c3a9ff" />
    </svg>
  );
}
