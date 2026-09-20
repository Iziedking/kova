import { formatAnsemRaw } from "@/lib/format";
import type { RecentShowdown } from "@/types/social";
import { PlayerAvatar } from "./player-avatar";

/** Winner vs loser, the table, and what the winner took. Green is the win, per market-semantics. */
export function RecentShowdownRow({ showdown }: { showdown: RecentShowdown }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <PlayerAvatar username={showdown.winner} src={showdown.winnerAvatarUrl} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium leading-5 text-text-primary">
          {showdown.winner} <span className="font-normal text-text-secondary">vs {showdown.loser}</span>
        </p>
        <p className="truncate text-[12px] leading-4 text-text-muted">{showdown.tableName}</p>
      </div>
      <div className="shrink-0 text-right leading-tight">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-success">{showdown.winner} wins</p>
        <p className="num text-[14px] font-semibold text-success">+{formatAnsemRaw(showdown.payoutAnsemRaw)}</p>
      </div>
    </div>
  );
}
