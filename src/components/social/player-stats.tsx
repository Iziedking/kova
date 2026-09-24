import { cn } from "@/lib/cn";
import { formatPct } from "@/lib/format";
import { PriceChange } from "@/components/markets/price-change";
import type { PlayerProfile } from "@/types/social";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-card border border-border-subtle bg-surface-1 px-4 py-3.5">
      <dt className="text-[12px] text-text-secondary">{label}</dt>
      <dd className="num mt-1 text-[24px] font-semibold leading-7 text-text-primary">{children}</dd>
    </div>
  );
}

/** The four numbers above the fold on a profile: matches, wins, trading avg PnL, prediction win rate. */
export function PlayerStats({ stats, className }: { stats: PlayerProfile["stats"]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
      <Stat label="Matches">{stats.matches}</Stat>
      <Stat label="Wins">{stats.wins}</Stat>
      <Stat label="Trading avg PnL">
        <PriceChange value={stats.avgTradingPnlPct} className="text-[24px] font-semibold" />
      </Stat>
      <Stat label="Prediction win rate">{stats.predictionWinRate == null ? "—" : formatPct(stats.predictionWinRate, { digits: 0, signed: false })}</Stat>
    </dl>
  );
}
