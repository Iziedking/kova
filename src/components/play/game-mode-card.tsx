import { ArrowRight, CandlestickChart, Eye } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CompetitionMode } from "@/types/competition";
import { Button } from "@/components/ui/button";

const COPY: Record<CompetitionMode, { title: string; tagline: string; points: string[]; cta: string }> = {
  prediction: {
    title: "Predict",
    tagline: "Make the better call.",
    points: ["Secretly lock one meme stock", "Timed round, best % move wins", "Stake ANSEM into the pot"],
    cta: "Play Predict",
  },
  trading: {
    title: "Trade",
    tagline: "Make the better trade.",
    points: ["Real trades with real capital", "Live PnL vs your opponent", "Highest net PnL % wins the pot"],
    cta: "Play Trade",
  },
};

/**
 * One of exactly two ways to play (blueprint 9). Selecting a card filters the
 * open tables below; the CTA jumps to them. Trade states plainly that trades are real.
 */
export function GameModeCard({
  mode,
  selected,
  onSelect,
  onPlay,
}: {
  mode: CompetitionMode;
  selected: boolean;
  onSelect: () => void;
  onPlay: () => void;
}) {
  const copy = COPY[mode];
  const Icon = mode === "prediction" ? Eye : CandlestickChart;
  return (
    <div
      className={cn(
        "flex flex-col rounded-panel border p-5 transition-colors duration-[120ms] md:p-6",
        selected ? "border-accent-line bg-accent-soft/60" : "border-border-subtle bg-surface-1 hover:border-border-strong",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex items-start gap-4 text-left outline-offset-4"
      >
        <span
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-xl border",
            mode === "prediction" ? "border-accent-line bg-accent-soft text-[#c3a9ff]" : "border-success/25 bg-success-soft text-success",
          )}
        >
          <Icon size={24} aria-hidden="true" />
        </span>
        <span>
          <span className="block font-display text-[26px] font-bold leading-8 text-text-primary">{copy.title}</span>
          <span className="block text-[15px] text-text-secondary">{copy.tagline}</span>
        </span>
      </button>
      <ul className="my-5 space-y-2 text-[14px] text-text-secondary">
        {copy.points.map((point) => (
          <li key={point} className="flex items-center gap-2.5">
            <span className="h-1 w-1 rounded-full bg-text-muted" aria-hidden="true" />
            {point}
          </li>
        ))}
      </ul>
      <Button className="mt-auto" variant={selected ? "primary" : "secondary"} block iconRight={<ArrowRight size={16} />} onClick={onPlay}>
        {copy.cta}
      </Button>
    </div>
  );
}
