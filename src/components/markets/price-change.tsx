import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { DIRECTION_TEXT, directionOf, formatPct } from "@/lib/format";

/**
 * A market or PnL percentage. Green/red is reserved for direction, and the sign
 * is always in the text so colour is never the only signal.
 */
export function PriceChange({
  value,
  digits = 1,
  arrow,
  className,
}: {
  value: number | null | undefined;
  digits?: number;
  arrow?: boolean;
  className?: string;
}) {
  const direction = directionOf(value);
  return (
    <span className={cn("num inline-flex items-center gap-0.5 font-medium", DIRECTION_TEXT[direction], className)}>
      {arrow && direction === "up" ? <ArrowUpRight size={14} aria-hidden="true" /> : null}
      {arrow && direction === "down" ? <ArrowDownRight size={14} aria-hidden="true" /> : null}
      {formatPct(value, { digits })}
    </span>
  );
}
