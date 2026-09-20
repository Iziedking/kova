import { CandlestickChart, Eye } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CompetitionMode } from "@/types/competition";

function hash(value: string): number {
  let out = 2166136261;
  for (const char of value) out = Math.imul(out ^ char.charCodeAt(0), 16777619) >>> 0;
  return out;
}

const HUES = [268, 292, 248, 210, 330, 176];

/**
 * A table's cover tile. There is no artwork for user-created tables, so the tile
 * is a deterministic tinted composition with the mode glyph - stable per table
 * and never a claim about the table's contents.
 */
export function TableArt({ seed, mode, className }: { seed: string; mode: CompetitionMode; className?: string }) {
  const hue = HUES[hash(seed) % HUES.length];
  const Icon = mode === "prediction" ? Eye : CandlestickChart;
  return (
    <div
      aria-hidden="true"
      className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-border-subtle", className)}
      style={{
        backgroundImage: `radial-gradient(120% 90% at 20% 0%, hsl(${hue} 70% 32% / 0.85), transparent 60%), linear-gradient(160deg, hsl(${hue} 45% 14%), hsl(${hue} 30% 8%))`,
      }}
    >
      <span
        className="absolute inset-0 opacity-[0.16]"
        style={{ backgroundImage: "repeating-linear-gradient(115deg, #fff 0 1px, transparent 1px 11px)" }}
      />
      <Icon size={34} strokeWidth={1.6} className="relative text-white/80" />
    </div>
  );
}
