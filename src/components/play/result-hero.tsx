import { Crown } from "lucide-react";
import { cn } from "@/lib/cn";
import { AnsemIcon } from "@/components/brand/ansem-icon";
import { PriceChange } from "@/components/markets/price-change";

const CONFETTI = [
  { left: "8%", color: "#9b6cff", delay: 0, size: 8 },
  { left: "18%", color: "#32d69a", delay: 300, size: 6 },
  { left: "28%", color: "#c3a9ff", delay: 120, size: 7 },
  { left: "62%", color: "#9b6cff", delay: 420, size: 7 },
  { left: "74%", color: "#32d69a", delay: 60, size: 8 },
  { left: "86%", color: "#c3a9ff", delay: 260, size: 6 },
  { left: "94%", color: "#9b6cff", delay: 500, size: 6 },
];

/** A handful of falling pieces for a win. Decorative only; hidden from assistive tech. */
function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-56 overflow-hidden">
      {CONFETTI.map((piece, index) => (
        <span
          key={index}
          className="absolute top-0 animate-confetti rounded-[2px]"
          style={{ left: piece.left, width: piece.size, height: piece.size, backgroundColor: piece.color, animationDelay: `${piece.delay}ms` }}
        />
      ))}
    </div>
  );
}

/**
 * The outcome, large but clean (blueprint 13): YOU WON / your place, the return,
 * and the payout - shown only for what the backend reports. A pending payout says
 * pending; it never claims funds arrived.
 */
export function ResultHero({
  outcome,
  headline,
  returnPct,
  payoutLabel,
  payoutNote,
  className,
}: {
  outcome: "won" | "lost" | "spectator";
  headline: string;
  returnPct: number | null;
  payoutLabel?: string | null;
  payoutNote?: string | null;
  className?: string;
}) {
  return (
    <section aria-labelledby="result-title" className={cn("relative flex flex-col items-center pt-6 text-center", className)}>
      {outcome === "won" ? <Confetti /> : null}
      <Crown size={outcome === "won" ? 64 : 44} strokeWidth={1.5} className={outcome === "won" ? "text-accent" : "text-text-muted"} aria-hidden="true" />
      <h1 id="result-title" className="mt-3 font-display text-[44px] font-bold uppercase leading-[48px] tracking-[-0.02em] text-text-primary md:text-[56px] md:leading-[60px]">
        {headline}
      </h1>
      {returnPct !== null ? <PriceChange value={returnPct} digits={1} className="mt-2 text-[44px] font-bold leading-[48px] md:text-[56px] md:leading-[60px]" /> : null}
      {payoutLabel ? (
        <div className="mt-6 inline-flex items-center gap-3 rounded-card border border-accent-line bg-accent-soft px-5 py-3">
          <AnsemIcon size={36} />
          <div className="text-left">
            <p className="num text-[22px] font-semibold leading-6 text-text-primary">{payoutLabel}</p>
            {payoutNote ? <p className="text-[13px] text-text-secondary">{payoutNote}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
