import { cn } from "@/lib/cn";
import { PriceChange } from "@/components/markets/price-change";
import { PlayerAvatar } from "@/components/social/player-avatar";
import type { CompetitionStanding } from "@/types/competition";

/**
 * Live standings, ranked by net PnL % - never by dollars (blueprint 18). The
 * viewer's row carries a subtle accent. `standings` is null when the backend
 * doesn't supply a ranking yet, which is shown as such rather than as zeros.
 */
export function MiniLeaderboard({ standings, className }: { standings: CompetitionStanding[] | null; className?: string }) {
  if (!standings || standings.length === 0) {
    return <p className={cn("text-[13px] text-text-secondary", className)}>Standings appear once trades are confirmed.</p>;
  }
  return (
    <ol className={cn("space-y-1", className)} aria-label="Live standings by net PnL percent">
      {standings.map((row) => (
        <li
          key={row.username}
          className={cn("flex items-center gap-3 rounded-lg px-2.5 py-2", row.isViewer && "bg-accent-soft ring-1 ring-inset ring-accent-line")}
        >
          <span className="num w-4 text-center text-[13px] font-semibold text-text-secondary">{row.rank}</span>
          <PlayerAvatar username={row.username} src={row.avatarUrl} size="sm" />
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text-primary">{row.isViewer ? "You" : `@${row.username}`}</span>
          <PriceChange value={row.netPnlPct} className="text-[14px] font-semibold" />
        </li>
      ))}
    </ol>
  );
}
